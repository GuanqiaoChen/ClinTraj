"""Single-user localhost service. Durable HITL, isolated observations and resumable SSE."""
import asyncio
import json
import os
from contextlib import asynccontextmanager, contextmanager
from typing import Literal

import httpx
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from langgraph.checkpoint.postgres import PostgresSaver
from pydantic import Field
from sqlalchemy import func, select

from clintraj.agents.base import StructuredOutputError
from clintraj.agents.schemas import PhysicianDecision, Recommendation
from clintraj.domain.clinical_state import ClinicalState, Evidence
from clintraj.domain.problem_manager import ClinicalProblemManager
from clintraj.domain.schemas import StrictModel
from clintraj.environment.temporal import EvidenceRelease, TemporalEvidenceGate
from clintraj.models.openai_compatible import ModelUnavailable, OpenAICompatibleAdapter
from clintraj.runtime.langgraph_runtime import LangGraphRuntimeAdapter

from .config import settings
from .db import (
    DecisionRun,
    HistoricalCase,
    KnowledgeChunk,
    KnowledgeSource,
    PatientEvidence,
    PatientSession,
    TraceRecord,
    db_session,
    uid,
)
from .ingest import SYNTHETIC_CASES
from .knowledge import EvidenceBundle, graph_driver
from .pipeline import LiveCoordinator, record_physician_action
from .simulation import simulate
from .specialties import registry
from .trace import EventType, emitter, event_record


@asynccontextmanager
async def lifespan(app):
    if any(os.getenv(key, "").lower() in {"1", "true", "yes"} for key in (
        "LANGCHAIN_TRACING_V2", "LANGSMITH_TRACING")):
        raise RuntimeError("Disable external tracing before starting the clinical workspace")
    with PostgresSaver.from_conn_string(settings().checkpoint_url) as saver:
        saver.setup()
    # One backend process by design. Interrupted proposals can be retried, never approved implicitly.
    with db_session() as db:
        for session in db.scalars(select(PatientSession).where(PatientSession.status == "simulating")):
            session.status = "ready"
            db.add(event_record(session.id, None, "SAFETY_WARNING", "evidence_simulator", {"code": "simulation_interrupted", "policy": "advisory"}))
        for run in db.scalars(select(DecisionRun).where(DecisionRun.status.in_(["running", "reviewing"]))):
            session = db.get(PatientSession, run.session_id)
            if run.status == "reviewing":
                run.status = "awaiting_physician"
                session.status = "awaiting_physician"
            else:
                run.status, session.status = "failed", "ready"
                run.error = "Server restarted during proposal; run the next decision again."
        db.commit()
    yield


app = FastAPI(title="ClinTraj local physician workspace", version="1.0.0", lifespan=lifespan)


@app.middleware("http")
async def local_origin(request: Request, call_next):
    origin = request.headers.get("origin")
    if origin and origin not in settings().allowed_origins.split(","):
        return JSONResponse({"detail": "Origin is not allowed"}, status_code=403)
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        if request.headers.get("content-type", "").split(";")[0] != "application/json":
            return JSONResponse({"detail": "JSON content type is required"}, status_code=415)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.exception_handler(RequestValidationError)
async def safe_validation(request, exc):
    return JSONResponse(status_code=422, content={"detail": "Invalid request schema",
        "fields": [".".join(map(str, err["loc"])) for err in exc.errors()]})


class NewSession(StrictModel):
    title: str = Field(min_length=1, max_length=160)
    evidence: str = Field(min_length=1, max_length=20000)
    problem: str = Field(min_length=1, max_length=250)
    owner: str = Field(default="primary_team", min_length=1, max_length=80)
    synthetic: bool = False
    simulate_evidence: bool | None = None
    provider: Literal["local", "deepseek"] = "local"
    external_consent: bool = False
    risk_flags: tuple[Literal["unstable", "acute_deterioration", "requires_escalation"], ...] = ()


class AddEvidence(StrictModel):
    text: str = Field(min_length=1, max_length=20000)
    source: str = Field(default="physician_input", min_length=1, max_length=200)
    available_at: int | None = Field(default=None, ge=0, strict=True)
    observed_at: int | None = Field(default=None, ge=0, strict=True)
    prerequisite_events: tuple[str, ...] = ()
    risk_flags: tuple[Literal["unstable", "acute_deterioration", "requires_escalation"], ...] = ()


