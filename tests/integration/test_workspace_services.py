"""Opt-in real PostgreSQL/Neo4j/LangGraph integration; fixture model only in tests."""
import os
from contextlib import asynccontextmanager

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from clintraj.data.excel_loader import GOLDEN_CASE_HASHES
from clintraj.models.mock import DeterministicMockAdapter
from clintraj.server.app import app
from clintraj.server.db import HistoricalCase, KnowledgeChunk, TraceRecord, db_session
from clintraj.server.knowledge import HybridRetriever

pytestmark = [pytest.mark.services, pytest.mark.skipif(os.getenv("CLINTRAJ_INTEGRATION") != "1", reason="Set CLINTRAJ_INTEGRATION=1 with seeded local services")]


@pytest.fixture(scope="module")
def client():
    # Services are already migrated/initialized; do not trigger production startup recovery.
    @asynccontextmanager
    async def initialized(application):
        yield
    original = app.router.lifespan_context
    app.router.lifespan_context = initialized
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.router.lifespan_context = original


@pytest.fixture
def model(monkeypatch):
    fake = DeterministicMockAdapter({"grounding": {"candidate_citations": {}, "limitations": []}})
    monkeypatch.setattr("clintraj.server.app.OpenAICompatibleAdapter", lambda *a, **k: fake)
    return fake


def new_session(client, **kwargs):
    response = client.post("/api/sessions", json={"title": "Automated synthetic session", "problem": "Synthetic concern",
        "evidence": "Synthetic fever and cough, no results available.", "synthetic": True, "simulate_evidence": False, **kwargs})
    assert response.status_code == 201
    return response.json()


def proposed(client, sid):
    response = client.post(f"/api/sessions/{sid}/runs", json={})
    assert response.status_code == 202
    snapshot = client.get(f"/api/sessions/{sid}").json()
    assert snapshot["status"] == "awaiting_physician", snapshot["runs"][0]["error"]
    return snapshot["runs"][0]


@pytest.mark.parametrize("case_id", GOLDEN_CASE_HASHES)
def test_five_golden_cases_ingested_without_rewriting(case_id):
    with db_session() as db:
        case = db.get(HistoricalCase, case_id)
        assert case is not None
        assert case.review_status == "review_incomplete"
        assert all(e["parent_step_id"] is None or e["parent_step_id"] < e["child_step_id"] for e in case.graph["edges"])
        assert db.scalar(select(KnowledgeChunk).where(KnowledgeChunk.document_id == case_id)) is not None


def test_real_hybrid_indexes_provenance_and_private_exclusion(monkeypatch):
    from clintraj.server.config import settings
    monkeypatch.setattr(settings(), "retrieval_profile", "legacy")
    bundle = HybridRetriever().retrieve_bundle("fever sepsis infection assessment", allow_private=False)
    assert bundle.public and bundle.historical
    assert all(e.corpus in {"public", "synthetic_history"} for e in bundle.items)
    assert bundle.channels["dense"] and bundle.channels["graph"] and bundle.channels["lexical"]
    assert all(e.version and e.content_sha256 and e.document_id and e.chunk_id for e in bundle.items)
    with db_session() as db:
        indexes = list(db.execute(text("SELECT indexdef FROM pg_indexes WHERE tablename='knowledge_chunks'" )).scalars())
        assert any("hnsw" in i for i in indexes) and any("gin" in i for i in indexes)


