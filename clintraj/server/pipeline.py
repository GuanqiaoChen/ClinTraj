"""Deadline-bounded proposals; advisory audits never suppress physician choices."""
from importlib.resources import files
from time import monotonic
from typing import Any, TypedDict
from uuid import uuid4

from langgraph.graph import END, START, StateGraph
from pydantic import Field

from clintraj.agents.base import RoleAgent, StructuredOutputError
from clintraj.agents.coordinator import ClinicalCoordinator, state_fingerprint
from clintraj.agents.schemas import (
    ActionGeneration,
    CandidateAction,
    Message,
    PhysicianResponse,
    Recommendation,
    ReviewOutcome,
    SafetyAssessment,
    SafetyFinding,
    SafetyReview,
    SpecialistAdvice,
)
from clintraj.domain.action_types import ActionType
from clintraj.domain.clinical_state import ClinicalState
from clintraj.domain.problem_manager import ClinicalProblemManager, apply_candidate

from .budget import bounded, submit
from .config import settings
from .knowledge import EvidenceBundle, HybridRetriever
from .specialties import fallback_routes, registry

OUTPUT_LANGUAGE = "自由文本使用简体中文；字段、枚举、证据和引用编号保持原样。只给简洁理由，不输出思维链。"


class Triage(Message):
    summary: str
    differential: tuple[str, ...] = ()
    specialties: tuple[str, ...] = ()
    routing_reason: str = ""
    risk_flags: tuple[str, ...] = ()
    uncertainty: tuple[str, ...] = ()


class GroundedClaims(Message):
    candidate_citations: dict[str, tuple[str, ...]] = Field(default_factory=dict)
    limitations: tuple[str, ...] = ()


class DecisionDraft(ActionGeneration):
    candidate_citations: dict[str, tuple[str, ...]] = Field(default_factory=dict)


def model_documents(bundle, aliases=None):
    return [{"citation_id": aliases[e.citation_id] if aliases else f"K{i + 1}", "title": e.source, "kind": e.kind,
             "corpus": e.corpus, "text": e.text[:1200], "review_status": e.review_status,
             "source_qualified_relations": e.medical_relations}
            for i, e in enumerate(bundle.items)]


def expand_citations(grounding, bundle):
    aliases = {f"K{i + 1}": e.citation_id for i, e in enumerate(bundle.items)}
    return GroundedClaims(candidate_citations={c: tuple(aliases.get(ref, ref) for ref in refs)
        for c, refs in grounding.candidate_citations.items()}, limitations=grounding.limitations)


def patient_reference_aliases(value, references):
    if isinstance(value, list):
        return [patient_reference_aliases(item, references) for item in value]
    if not isinstance(value, dict):
        return value
    return {key: references.get(item, item) if key == "evidence_id" else
        [references.get(ref, ref) for ref in item] if key in {"evidence_ids", "patient_evidence_ids"} else
        patient_reference_aliases(item, references) for key, item in value.items()}


def fallback_candidates(state: ClinicalState) -> tuple[CandidateAction, ...]:
    problem = next(iter(state.active_problems), None)
    label = problem.label if problem else "当前临床问题"
    return tuple(CandidateAction(candidate_id=f"fallback-{i}", action_type=kind,
        action=action, rationale="限时备用方案：详细模型分析未完成，由医生结合当前资料选择或自行输入。",
        evidence_ids=tuple(e.evidence_id for e in state.available_evidence),
        problem_id=problem.problem_id if problem else None,
        uncertainty=("尚未获得本轮完整模型分析。",))
        for i, (kind, action) in enumerate((
            (ActionType.REASSESS, f"立即复评{label}的当前状态、生命体征与处置优先级"),
            (ActionType.ASK_HISTORY, f"补充{label}相关病程、既往史、用药和过敏信息"),
            (ActionType.EXAM, f"围绕{label}补充针对性查体，确定下一项检查需求")), 1))


def record_physician_action(state: ClinicalState, action: CandidateAction) -> ClinicalState:
    """Record exact intent; invalid graph metadata becomes a reassessment, never a fake transfer."""
    try:
        updated = apply_candidate(state, action)
    except ValueError:
        manager = ClinicalProblemManager(state)
        refs = tuple(e for e in action.evidence_ids if e in {v.evidence_id for v in state.available_evidence})
        reason = f"记录医生决策：{action.action}；{action.rationale}（图关系待核对）"
        problem = next(iter(state.active_problems), None)
        if problem:
            manager.update_problem(problem.problem_id, clock=state.clock + 1,
                rationale=reason, evidence_ids=refs, action_type=ActionType.REASSESS)
        else:
            manager.create_problem(f"P-{uuid4().hex[:10]}", "医生自主决策", "primary_team",
                clock=state.clock + 1, rationale=reason, evidence_ids=refs)
        updated = manager.into_state(state, clock=state.clock + 1)
    return ClinicalState.model_validate(updated.model_dump() | {
        "previous_actions": (*state.previous_actions, action.action)})


