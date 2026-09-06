from types import SimpleNamespace

import pytest

from clintraj.domain.action_types import ActionType as A
from clintraj.domain.clinical_state import Evidence
from clintraj.domain.decision_graph import ClinicalDecisionGraph
from clintraj.domain.schemas import GoldenEdge, GoldenNode
from clintraj.environment.replay import (
    AlternativeAction,
    PatientReplayEnvironment,
    ReplayMode,
    UnsupportedReplayError,
)
from clintraj.environment.temporal import (
    EvidenceGateError,
    EvidenceRelease,
    TemporalEvidenceGate,
    audit_future_leakage,
)


def reference():
    return ClinicalDecisionGraph(nodes=(
        GoldenNode(case_id="LOCAL-IDENTIFIER", step_id=1, new_evidence="Initial synthetic finding",
                   action_type=A.PROCEDURE, action="Acquire specimen", clinical_rationale="Hidden gold rationale"),
        GoldenNode(case_id="LOCAL-IDENTIFIER", step_id=2, new_evidence="FUTURE SPECIMEN RESULT SENTINEL",
                   action_type=A.PATHOLOGY, action="Review specimen", clinical_rationale="Hidden later rationale"),
    ), edges=(GoldenEdge(child_step_id=1, relation="START"),
              GoldenEdge(parent_step_id=1, child_step_id=2, relation="CONTINUE")))


def test_release_requires_time_and_all_prerequisites():
    e = Evidence(evidence_id="path", text="Synthetic specimen result", available_at=3, source="lab")
    gate = TemporalEvidenceGate((EvidenceRelease(evidence=e, prerequisite_events=frozenset({"biopsy", "lab"})),), case_ref="test")
    gate.complete_event("biopsy", at=1)
    assert gate.available() == ()
    gate.complete_event("lab", at=2)
    assert gate.available() == ()
    gate.complete_event("clock-event", at=3)
    assert gate.available() == (e,)
    with pytest.raises(EvidenceGateError):
        gate.complete_event("back", at=1)
    for invalid in (True, 3.5, -1):
        with pytest.raises(EvidenceGateError):
            gate.complete_event("bad", at=invalid)
    assert gate.clock == 3


def test_reference_labels_and_future_pathology_never_in_initial_state():
    env = PatientReplayEnvironment(reference(), pseudonym_key=b"synthetic-test")
    serialized = env.observe().model_dump_json()
    for forbidden in ("FUTURE", "Hidden", "LOCAL-IDENTIFIER", "Acquire specimen", "Review specimen"):
        assert forbidden not in serialized
    result = env.execute(SimpleNamespace(action_type=A.PROCEDURE, action="Acquire specimen"),
                         execution_id="first", physician_approved=True)
    assert "FUTURE SPECIMEN" in result.model_dump_json()


def test_wrong_same_type_action_and_unapproved_action_do_not_unlock_evidence():
    env = PatientReplayEnvironment(reference(), pseudonym_key=b"synthetic-test")
    wrong = SimpleNamespace(action_type=A.PROCEDURE, action="Unrelated intervention")
    assert env.compare(wrong).action_type_agreement
    with pytest.raises(UnsupportedReplayError):
        env.execute(wrong, execution_id="wrong", physician_approved=True)
    with pytest.raises(PermissionError):
        env.execute(SimpleNamespace(action_type=A.PROCEDURE, action="Acquire specimen"),
                    execution_id="unapproved", physician_approved=False)
    assert env.completed_steps == 0
    assert len(env.observe().available_evidence) == 1


def test_explicit_alternative_and_idempotent_execution():
    alternative = AlternativeAction(step_id=1, action_type=A.PROCEDURE, action="Alternate sampling",
        reviewer_ref="reviewer-test", rationale="Observed continuation licensed", observed_continuation_approved=True)
    env = PatientReplayEnvironment(reference(), pseudonym_key=b"synthetic-test",
        mode=ReplayMode.ACCEPTABLE_ALTERNATIVE, alternatives=(alternative,))
    action = SimpleNamespace(action_type=A.PROCEDURE, action="Alternate sampling")
    first = env.execute(action, execution_id="once", physician_approved=True)
    assert env.execute(action, execution_id="once", physician_approved=True) == first
    assert env.completed_steps == 1
    with pytest.raises(ValueError):
        env.execute(SimpleNamespace(action_type=A.PATHOLOGY, action="Review specimen"),
                    execution_id="once", physician_approved=True)


def test_counterfactual_outcomes_are_explicitly_unsupported():
    with pytest.raises(UnsupportedReplayError):
        PatientReplayEnvironment(reference(), pseudonym_key=b"test", mode=ReplayMode.COUNTERFACTUAL)


def test_future_phrase_screen_is_evaluation_only():
    env = PatientReplayEnvironment(reference(), pseudonym_key=b"test")
    future = Evidence(evidence_id="observation-2", text="FUTURE SPECIMEN RESULT SENTINEL", available_at=1, source="fixture")
    report = audit_future_leakage(visible=env.observe(), complete_evidence=(future,),
        generated_text="FUTURE SPECIMEN RESULT SENTINEL", evidence_ids=("observation-2",))
    assert report.exact_future_text_matches == 1
    assert report.unavailable_reference_count == 1
    assert "FUTURE" not in report.model_dump_json()


def test_replay_callback_retry_uses_bound_receipt_before_stale_state_guard():
    env = PatientReplayEnvironment(reference(), pseudonym_key=b"test")
    initial = env.observe()
    action = SimpleNamespace(action_type=A.PROCEDURE, action="Acquire specimen")
    first = env.executor(initial, action, "callback-once")
    assert env.executor(initial, action, "callback-once") == first
    assert env.completed_steps == 1
    with pytest.raises(ValueError, match="changed state"):
        env.executor(first, action, "callback-once")
