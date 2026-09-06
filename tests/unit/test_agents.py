import json

import pytest
from pydantic import ValidationError

from clintraj.agents.base import StructuredOutputError
from clintraj.agents.coordinator import ClinicalCoordinator, RuntimeConfig
from clintraj.agents.safety import SafetyCritic
from clintraj.agents.schemas import CandidateAction, PhysicianDecision, PhysicianResponse
from clintraj.agents.specialists import SpecialistRouter
from clintraj.domain.clinical_state import ClinicalState, Evidence
from clintraj.domain.problem_manager import ClinicalProblemManager
from clintraj.models.base import (
    ExternalJSONAdapter,
    ExternalTransmissionDenied,
    ModelMetadata,
    ModelRequest,
)
from clintraj.models.mock import DeterministicMockAdapter
from clintraj.retrieval.local import EvidenceDocument, LocalEvidenceRetriever


def observed_state(*, risk_flags=(), owner="primary_team"):
    state = ClinicalState(case_ref="synthetic-case", available_evidence=(
        Evidence(evidence_id="E1", text="Synthetic presenting symptom, etiology uncertain.",
                 available_at=0, source="synthetic-fixture"),), risk_flags=risk_flags)
    manager = ClinicalProblemManager()
    manager.create_problem("P1", "Presenting concern", owner, clock=0,
                           rationale="Synthetic initial problem", evidence_ids=("E1",))
    return manager.into_state(state)


def candidate(candidate_id="history", **overrides):
    values = dict(candidate_id=candidate_id, action_type="ASK_HISTORY", action="Clarify symptom chronology.",
                  rationale="Additional current history may reduce uncertainty.", evidence_ids=["E1"],
                  problem_id="P1", relation="CONTINUE")
    return CandidateAction.model_validate(values | overrides)


def model_for(*actions, **roles):
    return DeterministicMockAdapter({"action_generator": {"candidates": [a.model_dump(mode="json") for a in actions]}, **roles})


def test_strict_output_rejects_unknown_field_and_bad_enum():
    with pytest.raises(ValidationError):
        candidate(action_type="PRESCRIBE")
    model = model_for(candidate(), state_interpreter={"summary": "Observation", "invented_hidden_diagnosis": "invalid"})
    with pytest.raises(StructuredOutputError, match="state_interpreter"):
        ClinicalCoordinator(model).propose(observed_state())


def test_future_reference_in_interpretation_fails_closed():
    model = model_for(candidate(), state_interpreter={"summary": "Observation", "evidence_ids": ["future-pathology"]})
    with pytest.raises(StructuredOutputError, match="unavailable"):
        ClinicalCoordinator(model).propose(observed_state())


def test_independent_safety_veto_excludes_high_rank_candidate():
    unsafe = candidate("discharge", action_type="DISCHARGE_FOLLOWUP", assessment={"clinical_benefit": "HIGH", "urgency": "HIGH"})
    safe = candidate("reassess", action_type="REASSESS")
    result = ClinicalCoordinator(model_for(unsafe, safe)).propose(observed_state(risk_flags=("unstable",)))
    assert result.selected_candidate_id == "reassess"
    assert next(a for a in result.safety_assessments if a.candidate_id == "discharge").vetoed
    assert "safety_critic" in result.roles_invoked


def test_model_critic_veto_is_not_overridden_by_arbiter():
    model = model_for(candidate(), safety_critic={"assessments": [{"candidate_id": "history", "findings": [
        {"code": "synthetic-concern", "explanation": "Controlled independent critic veto", "veto": True}]}]})
    result = ClinicalCoordinator(model).propose(observed_state())
    assert result.selected_action is None
    decision = PhysicianDecision(recommendation_id=result.recommendation_id, response="ACCEPT", physician_ref="synthetic-reviewer", rationale="Reviewed")
    assert not ClinicalCoordinator(model).review(observed_state(), result, decision).approved


def test_modify_reruns_safety_and_preserves_interpreted_risk():
    model = model_for(candidate("reassess", action_type="REASSESS"),
        state_interpreter={"summary": "Synthetic flagged observation", "evidence_ids": ["E1"], "risk_flags": ["requires_escalation"]})
    coordinator = ClinicalCoordinator(model)
    state = observed_state()
    result = coordinator.propose(state)
    decision = PhysicianDecision(recommendation_id=result.recommendation_id, response="MODIFY", physician_ref="synthetic-reviewer", rationale="Proposed modification",
        modified_action=candidate("discharge", action_type="DISCHARGE_FOLLOWUP"))
    outcome = coordinator.review(state, result, decision)
    assert not outcome.approved
    assert "premature_discharge" in {f.code for f in outcome.safety.findings}
    assert model.calls.count("safety_critic") == 2