class ProposalState(TypedDict, total=False):
    stage: str


class LiveCoordinator(ClinicalCoordinator):
    def __init__(self, model, emit, *, allow_private: bool, retriever=None):
        super().__init__(model)
        self.agents["triage"] = RoleAgent("triage", model, files("configs.prompts"))
        self.emit = emit
        self.allow_private = allow_private
        self.hybrid = retriever or HybridRetriever()
        self.bundle = EvidenceBundle(embedding_model=settings().embedding_model)
        self.invoked: list[str] = []

    def warning(self, agent, code, **detail):
        self.emit("SAFETY_WARNING", agent, {"code": code, "policy": "advisory", **detail})

    def _call(self, name, payload, schema):
        aliases = {e["evidence_id"]: f"E{i + 1}" for i, e in enumerate(
            payload.get("state", {}).get("available_evidence", []))}
        encoded = {**patient_reference_aliases(payload, aliases), "output_language": OUTPUT_LANGUAGE}
        if name == "safety_critic":
            encoded["required_json_shape"] = {"assessments": [
                {"candidate_id": c["candidate_id"], "findings": []} for c in payload["candidates"]], "uncertainty": []}
            encoded["schema_reminder"] = "Each assessment contains only candidate_id and findings. Each finding contains only code, explanation, veto. No severity, rationale, safety_status or recommendation keys."
        result = self.agents[name].run(encoded, schema)
        return schema.model_validate(patient_reference_aliases(result.model_dump(mode="json"),
            {alias: original for original, alias in aliases.items()}))

    def role(self, name, payload, schema, timeout):
        self.invoked.append(name)
        self.emit("AGENT_STARTED", name, {})
        try:
            value = bounded(self._call, timeout, name, payload, schema)
            self.emit("AGENT_COMPLETED", name, {})
            return value
        except Exception as exc:
            self.warning(name, "role_unavailable", error_type=type(exc).__name__,
                **({"schema_error": str(exc)} if isinstance(exc, StructuredOutputError) else {}))
            return None

    def review(self, state, recommendation, decision):
        if decision.recommendation_id != recommendation.recommendation_id or recommendation.state_fingerprint != state_fingerprint(state):
            return ReviewOutcome(approved=False, reason="Recommendation or clinical state changed")
        if decision.response == PhysicianResponse.REJECT:
            return ReviewOutcome(approved=False, reason="医生拒绝全部候选方案。")
        if decision.response == PhysicianResponse.MODIFY:
            actions = (decision.modified_action,)
        else:
            ids = decision.selected_candidate_ids or (recommendation.selected_candidate_id,)
            by_id = {a.candidate_id: a for a in recommendation.candidates}
            if not ids or any(i not in by_id for i in ids):
                return ReviewOutcome(approved=False, reason="Unknown selected candidate")
            actions = tuple(by_id[i] for i in ids)
        for action in actions:
            for finding in self.safety.evaluate(state, action).findings:
                self.warning("physician_review", finding.code, candidate_id=action.candidate_id,
                    explanation=finding.explanation, would_veto=finding.veto)
        return ReviewOutcome(approved=True, action=actions[0], actions=actions,
                             reason="已记录医生选择；规则意见仅用于观察与研究。")

    def audit(self, state, recommendation):
        """Independent critic runs after publication and never mutates candidates."""
        critique = self.role("safety_critic", {"state": self._visible_payload(state),
            "candidates": [c.model_dump(mode="json") for c in recommendation.candidates],
            "retrieved_documents": model_documents(self.bundle)}, SafetyReview, settings().audit_timeout)
        if critique:
            ids = {c.candidate_id for c in recommendation.candidates}
            for assessment in critique.assessments:
                if assessment.candidate_id not in ids:
                    self.warning("safety_critic", "unknown_audit_candidate")
                    continue
                for finding in assessment.findings:
                    self.warning("safety_critic", finding.code, candidate_id=assessment.candidate_id,
                        explanation=finding.explanation, would_veto=finding.veto)
        self.emit("AUDIT_COMPLETED", "safety_critic", {"policy": "advisory"})

    def propose(self, state: ClinicalState) -> Recommendation:
        state = ClinicalState.model_validate(state.model_dump())
        start = monotonic()
        deadline = start + settings().decision_timeout
        context: dict[str, Any] = {"state": self._visible_payload(state)}
        triage = Triage(summary="待分诊")
        routes: tuple[str, ...] = ()
        advice: list[SpecialistAdvice] = []
        draft: DecisionDraft | None = None
        assessments = []
        candidates: tuple[CandidateAction, ...] = ()
        citations: dict[str, tuple[str, ...]] = {}

        def remaining():
            return max(.001, deadline - monotonic())

        def triage_node(_):
            nonlocal triage, routes
            profiles = registry()
            context["available_specialists"] = {k: p.model_dump(mode="json") for k, p in profiles.specialists.items()}
            triage = self.role("triage", context, Triage, min(remaining(), settings().triage_timeout))
            if triage is None:
                text = " ".join([*(p.label for p in state.active_problems), *(e.text for e in state.available_evidence)])
                triage = Triage(summary=text[:1800], specialties=fallback_routes(text), routing_reason="主分诊限时备用路由")
            routes = tuple(dict.fromkeys(s for s in triage.specialties if s in profiles.specialists))
            context["triage"] = triage.model_dump(mode="json")
            self.emit("ROUTING_COMPLETED", "triage", {"specialties": routes,
                "reason": triage.routing_reason, "registry_version": profiles.version})
            return {"stage": "triage"}

        def retrieve_node(_):
            self.emit("AGENT_STARTED", "retrieval", {})
            try:
                self.bundle = bounded(self.hybrid.retrieve_bundle,
                    min(remaining(), settings().retrieval_timeout), triage.summary[:3500],
                    allow_private=self.allow_private, exclude_document_ids=(state.case_ref,), specialties=routes)
            except Exception as exc:
                self.warning("retrieval", "retrieval_unavailable", error_type=type(exc).__name__)
                self.bundle = EvidenceBundle(embedding_model=settings().embedding_model,
                    limitations=("本轮知识检索未完成，候选方案没有检索证据背书。",))
            context["retrieved_documents"] = model_documents(self.bundle)
            self.emit("RETRIEVAL_COMPLETED", "retrieval", {"channels": self.bundle.channels,
                "public_count": len(self.bundle.public), "historical_count": len(self.bundle.historical),
                "limitations": self.bundle.limitations, "retrieval_metadata": self.bundle.retrieval_metadata})
            self.emit("AGENT_COMPLETED", "retrieval", {})
            return {"stage": "retrieval"}

        def specialty_node(_):
            end = monotonic() + min(remaining(), settings().specialist_timeout)
            futures = {}
            for specialty in routes:
                self.emit("AGENT_STARTED", specialty, {})
                self.invoked.append("specialist")
                profile = registry().specialists[specialty]
                documents = self.hybrid.select_for_specialty(self.bundle, specialty) if hasattr(self.hybrid, "select_for_specialty") else self.bundle
                try:
                    futures[specialty] = submit(self._call, "specialist", {**context,
                        "specialty": specialty, "task_profile": profile.model_dump(mode="json"),
                        "retrieved_documents": model_documents(documents, {
                            e.citation_id: f"K{i + 1}" for i, e in enumerate(self.bundle.items)}), "candidates": [],
                        "instruction": "按任务维度评估当前证据与缺失信息；candidate_ids 留空；禁止假定检查已完成。"}, SpecialistAdvice)
                except TimeoutError:
                    self.warning(specialty, "capacity_exhausted")
            for specialty, future in futures.items():
                try:
                    result = future.result(timeout=max(.001, end - monotonic()))
                    if result.specialty == specialty:
                        advice.append(result.model_copy(update={"candidate_ids": (), "evidence_ids": tuple(
                            ref for ref in result.evidence_ids if ref in {e.evidence_id for e in state.available_evidence})}))
                    self.emit("AGENT_COMPLETED", specialty, {"advice": result.advice})
                except Exception as exc:
                    future.cancel()
                    self.warning(specialty, "specialist_unavailable", error_type=type(exc).__name__)
            context["specialist_advice"] = [a.model_dump(mode="json") for a in advice]
            return {"stage": "specialists"}

        def generate_node(_):
            nonlocal draft, candidates
            draft = self.role("action_generator", {**context,
                "instruction": "必须给出3个不同的下一步候选决策，供医生单选或多选。只使用当前患者证据。candidate_citations 将候选映射到确实支持它的 K 编号，没有支持则为空。不要因规则、资料不全或检索空而拒绝生成；说明不确定性即可。"},
                DecisionDraft, remaining())
            unique: list[CandidateAction] = []
            for candidate in list(draft.candidates if draft else ()):
                if candidate.action.strip().casefold() not in {a.action.strip().casefold() for a in unique} and candidate.candidate_id not in {a.candidate_id for a in unique}:
                    unique.append(candidate)
                if len(unique) == 3:
                    break
            for candidate in fallback_candidates(state):
                if len(unique) == 3:
                    break
                if candidate.action.strip().casefold() in {a.action.strip().casefold() for a in unique}:
                    continue
                if candidate.candidate_id in {a.candidate_id for a in unique}:
                    candidate = candidate.model_copy(update={"candidate_id": f"fallback-{uuid4().hex}"})
                unique.append(candidate)
            candidates = tuple(unique)
            self.emit("ACTION_PROPOSED", "action_generator", {"candidate_ids": [a.candidate_id for a in candidates]})
            return {"stage": "candidates"}

        def audit_node(_):
            nonlocal candidates, citations
            documents = {e.citation_id: e for e in self.bundle.items}
            mapping = expand_citations(GroundedClaims(candidate_citations=draft.candidate_citations if draft else {}), self.bundle)
            normalized, repairs = self.normalize(state, candidates)
            sanitized = []
            for candidate in normalized:
                findings = list(repairs.get(candidate.candidate_id, ()))
                findings.extend(self.safety.evaluate(state, candidate).findings)
                refs = mapping.candidate_citations.get(candidate.candidate_id, ())
                if set(refs) - documents.keys():
                    findings.append(SafetyFinding(code="fabricated_citation", explanation="无效知识引用已移除。"))
                citations[candidate.candidate_id] = tuple(dict.fromkeys(r for r in refs if r in documents))
                if not citations[candidate.candidate_id]:
                    findings.append(SafetyFinding(code="insufficient_public_grounding", explanation="本轮未检索到直接支持此候选的公开资料。"))
                sanitized.append(candidate.model_copy(update={"evidence_ids": tuple(r for r in candidate.evidence_ids if r in {e.evidence_id for e in state.available_evidence})}))
                assessments.append(SafetyAssessment(candidate_id=candidate.candidate_id, findings=tuple(findings)))
                for finding in findings:
                    self.warning("safety_critic", finding.code, candidate_id=candidate.candidate_id,
                        explanation=finding.explanation, would_veto=finding.veto)
            candidates = tuple(sanitized)
            return {"stage": "advisory_audit"}

        builder: StateGraph[ProposalState, None, ProposalState, ProposalState] = StateGraph(ProposalState)
        nodes = [("triage", triage_node), ("retrieval", retrieve_node),
                 ("specialists", specialty_node), ("candidates", generate_node), ("advisory_audit", audit_node)]
        previous = START
        for name, node in nodes:
            builder.add_node(name, node)
            builder.add_edge(previous, name)
            previous = name
        builder.add_edge(previous, END)
        for mode, update in builder.compile().stream(ProposalState(stage="start"), stream_mode=["updates", "custom"]):
            self.emit("GRAPH_UPDATE", "langgraph", {"stream_mode": mode, "nodes": list(update),
                "elapsed_ms": round((monotonic() - start) * 1000)})
        ranked = self.policy.rank(candidates)
        preferred = next((r.candidate_id for r in ranked if not r.candidate_id.startswith("fallback-")), ranked[0].candidate_id)
        cited = tuple(dict.fromkeys(r for refs in citations.values() for r in refs))
        documents = {e.citation_id: e for e in self.bundle.items}
        roles = tuple(dict.fromkeys(self.invoked))
        return Recommendation(recommendation_id=uuid4().hex, state_fingerprint=state_fingerprint(state),
            candidates=candidates, selected_candidate_id=preferred,
            rankings=ranked, safety_assessments=tuple(assessments), specialist_advice=tuple(advice),
            citation_ids=cited, citation_hashes={r: documents[r].content_sha256 for r in cited},
            candidate_citations=citations, proposed_differential=triage.differential,
            inferred_risk_flags=tuple(dict.fromkeys((*state.risk_flags, *triage.risk_flags))),
            explanation="三个候选均可由医生选择；自动校验仅记入观察台。",
            uncertainty=(*triage.uncertainty, *(draft.uncertainty if draft else ()), *self.bundle.limitations),
            roles_invoked=roles, prompt_versions={r: self.agents[r].version for r in roles},
            prompt_hashes={r: self.agents[r].content_sha256 for r in roles},
            model_metadata=self.model.metadata.model_dump(), audit_policy="advisory",
            elapsed_ms=round((monotonic() - start) * 1000),
            generation_mode="model" if all(not a.candidate_id.startswith("fallback-") for a in candidates) else "degraded")