def test_patient_temporal_boundary_and_review_immutability(client, model):
    session = new_session(client)
    sid = session["id"]
    future = "SYNTHETIC FUTURE PATHOLOGY SECRET"
    response = client.post(f"/api/sessions/{sid}/evidence", json={"text": future, "available_at": 10, "prerequisite_events": ["event-2"]})
    assert response.status_code == 200 and future not in response.text
    run = proposed(client, sid)
    assert future not in str(run)
    assert client.post(f"/api/sessions/{sid}/evidence", json={"text": "cannot modify pending state"}).status_code == 409
    body = {"recommendation_id": run["recommendation"]["recommendation_id"], "response": "ACCEPT", "physician_ref": "test", "rationale": "reviewed"}
    url = f"/api/sessions/{sid}/runs/{run['id']}/decision"
    accepted = client.post(url, json=body)
    assert accepted.status_code == 200 and len(accepted.json()["state"]["clinical_graph"]) == 2
    assert client.post(url, json=body).json()["state"] == accepted.json()["state"]
    assert client.post(url, json={**body, "response": "REJECT"}).status_code == 409
    released = client.post(f"/api/sessions/{sid}/unlock", json={"clock": 10}).json()
    assert future in str(released["state"]["available_evidence"])
    with db_session() as db:
        events = list(db.scalars(select(TraceRecord).where(TraceRecord.session_id == sid)))
        kinds = {e.event["type"] for e in events}
        assert {"AGENT_STARTED", "RETRIEVAL_COMPLETED", "PHYSICIAN_DECISION", "NODE_FINALIZED"} <= kinds
        assert all("chain_of_thought" not in str(e.event) for e in events)


def test_modify_is_physician_authoritative_and_reject_no_graph_change(client, model):
    sid = new_session(client)["id"]
    run = proposed(client, sid)
    candidate = run["recommendation"]["candidates"][0]
    candidate["action"] = "Physician specified focused reassessment"
    before = len(model.calls)
    response = client.post(f"/api/sessions/{sid}/runs/{run['id']}/decision", json={
        "recommendation_id": run["recommendation"]["recommendation_id"], "response": "MODIFY", "physician_ref": "test",
        "rationale": "Modified after review", "modified_action": candidate})
    assert response.status_code == 200 and response.json()["runs"][0]["status"] == "executed"
    assert not model.calls[before:]  # No model may veto or delay physician intent.
    count = len(response.json()["state"]["clinical_graph"])
    run = proposed(client, sid)
    result = client.post(f"/api/sessions/{sid}/runs/{run['id']}/decision", json={
        "recommendation_id": run["recommendation"]["recommendation_id"], "response": "REJECT", "physician_ref": "test", "rationale": "Not appropriate"})
    assert result.json()["runs"][0]["status"] == "rejected"
    assert len(result.json()["state"]["clinical_graph"]) == count


def test_independent_safety_veto_is_observed_but_does_not_block_acceptance(client, model):
    model.responses["safety_critic"] = lambda request: {"assessments": [{"candidate_id": c["candidate_id"],
        "findings": [{"code": "danger", "explanation": "Synthetic independent veto", "veto": True}]} for c in request.payload["candidates"]]}
    sid = new_session(client)["id"]
    run = proposed(client, sid)
    assert run["recommendation"]["selected_candidate_id"] is not None
    assert len(run["recommendation"]["candidates"]) == 3
    result = client.post(f"/api/sessions/{sid}/runs/{run['id']}/decision", json={
        "recommendation_id": run["recommendation"]["recommendation_id"], "response": "ACCEPT", "physician_ref": "test", "rationale": "Attempted accept"})
    assert result.json()["runs"][0]["status"] == "executed"
    assert len(result.json()["state"]["clinical_graph"]) == 2
    with db_session() as db:
        warnings = list(db.scalars(select(TraceRecord).where(TraceRecord.run_id == run["id"])))
        assert any(e.event["data"].get("would_veto") for e in warnings)


def test_session_isolation_and_origin_boundary(client, model):
    a, b = new_session(client), new_session(client)
    assert a["state"]["case_ref"] != b["state"]["case_ref"]
    assert a["state"]["available_evidence"][0]["evidence_id"] != b["state"]["available_evidence"][0]["evidence_id"]
    assert client.post("/api/sessions", json={}, headers={"origin": "https://untrusted.example"}).status_code == 403


