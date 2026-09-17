"""Behavioral guarantees for the physician-authoritative research workflow."""
import time

import pytest

from clintraj.agents.schemas import CandidateAction, PhysicianDecision
from clintraj.domain.clinical_state import ClinicalState, Evidence
from clintraj.domain.problem_manager import ClinicalProblemManager
from clintraj.models.mock import DeterministicMockAdapter
from clintraj.runtime.langgraph_runtime import LangGraphRuntimeAdapter
from clintraj.server.config import settings
from clintraj.server.knowledge import EvidenceBundle, RetrievedEvidence, rerank_pool
from clintraj.server.knowledge_schema import KnowledgeFacets, facet_score
from clintraj.server.pipeline import (
    LiveCoordinator,
    fallback_candidates,
    model_documents,
    record_physician_action,
)
from clintraj.server.simulation import simulate
from clintraj.server.specialties import registry


class EmptyRetriever:
    def retrieve_bundle(self, *args, **kwargs):
        return EvidenceBundle(embedding_model="test")


def state():
    current = ClinicalState(case_ref="synthetic-test", available_evidence=(
        Evidence(evidence_id="E1", text="合成患者：肺炎待查", source="test", available_at=0),))
    manager = ClinicalProblemManager(current)
    manager.create_problem("P1", "肺炎待查", "primary_team", clock=0, rationale="合成测试")
    return manager.into_state(current)


def coordinator(model, events=None):
    return LiveCoordinator(model, lambda *a: events.append(a) if events is not None else None,
                           allow_private=False, retriever=EmptyRetriever())


def test_timeout_still_delivers_three_and_native_stream_events(monkeypatch):
    def slow(_):
        time.sleep(.15)
        raise RuntimeError("unavailable")
    monkeypatch.setattr(settings(), "decision_timeout", .05)
    monkeypatch.setattr(settings(), "triage_timeout", .01)
    monkeypatch.setattr(settings(), "specialist_timeout", .01)
    model = DeterministicMockAdapter({"triage": slow, "action_generator": slow, "specialist": slow})
    events = []
    start = time.monotonic()
    result = coordinator(model, events).propose(state())
    assert time.monotonic() - start < .3
    assert len({a.action for a in result.candidates}) == 3
    assert result.generation_mode == "degraded"
    assert result.selected_candidate_id
    assert any(e[0] == "GRAPH_UPDATE" for e in events)


def test_all_candidates_can_be_accepted_despite_rule_veto_and_retry_is_idempotent():
    model = DeterministicMockAdapter({"action_generator": {"candidates": [
        {"candidate_id": "risk", "action_type": "DISCHARGE_FOLLOWUP", "action": "测试出院方案", "rationale": "测试",
         "problem_id": "P1", "prerequisites": ["unmet"]}]}})
    c = coordinator(model)
    runtime = LangGraphRuntimeAdapter(c, lambda s, a, key: record_physician_action(s, a))
    proposed = runtime.start(state(), "multi-test")
    rec = proposed["recommendation"]
    assert any(f["veto"] for a in rec["safety_assessments"] for f in a["findings"])
    choice = PhysicianDecision(recommendation_id=rec["recommendation_id"], response="ACCEPT",
        physician_ref="test", rationale="test", selected_candidate_ids=tuple(a["candidate_id"] for a in rec["candidates"]))
    result = runtime.resume("multi-test", choice)
    assert result["status"] == "executed"
    assert len(result["clinical_state"]["previous_actions"]) == 3
    assert len(result["clinical_state"]["clinical_graph"]) == 4
    assert runtime.resume("multi-test", choice)["clinical_state"] == result["clinical_state"]


def test_custom_decision_with_bad_graph_metadata_preserves_exact_intent():
    c = coordinator(DeterministicMockAdapter())
    s = state()
    rec = c.propose(s)
    action = CandidateAction(candidate_id="custom", action="医生自填处置", rationale="医生判断",
        action_type="TRANSFER", specialty=None, problem_id="does-not-exist")
    decision = PhysicianDecision(recommendation_id=rec.recommendation_id, response="MODIFY",
        physician_ref="test", rationale="test", modified_action=action)
    review = c.review(s, rec, decision)
    assert review.approved
    recorded = record_physician_action(s, review.action)
    assert recorded.previous_actions[-1] == action.action
    assert recorded.current_management_ownership == s.current_management_ownership
    assert recorded.clock == s.clock + 1