class AdvanceClock(StrictModel):
    clock: int = Field(ge=0, strict=True)


class ProblemLifecycle(StrictModel):
    operation: Literal["suspend", "resume", "resolve"]
    rationale: str = Field(min_length=1, max_length=2000)


class RiskReview(StrictModel):
    risk_flags: tuple[Literal["unstable", "acute_deterioration", "requires_escalation"], ...]
    rationale: str = Field(min_length=1, max_length=2000)


def get_session(db, session_id: str, *, lock=False):
    query = select(PatientSession).where(PatientSession.id == session_id)
    session = db.scalar(query.with_for_update() if lock else query)
    if session is None:
        raise HTTPException(404, "Session not found")
    return session


def editable(session):
    if session.status in {"running", "reviewing", "awaiting_physician", "simulating"}:
        raise HTTPException(409, "Complete or reject the pending recommendation before changing observations")


def gate_state(db, session, clock: int):
    previous = ClinicalState.model_validate(session.state)
    if clock < previous.clock:
        raise HTTPException(422, "Observation time cannot move backward")
    releases = tuple(EvidenceRelease(evidence=Evidence.model_validate(r.evidence),
                                    prerequisite_events=frozenset(r.prerequisite_events))
        for r in db.scalars(select(PatientEvidence).where(PatientEvidence.session_id == session.id)))
    gate = TemporalEvidenceGate(releases, case_ref=session.id)
    for event in previous.clinical_graph:
        gate.complete_event(event.event_id, at=event.clock)
    gate.complete_event(f"physician-clock-{clock}", at=clock)
    new = ClinicalState.model_validate(previous.model_dump() | {
        "clock": clock, "available_evidence": gate.available()})
    unlocked = {e.evidence_id for e in new.available_evidence} - {e.evidence_id for e in previous.available_evidence}
    session.state = new.model_dump(mode="json")
    if unlocked:
        db.add(event_record(session.id, None, "EVIDENCE_UNLOCKED", "temporal_gate", {"evidence_ids": sorted(unlocked)}))
    return new


def snapshot(db, session):
    runs = list(db.scalars(select(DecisionRun).where(DecisionRun.session_id == session.id).order_by(DecisionRun.created_at.desc())))
    visible = {e["evidence_id"] for e in session.state["available_evidence"]}
    scheduled = [{"id": r.id, "available_at": r.evidence["available_at"],
                  "prerequisite_events": r.prerequisite_events} for r in db.scalars(
        select(PatientEvidence).where(PatientEvidence.session_id == session.id)) if r.id not in visible]
    return {"id": session.id, "title": session.title, "state": session.state,
        "status": session.status, "revision": session.revision, "synthetic": session.synthetic,
        "simulate_evidence": session.simulate_evidence,
        "provider": session.provider, "scheduled_evidence": scheduled,
        "runs": [{"id": r.id, "status": r.status, "recommendation": r.recommendation,
                  "bundle": r.bundle, "error": r.error, "physician_decision": r.physician_decision} for r in runs]}


@app.get("/api/health")
def health():
    with db_session() as db:
        db.execute(select(1))
    graph_driver().verify_connectivity()
    return {"status": "ok", "service": "clintraj", "runtime": "LangGraph + PostgreSQL checkpoints"}


@app.get("/api/config")
def configuration():
    cfg = settings()
    return {"default_provider": "local", "local_model": cfg.local_model_name,
            "deepseek_configured": bool(cfg.deepseek_api_key.get_secret_value()),
            "deepseek_model": cfg.deepseek_model, "allow_external_clinical_data": cfg.allow_external_clinical_data,
            "decision_timeout": cfg.decision_timeout, "simulation_enabled": cfg.simulation_enabled,
            "specialists": registry().model_dump(mode="json"), "audit_policy": "advisory"}


@app.get("/api/models/status")
def model_status():
    try:
        with httpx.Client(timeout=5, trust_env=False) as client:
            response = client.get(settings().local_model_url.rstrip("/") + "/models")
            data = response.json().get("data", [])
        return {"local_ready": any(m.get("id") == settings().local_model_name for m in data)}
    except (httpx.HTTPError, ValueError):
        return {"local_ready": False}