def test_stale_state_cannot_execute_prior_recommendation():
    coordinator = ClinicalCoordinator(model_for(candidate()))
    state = observed_state()
    recommendation = coordinator.propose(state)
    changed = ClinicalState.model_validate(state.model_dump() | {"clock": 1})
    decision = PhysicianDecision(recommendation_id=recommendation.recommendation_id, response=PhysicianResponse.ACCEPT, physician_ref="synthetic-reviewer", rationale="Reviewed")
    assert not coordinator.review(changed, recommendation, decision).approved


def test_modify_schema_requires_action_and_reject_forbids_it():
    with pytest.raises(ValidationError):
        PhysicianDecision(recommendation_id="synthetic-recommendation", response="MODIFY", physician_ref="reviewer", rationale="Reviewed")
    with pytest.raises(ValidationError):
        PhysicianDecision(recommendation_id="synthetic-recommendation", response="REJECT", physician_ref="reviewer", rationale="Reviewed", modified_action=candidate())


def test_specialist_routing_only_explicit_current_context():
    state = observed_state(owner="neurology")
    consult = candidate("consult", action_type="CONSULT", relation="CONSULT", specialty="orthopedics")
    assert SpecialistRouter().route(state, (consult,)) == ("neurology", "orthopedics")
    model = model_for(consult)
    recommendation = ClinicalCoordinator(model).propose(state)
    assert [a.specialty for a in recommendation.specialist_advice] == ["neurology", "orthopedics"]
    assert state.current_management_ownership["P1"] == "neurology"


def test_missing_and_fabricated_citations_cannot_claim_grounding():
    model = model_for(candidate(), grounding={"supported_candidate_ids": ["history"], "citation_ids": ["invented-guideline"]})
    with pytest.raises(StructuredOutputError, match="fabricates"):
        ClinicalCoordinator(model).propose(observed_state())
    model = model_for(candidate(), grounding={"supported_candidate_ids": ["history"], "citation_ids": []})
    with pytest.raises(StructuredOutputError, match="requires"):
        ClinicalCoordinator(model).propose(observed_state())


def test_retrieval_is_temporal_and_citation_hashes_are_recorded():
    document = EvidenceDocument(citation_id="synthetic-source", title="Symptom chronology",
        source="local synthetic fixture, not a clinical guideline", version="1", text="Clarify symptom chronology.")
    future = document.model_copy(update={"citation_id": "future-source", "available_at": 5})
    retriever = LocalEvidenceRetriever((document, future))
    assert [d.citation_id for d in retriever.retrieve("symptom chronology", clock=0)] == ["synthetic-source"]
    model = model_for(candidate(), grounding={"supported_candidate_ids": ["history"], "citation_ids": ["synthetic-source"]})
    result = ClinicalCoordinator(model, retriever=retriever).propose(observed_state())
    assert result.citation_hashes == {"synthetic-source": document.content_sha256}


def test_external_transport_requires_both_explicit_opt_ins():
    calls = []
    request = ModelRequest(role="test", prompt_version="1", instructions="Synthetic", payload={}, output_schema={})

    def transport(payload):
        calls.append(payload.role)
        return "{}"

    metadata = ModelMetadata(provider="custom", model_identifier="test")
    for first, second in [(False, False), (True, False), (False, True)]:
        adapter = ExternalJSONAdapter(transport, metadata, allow_external_calls=first, allow_clinical_data_transmission=second)
        with pytest.raises(ExternalTransmissionDenied):
            adapter.generate(request)
    assert calls == []
    adapter = ExternalJSONAdapter(transport, metadata, allow_external_calls=True, allow_clinical_data_transmission=True)
    assert json.loads(adapter.generate(request)) == {}
    assert calls == ["test"]


def test_information_gain_ablation_changes_ranking_not_evidence_access():
    information = candidate("information", assessment={"information_gain": "HIGH"})
    benefit = candidate("benefit", assessment={"clinical_benefit": "MEDIUM"})
    state = observed_state()
    full = ClinicalCoordinator(model_for(information, benefit)).propose(state)
    ablated = ClinicalCoordinator(model_for(information, benefit), RuntimeConfig(information_gain=False)).propose(state)
    assert full.selected_candidate_id == "information"
    assert ablated.selected_candidate_id == "benefit"
    assert "information_gain" not in ablated.roles_invoked
    assert full.state_fingerprint == ablated.state_fingerprint