def test_simulator_receives_only_accepted_actions_and_marks_provenance():
    received = []
    def simulate_response(request):
        received.append(request.payload)
        return {"text": "模拟查体：双肺呼吸音粗。"}
    model = DeterministicMockAdapter({"evidence_simulator": simulate_response})
    evidence = simulate(state(), ["复查肺部体征"], "run-test", model=model)
    assert received[0]["accepted_actions"] == ["复查肺部体征"]
    assert "candidates" not in received[0]
    assert evidence.synthetic and evidence.source == "simulated_model"
    assert evidence.provenance["run_id"] == "run-test"
    assert evidence.available_at == state().clock
    assert "非真实" in evidence.text


def test_model_triage_can_route_multiple_or_zero_specialists():
    for selected in [[], ["copd", "pneumonia", "oncology"]]:
        events = []
        c = coordinator(DeterministicMockAdapter({"triage": {"summary": "合成摘要", "specialties": selected}}), events)
        result = c.propose(state())
        assert {a.specialty for a in result.specialist_advice} == set(selected)
        assert next(e for e in events if e[0] == "ROUTING_COMPLETED")[2]["specialties"] == tuple(selected)


def test_shared_facets_rank_differently_by_task():
    facets = KnowledgeFacets(dimensions=("pathology", "staging", "biomarker"), annotation_method="curated")
    profiles = registry().specialists
    assert facet_score(facets.model_dump(), profiles["oncology"]) > facet_score(facets.model_dump(), profiles["pneumonia"])


def test_reject_and_invalid_selection_contract():
    with pytest.raises(ValueError):
        PhysicianDecision(recommendation_id="r", response="REJECT", physician_ref="d", rationale="r", selected_candidate_ids=("A",))
    c = coordinator(DeterministicMockAdapter())
    s = state()
    rec = c.propose(s)
    outcome = c.review(s, rec, PhysicianDecision(recommendation_id=rec.recommendation_id,
        response="REJECT", physician_ref="test", rationale="test"))
    assert not outcome.approved and not outcome.actions


def test_layer_quota_and_citation_identity_survive_specialty_reordering():
    def item(index, corpus):
        return RetrievedEvidence(citation_id=f"cite-{index}", source_id="s", source="Synthetic source",
            version="1", citation="test", license="test", document_id="d", chunk_id=f"chunk-{index}",
            concept_ids=(), content_sha256="test", text="Synthetic text", corpus=corpus, kind="test",
            score=1 / (index + 1), channels=("dense",))
    ordered = [item(i, "public") for i in range(20)] + [item(20, "synthetic_history")]
    pool = rerank_pool(ordered, 12)
    assert len(pool) == 12 and len({e.chunk_id for e in pool}) == 12
    assert pool[6].corpus == "synthetic_history"
    bundle = EvidenceBundle(public=tuple(ordered[:2]), historical=(ordered[-1],), embedding_model="test")
    aliases = {e.citation_id: f"K{i + 1}" for i, e in enumerate(bundle.items)}
    reordered = bundle.model_copy(update={"public": tuple(reversed(bundle.public))})
    assert [e["citation_id"] for e in model_documents(reordered, aliases)] == ["K2", "K1", "K3"]


def test_model_ids_cannot_collide_with_three_candidate_recovery():
    s = state()
    candidate = fallback_candidates(s)[1].model_copy(update={"candidate_id": "fallback-3"})
    result = coordinator(DeterministicMockAdapter({"action_generator": {
        "candidates": [candidate.model_dump(mode="json")]}})).propose(s)
    assert len({c.action for c in result.candidates}) == 3
    assert len({c.candidate_id for c in result.candidates}) == 3