@app.get("/api/knowledge/status")
def knowledge_status():
    with db_session() as db:
        sources = [{"title": s.title, "version": s.version, "corpus": s.corpus,
                    "citation": s.citation, "metadata": s.metadata_json} for s in db.scalars(select(KnowledgeSource))]
        return {"sources": sources, "chunks": db.scalar(select(func.count()).select_from(KnowledgeChunk)),
                "historical_cases": db.scalar(select(func.count()).select_from(HistoricalCase)),
                "bge_m3_indexed": db.scalar(select(func.count()).select_from(KnowledgeChunk).where(
                    KnowledgeChunk.retrieval_model == "BAAI/bge-m3", KnowledgeChunk.embedding_m3.is_not(None))),
                "retrieval_profile": settings().retrieval_profile}


@app.get("/api/synthetic-cases")
def samples():
    return SYNTHETIC_CASES


@app.get("/api/sessions")
def sessions():
    with db_session() as db:
        return [{"id": s.id, "title": s.title, "status": s.status, "provider": s.provider,
                 "synthetic": s.synthetic} for s in db.scalars(select(PatientSession).order_by(PatientSession.created_at.desc()).limit(100))]


@app.post("/api/sessions", status_code=201)
def create_session(body: NewSession):
    simulation = body.simulate_evidence if body.simulate_evidence is not None else body.synthetic
    if simulation and (not body.synthetic or not settings().simulation_enabled):
        raise HTTPException(422, "Simulation requires a synthetic research session")
    try:
        OpenAICompatibleAdapter(settings(), provider=body.provider,
                                synthetic=body.synthetic, consent=body.external_consent)
    except (PermissionError, RuntimeError, ValueError) as exc:
        raise HTTPException(422, str(exc)) from None
    sid, eid = uid(), uid()
    evidence = Evidence(evidence_id=eid, text=body.evidence, available_at=0, source="physician_input", observed_at=0, synthetic=body.synthetic)
    state = ClinicalState(case_ref=sid, available_evidence=(evidence,), risk_flags=body.risk_flags)
    manager = ClinicalProblemManager(state)
    manager.create_problem("P1", body.problem, body.owner, clock=0,
        rationale="Physician opened a management problem from currently available observations.", evidence_ids=(eid,))
    state = manager.into_state(state)
    with db_session() as db:
        session = PatientSession(id=sid, title=body.title, state=state.model_dump(mode="json"),
            provider=body.provider, synthetic=body.synthetic, simulate_evidence=simulation,
            external_consent=body.external_consent)
        db.add(session)
        db.flush()
        db.add(PatientEvidence(id=eid, session_id=sid, evidence=evidence.model_dump(mode="json")))
        db.add(event_record(sid, None, "EVIDENCE_UNLOCKED", "temporal_gate", {"evidence_ids": [eid]}))
        db.add(event_record(sid, None, "PROBLEM_CREATED", "problem_manager", {"problem_id": "P1"}))
        db.commit()
        return snapshot(db, session)


@app.get("/api/sessions/{session_id}")
def session_detail(session_id: str):
    with db_session() as db:
        return snapshot(db, get_session(db, session_id))


@app.post("/api/sessions/{session_id}/evidence")
def add_evidence(session_id: str, body: AddEvidence):
    with db_session() as db:
        session = get_session(db, session_id, lock=True)
        editable(session)
        clock = session.state["clock"]
        available_at = body.available_at if body.available_at is not None else clock
        if available_at < clock:
            raise HTTPException(422, "Backdated releases are not allowed; enter prior history as available now")
        try:
            evidence = Evidence(evidence_id=uid(), text=body.text, source=body.source,
                                available_at=available_at, observed_at=body.observed_at)
        except ValueError:
            raise HTTPException(422, "Observation time must precede availability") from None
        db.add(PatientEvidence(id=evidence.evidence_id, session_id=session_id,
            evidence=evidence.model_dump(mode="json"), prerequisite_events=list(body.prerequisite_events)))
        db.flush()
        state = gate_state(db, session, clock)
        session.state = ClinicalState.model_validate(state.model_dump() | {
            "risk_flags": tuple(dict.fromkeys((*state.risk_flags, *body.risk_flags)))}).model_dump(mode="json")
        session.revision += 1
        db.commit()
        return snapshot(db, session)