def test_single_llm_and_specialist_ablations_change_actual_calls():
    state = observed_state(owner="neurology")
    config = RuntimeConfig(multi_agent=False, retrieval=False)
    model = model_for(candidate())
    result = ClinicalCoordinator(model, config).propose(state)
    assert result.roles_invoked == ("action_generator",)
    config = RuntimeConfig(specialist_routing=False)
    result = ClinicalCoordinator(model_for(candidate()), config).propose(state)
    assert "specialist" not in result.roles_invoked


def test_start_is_valid_and_invalid_return_is_vetoed_before_review():
    state = ClinicalState(case_ref="synthetic-empty")
    result = ClinicalCoordinator(DeterministicMockAdapter()).propose(state)
    assert result.selected_action is not None
    assert result.selected_action.relation.value == "START"
    wrong_return = candidate("return", action_type="REASSESS", relation="RETURN", reintegration_target_id="P1")
    safety = SafetyCritic().evaluate(observed_state(), wrong_return)
    assert safety.vetoed
    assert "invalid_graph_transition" in {f.code for f in safety.findings}


def test_unknown_candidate_and_incomplete_safety_review_fail_closed():
    model = model_for(candidate(), information_gain={"assessments": {"other-candidate": {}}})
    with pytest.raises(StructuredOutputError, match="unknown candidates"):
        ClinicalCoordinator(model).propose(observed_state())
    model = model_for(candidate(), safety_critic={"assessments": []})
    with pytest.raises(StructuredOutputError, match="every candidate"):
        ClinicalCoordinator(model).propose(observed_state())


def test_structured_state_and_ownership_ablations_remove_actual_payload_fields():
    payloads = []

    def response(request):
        payloads.append(request.payload["state"])
        return {"candidates": []}

    model = DeterministicMockAdapter({"action_generator": response})
    ClinicalCoordinator(model, RuntimeConfig(multi_agent=False, retrieval=False, structured_state=False)).propose(observed_state())
    assert set(payloads[-1]) == {"clock", "available_evidence"}
    ClinicalCoordinator(model, RuntimeConfig(multi_agent=False, retrieval=False, explicit_ownership=False, dynamic_graph=False)).propose(observed_state())
    assert "current_management_ownership" not in payloads[-1]
    assert "owner" not in payloads[-1]["active_problems"][0]
    assert "clinical_graph" not in payloads[-1]


def test_model_call_budget_stops_before_unbounded_role_execution():
    model = model_for(candidate())
    with pytest.raises(RuntimeError, match="budget exhausted"):
        ClinicalCoordinator(model, RuntimeConfig(max_model_calls_per_decision=2)).propose(observed_state())
    assert model.calls == ["state_interpreter", "problem_manager"]


def test_recommendation_records_model_and_actual_prompt_artifacts():
    result = ClinicalCoordinator(model_for(candidate())).propose(observed_state())
    assert result.model_metadata["provider"] == "local_fixture"
    assert result.model_metadata["model_version"] == "1.0.0"
    assert set(result.prompt_versions) == set(result.roles_invoked)
    assert set(result.prompt_hashes) == set(result.roles_invoked)
    assert all(len(digest) == 64 for digest in result.prompt_hashes.values())


def test_physician_decision_cannot_approve_a_different_recommendation():
    coordinator = ClinicalCoordinator(model_for(candidate()))
    state = observed_state()
    first = coordinator.propose(state)
    second = coordinator.propose(state)
    decision = PhysicianDecision(recommendation_id=first.recommendation_id, response="ACCEPT",
        physician_ref="synthetic-reviewer", rationale="Reviewed first proposal only")
    assert not coordinator.review(state, second, decision).approved


def test_ownership_ablation_removes_graph_owner_without_removing_graph():
    payloads = []

    def response(request):
        payloads.append(request.payload["state"])
        return {"candidates": []}

    config = RuntimeConfig(explicit_ownership=False, retrieval=False)
    coordinator = ClinicalCoordinator(DeterministicMockAdapter({"action_generator": response}), config)
    result = coordinator.propose(observed_state(owner="neurology"))
    assert len(payloads[-1]["clinical_graph"]) == 1
    assert "owner" not in payloads[-1]["clinical_graph"][0]
    assert "specialist" not in result.roles_invoked