def test_multiple_acceptance_records_each_event_and_synthetic_evidence_once(client, model, monkeypatch):
    from clintraj.domain.clinical_state import Evidence
    calls = []

    def simulate(state, actions, run_id):
        calls.append(actions)
        return Evidence(evidence_id="sim-" + run_id, text="Synthetic follow-up observation", source="simulated_model",
            available_at=state.clock, synthetic=True, provenance={"run_id": run_id, "generation_mode": "test"})

    monkeypatch.setattr("clintraj.server.app.simulate", simulate)
    sid = new_session(client, simulate_evidence=True)["id"]
    run = proposed(client, sid)
    rec = run["recommendation"]
    body = {"recommendation_id": rec["recommendation_id"], "response": "ACCEPT", "physician_ref": "test",
        "rationale": "Synthetic verification", "selected_candidate_ids": [c["candidate_id"] for c in rec["candidates"]]}
    url = f"/api/sessions/{sid}/runs/{run['id']}/decision"
    assert client.post(url, json=body).status_code == 200
    snapshot = client.get(f"/api/sessions/{sid}").json()
    assert len(snapshot["state"]["clinical_graph"]) == 4
    assert len(snapshot["state"]["available_evidence"]) == 2
    assert snapshot["state"]["available_evidence"][-1]["synthetic"]
    assert client.post(url, json=body).json()["state"] == snapshot["state"]
    assert len(calls) == 1 and len(calls[0]) == 3
    with db_session() as db:
        traces = list(db.scalars(select(TraceRecord).where(TraceRecord.run_id == run["id"])))
        assert sum(e.event["type"] == "NODE_FINALIZED" for e in traces) == 3
    assert client.post("/api/sessions", json={"title": "Test only", "problem": "Test",
        "evidence": "No actual patient", "synthetic": False, "simulate_evidence": True}).status_code == 422


def test_medical_graph_requires_real_source_excerpt():
    from clintraj.server.medical_graph import (
        MedicalRelation,
        ingest_relations,
        seed_medical_relations,
    )
    assert seed_medical_relations() == 3
    invalid = MedicalRelation.model_validate({"id": "test-assertion", "head": {"id": "TEST:d", "label": "Test disease", "kind": "disease"},
        "tail": {"id": "TEST:a", "label": "Test action", "kind": "test"}, "relation": "EVALUATED_BY",
        "supporting_chunk_id": "fabricated-chunk", "source_excerpt": "A fabricated clinical relationship excerpt",
        "applicability": "Test only", "curator": "test"})
    with pytest.raises(ValueError, match="exact excerpt"):
        ingest_relations([invalid])


def test_http_branch_consult_transfer_and_forward_return(client, model):
    sid = new_session(client)["id"]

    def apply(action):
        model.responses["action_generator"] = lambda request: {"candidates": [{"candidate_id": "candidate",
            "action": "Synthetic transition for semantic verification", "rationale": "Synthetic physician-reviewed transition",
            "evidence_ids": [request.payload["state"]["available_evidence"][0]["evidence_id"]], **action}]}
        run = proposed(client, sid)
        result = client.post(f"/api/sessions/{sid}/runs/{run['id']}/decision", json={
            "recommendation_id": run["recommendation"]["recommendation_id"], "response": "ACCEPT", "physician_ref": "test", "rationale": "Reviewed"})
        assert result.status_code == 200 and result.json()["runs"][0]["status"] == "executed"
        return result.json()["state"]

    state = apply({"action_type": "REASSESS", "relation": "BRANCH", "problem_id": "P2", "parent_problem_id": "P1", "new_problem_label": "Distinct synthetic concern"})
    assert len(state["active_problems"]) == 2
    state = apply({"action_type": "CONSULT", "relation": "CONSULT", "problem_id": "P2", "specialty": "critical_care"})
    assert state["current_management_ownership"]["P2"] == "primary_team"
    state = apply({"action_type": "TRANSFER", "relation": "TRANSFER", "problem_id": "P2", "specialty": "critical_care"})
    assert state["current_management_ownership"]["P2"] == "critical_care"
    assert client.post(f"/api/sessions/{sid}/problems/P1", json={"operation": "suspend", "rationale": "Pause original concern"}).status_code == 200
    state = apply({"action_type": "REASSESS", "relation": "RETURN", "problem_id": "P2", "reintegration_target_id": "P1"})
    returned = state["clinical_graph"][-1]
    assert returned["problem_id"] == "P1" and returned["relation"] == "RETURN"
    assert set(returned["parent_event_ids"]) == {"event-4", "event-5"}
    assert all(e["clock"] < returned["clock"] for e in state["clinical_graph"][:-1])
    assert state["current_management_ownership"] == {"P1": "primary_team", "P2": "critical_care"}
    assert not state["suspended_problems"]