@app.post("/api/sessions/{session_id}/unlock")
def unlock(session_id: str, body: AdvanceClock):
    with db_session() as db:
        session = get_session(db, session_id, lock=True)
        editable(session)
        gate_state(db, session, body.clock)
        session.revision += 1
        db.commit()
        return snapshot(db, session)


@app.post("/api/sessions/{session_id}/problems/{problem_id}")
def lifecycle(session_id: str, problem_id: str, body: ProblemLifecycle):
    with db_session() as db:
        session = get_session(db, session_id, lock=True)
        editable(session)
        state = ClinicalState.model_validate(session.state)
        manager = ClinicalProblemManager(state)
        try:
            getattr(manager, body.operation + "_problem")(problem_id, clock=state.clock + 1, rationale=body.rationale)
        except ValueError:
            raise HTTPException(422, "Invalid problem lifecycle transition") from None
        session.state = manager.into_state(state, clock=state.clock + 1).model_dump(mode="json")
        kinds: dict[str, EventType] = {"suspend": "PROBLEM_SUSPENDED", "resume": "PROBLEM_RESUMED", "resolve": "STATE_UPDATED"}
        kind = kinds[body.operation]
        db.add(event_record(session_id, None, kind, "physician", {"problem_id": problem_id, "operation": body.operation}))
        session.revision += 1
        db.commit()
        return snapshot(db, session)


@app.post("/api/sessions/{session_id}/risks")
def risks(session_id: str, body: RiskReview):
    with db_session() as db:
        session = get_session(db, session_id, lock=True)
        editable(session)
        state = ClinicalState.model_validate(session.state)
        evidence = Evidence(evidence_id=uid(), text="Physician risk reassessment: " + body.rationale,
                            source="physician_risk_review", available_at=state.clock)
        db.add(PatientEvidence(id=evidence.evidence_id, session_id=session_id, evidence=evidence.model_dump(mode="json")))
        session.state = ClinicalState.model_validate(state.model_dump() | {
            "risk_flags": body.risk_flags, "available_evidence": state.available_evidence + (evidence,)}).model_dump(mode="json")
        session.revision += 1
        db.add(event_record(session_id, None, "STATE_UPDATED", "physician", {"risk_flags": list(body.risk_flags)}))
        db.commit()
        return snapshot(db, session)


@contextmanager
def runtime_for(session, run_id):
    cfg = settings().model_copy(update={"model_timeout": min(settings().model_timeout, settings().decision_timeout)})
    model = OpenAICompatibleAdapter(cfg, provider=session.provider,
        synthetic=session.synthetic, consent=session.external_consent)
    # Private history never goes to cloud, even when current-patient cloud consent is enabled.
    coordinator = LiveCoordinator(model, emitter(session.id, run_id), allow_private=session.provider == "local")
    with PostgresSaver.from_conn_string(settings().checkpoint_url) as checkpointer:
        yield LangGraphRuntimeAdapter(coordinator, lambda s, a, key: record_physician_action(s, a),
            checkpointer=checkpointer), coordinator


def propose_run(session_id, run_id):
    try:
        with db_session() as db:
            session = get_session(db, session_id)
        with runtime_for(session, run_id) as (runtime, coordinator):
            result = runtime.start(ClinicalState.model_validate(session.state), run_id)
        with db_session() as db:
            session = get_session(db, session_id, lock=True)
            run = db.get(DecisionRun, run_id)
            run.recommendation = result["recommendation"]
            run.bundle = coordinator.bundle.model_dump(mode="json")
            run.status = session.status = "awaiting_physician"
            db.add(event_record(session_id, run_id, "RUN_COMPLETED", "physician_review", {"status": "awaiting_physician"}))
            db.commit()
        # Proposal is already durable and visible. Critic latency cannot delay physician choice.
        try:
            coordinator.audit(ClinicalState.model_validate(session.state), Recommendation.model_validate(result["recommendation"]))
        except Exception:
            emitter(session_id, run_id)("SAFETY_WARNING", "safety_critic", {"code": "audit_unavailable", "policy": "advisory"})
    except Exception as exc:
        # Do not print provider responses, patient payloads, database parameters or credentials.
        with db_session() as db:
            session = get_session(db, session_id, lock=True)
            run = db.get(DecisionRun, run_id)
            run.status, session.status = "failed", "ready"
            run.error = (str(exc) if isinstance(exc, (ModelUnavailable, StructuredOutputError)) else
                f"{type(exc).__name__}: proposal stopped. Check model readiness and knowledge services; retry is safe.")
            db.add(event_record(session_id, run_id, "RUN_FAILED", "runtime", {"error_type": type(exc).__name__}))
            db.commit()


@app.post("/api/sessions/{session_id}/runs", status_code=202)
def start_run(session_id: str, background: BackgroundTasks):
    with db_session() as db:
        session = get_session(db, session_id, lock=True)
        editable(session)
        gate_state(db, session, session.state["clock"])
        run = DecisionRun(id=uid(), session_id=session_id)
        db.add(run)
        session.status = "running"
        db.commit()
        background.add_task(propose_run, session_id, run.id)
        return {"run_id": run.id}


@app.post("/api/sessions/{session_id}/runs/{run_id}/decision")
def decide(session_id: str, run_id: str, decision: PhysicianDecision, background: BackgroundTasks):
    with db_session() as db:
        session = get_session(db, session_id, lock=True)
        run = db.get(DecisionRun, run_id)
        if not run or run.session_id != session_id:
            raise HTTPException(404, "Run not found")
        encoded = decision.model_dump(mode="json")
        if run.physician_decision and run.physician_decision != encoded:
            raise HTTPException(409, "This run already has a different physician decision")
        if run.status in {"executed", "rejected", "blocked"}:
            return snapshot(db, session)
        if run.status != "awaiting_physician" or session.status != "awaiting_physician":
            raise HTTPException(409, "Run is not awaiting review")
        if decision.recommendation_id != run.recommendation["recommendation_id"]:
            raise HTTPException(409, "Recommendation does not match this run")
        recommendation = Recommendation.model_validate(run.recommendation)
        if set(decision.selected_candidate_ids) - {c.candidate_id for c in recommendation.candidates}:
            raise HTTPException(422, "Unknown selected candidate")
        for citation_id, expected_hash in (recommendation.citation_hashes.items() if decision.response.value != "REJECT" else []):
            chunk = db.get(KnowledgeChunk, citation_id)
            if chunk is None or chunk.content_sha256 != expected_hash:
                db.add(event_record(session_id, run_id, "SAFETY_WARNING", "grounding", {
                    "code": "source_changed", "citation_id": citation_id, "policy": "advisory"}))
        run.physician_decision = encoded
        run.status = session.status = "reviewing"
        bundle = run.bundle
        db.commit()
    try:
        with runtime_for(session, run_id) as (runtime, coordinator):
            coordinator.bundle = EvidenceBundle.model_validate(bundle)
            result = runtime.resume(run_id, decision)
        if result.get("status") not in {"executed", "rejected", "blocked"}:
            raise RuntimeError("Physician decision has not completed review")
        with db_session() as db:
            session = get_session(db, session_id, lock=True)
            run = db.get(DecisionRun, run_id)
            if result["status"] == "executed":
                old = ClinicalState.model_validate(session.state)
                new = ClinicalState.model_validate(result["clinical_state"])
                session.state = new.model_dump(mode="json")
                old_ids = {event.event_id for event in old.clinical_graph}
                for event in new.clinical_graph:
                    if event.event_id in old_ids:
                        continue
                    if event.relation.value in {"BRANCH", "START"}:
                        db.add(event_record(session_id, run_id, "PROBLEM_CREATED", "problem_manager", {"problem_id": event.problem_id}))
                    if event.relation.value == "BRANCH":
                        db.add(event_record(session_id, run_id, "BRANCH_CREATED", "problem_manager", {"problem_id": event.problem_id}))
                    if event.relation.value == "RETURN" and event.problem_id in {p.problem_id for p in old.suspended_problems}:
                        db.add(event_record(session_id, run_id, "PROBLEM_RESUMED", "problem_manager", {"problem_id": event.problem_id}))
                    db.add(event_record(session_id, run_id, "NODE_FINALIZED", "clinical_graph", {"event_id": event.event_id,
                        "relation": event.relation.value, "problem_id": event.problem_id, "owner": event.owner}))
                session.revision += 1
            run.status, session.status = result["status"], "ready"
            if result["status"] == "executed" and session.synthetic and session.simulate_evidence:
                session.status = "simulating"
                background.add_task(simulate_run, session_id, run_id)
            run.error = None
            if result["status"] == "blocked":
                run.error = result["review_outcome"]["reason"]
                db.add(event_record(session_id, run_id, "SAFETY_WARNING", "safety_critic", {"code": "physician_action_vetoed", "veto": True}))
            db.add(event_record(session_id, run_id, "PHYSICIAN_DECISION", "physician", {
                "response": decision.response.value, "status": run.status, "physician_ref": decision.physician_ref}))
            db.commit()
            return snapshot(db, session)
    except Exception as exc:
        with db_session() as db:
            session = get_session(db, session_id, lock=True)
            run = db.get(DecisionRun, run_id)
            run.status = session.status = "awaiting_physician"
            db.add(event_record(session_id, run_id, "RUN_FAILED", "physician_review", {"error_type": type(exc).__name__}))
            run.error = str(exc) if isinstance(exc, (StructuredOutputError, ModelUnavailable)) else "Review interrupted; retry the saved decision."
            db.commit()
        raise HTTPException(503, "Review interrupted; retry the same decision to resume safely") from None


def simulate_run(session_id: str, run_id: str):
    emit = emitter(session_id, run_id)
    emit("AGENT_STARTED", "evidence_simulator", {})
    try:
        with db_session() as db:
            session = get_session(db, session_id)
            if not session.synthetic or not session.simulate_evidence:
                return
            state = ClinicalState.model_validate(session.state)
            run = db.get(DecisionRun, run_id)
            decision = PhysicianDecision.model_validate(run.physician_decision)
            rec = Recommendation.model_validate(run.recommendation)
            ids = decision.selected_candidate_ids or (rec.selected_candidate_id,)
            by_id = {a.candidate_id: a.action for a in rec.candidates}
            actions = [decision.modified_action.action] if decision.modified_action else [by_id[i] for i in ids if i is not None]
        observation = simulate(state, actions, run_id)
        with db_session() as db:
            session = get_session(db, session_id, lock=True)
            # Stable evidence ID and locked session make repeated completion idempotent.
            if db.get(PatientEvidence, observation.evidence_id) is None:
                db.add(PatientEvidence(id=observation.evidence_id, session_id=session_id,
                    evidence=observation.model_dump(mode="json")))
                db.flush()
                gate_state(db, session, state.clock)
                session.revision += 1
            session.status = "ready"
            if observation.provenance.get("generation_mode") != "model":
                db.add(event_record(session_id, run_id, "SAFETY_WARNING", "evidence_simulator", {
                    "code": "simulation_unavailable", "policy": "advisory", "provenance": observation.provenance}))
            db.add(event_record(session_id, run_id, "SIMULATION_COMPLETED", "evidence_simulator", {
                "evidence_id": observation.evidence_id, "provenance": observation.provenance}))
            db.commit()
    except Exception as exc:
        with db_session() as db:
            session = get_session(db, session_id, lock=True)
            if session.status == "simulating":
                session.status = "ready"
            db.add(event_record(session_id, run_id, "SAFETY_WARNING", "evidence_simulator", {
                "code": "simulation_failed", "error_type": type(exc).__name__, "policy": "advisory"}))
            db.commit()


@app.get("/api/sessions/{session_id}/events")
async def events(session_id: str, request: Request, after: int = 0,
                 last_event_id: str | None = Header(default=None)):
    with db_session() as db:
        get_session(db, session_id)
    try:
        cursor = max(after, int(last_event_id or 0))
    except ValueError:
        raise HTTPException(422, "Invalid event cursor") from None

    async def stream():
        nonlocal cursor
        ticks = 0
        while not await request.is_disconnected():
            with db_session() as db:
                rows = list(db.scalars(select(TraceRecord).where(TraceRecord.session_id == session_id,
                    TraceRecord.id > cursor).order_by(TraceRecord.id).limit(100)))
            for row in rows:
                cursor = row.id
                yield f"id: {row.id}\nevent: trace\ndata: {json.dumps({'id': row.id, 'run_id': row.run_id, **row.event})}\n\n"
            ticks += 1
            if ticks % 30 == 0:
                yield ": heartbeat\n\n"
            await asyncio.sleep(0.35)
    return StreamingResponse(stream(), media_type="text/event-stream", headers={
        "X-Accel-Buffering": "no", "Cache-Control": "no-cache, no-transform"})
