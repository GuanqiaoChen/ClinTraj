import pytest

from clintraj.agents.coordinator import ClinicalCoordinator
from clintraj.agents.schemas import CandidateAction, PhysicianDecision
from clintraj.domain.clinical_state import ClinicalState, Evidence
from clintraj.domain.problem_manager import apply_candidate
from clintraj.models.mock import DeterministicMockAdapter
from clintraj.runtime.langgraph_runtime import LangGraphRuntimeAdapter


def make_runtime(monkeypatch):
    monkeypatch.delenv("LANGCHAIN_TRACING_V2", raising=False)
    monkeypatch.delenv("LANGSMITH_TRACING", raising=False)
    calls = []

    def executor(state, action, execution_id):
        calls.append(execution_id)
        return apply_candidate(state, action)

    model = DeterministicMockAdapter()
    runtime = LangGraphRuntimeAdapter(ClinicalCoordinator(model), executor)
    state = ClinicalState(case_ref="synthetic-runtime", available_evidence=(Evidence(
        evidence_id="E1", text="Synthetic presenting concern", available_at=0, source="synthetic"),))
    return runtime, state, model, calls


def decision(workflow, response="ACCEPT", **kwargs):
    return PhysicianDecision(recommendation_id=workflow["recommendation"]["recommendation_id"],
        response=response, physician_ref="synthetic-physician", rationale="Synthetic workflow review", **kwargs)


def test_real_checkpoint_interrupt_resume_and_idempotent_execution(monkeypatch):
    runtime, state, model, calls = make_runtime(monkeypatch)
    paused = runtime.start(state, "synthetic-thread")
    assert "__interrupt__" in paused
    assert paused["status"] == "awaiting_physician"
    assert calls == []
    assert runtime.graph.get_state(runtime._config("synthetic-thread")).next == ("physician_review",)
    generations = model.calls.count("action_generator")
    complete = runtime.resume("synthetic-thread", decision(paused))
    assert complete["status"] == "executed"
    assert complete["clinical_state"]["clock"] == 1
    assert len(complete["clinical_state"]["clinical_graph"]) == 1
    assert len(calls) == 1
    assert model.calls.count("action_generator") == generations
    duplicate = runtime.resume("synthetic-thread", decision(paused))
    assert duplicate["status"] == "executed"
    assert len(calls) == 1
    assert runtime.graph.get_state(runtime._config("synthetic-thread")).next == ()


def test_rejection_never_executes(monkeypatch):
    runtime, state, _, calls = make_runtime(monkeypatch)
    paused = runtime.start(state, "reject-thread")
    rejected = runtime.resume("reject-thread", decision(paused, "REJECT"))
    assert rejected["status"] == "rejected"
    assert rejected["clinical_state"]["clock"] == 0
    assert calls == []


def test_modification_is_safety_screened_before_execution(monkeypatch):
    runtime, state, _, calls = make_runtime(monkeypatch)
    paused = runtime.start(state, "modify-thread")
    unsafe = CandidateAction(candidate_id="unsafe-modification", action_type="PROCEDURE",
        action="Synthetic procedure", rationale="Synthetic test only", evidence_ids=("future-pathology",),
        problem_id="P1", relation="START", new_problem_label="New synthetic concern")
    blocked = runtime.resume("modify-thread", decision(paused, "MODIFY", modified_action=unsafe))
    assert blocked["status"] == "blocked"
    assert calls == []


def test_safe_modification_executes_modified_action(monkeypatch):
    runtime, state, _, calls = make_runtime(monkeypatch)
    paused = runtime.start(state, "safe-modify-thread")
    action = CandidateAction.model_validate(paused["recommendation"]["candidates"][0])
    action = CandidateAction.model_validate(action.model_dump() | {
        "action_type": "ASK_HISTORY", "action": "Ask a synthetic follow-up question."})
    complete = runtime.resume("safe-modify-thread", decision(paused, "MODIFY", modified_action=action))
    assert complete["status"] == "executed"
    assert complete["clinical_state"]["clinical_graph"][0]["action_type"] == "ASK_HISTORY"
    assert len(calls) == 1


def test_advance_requires_another_physician_review(monkeypatch):
    runtime, state, _, calls = make_runtime(monkeypatch)
    first = runtime.start(state, "longitudinal-thread")
    with pytest.raises(ValueError, match="Advance"):
        runtime.advance("longitudinal-thread")
    runtime.resume("longitudinal-thread", decision(first))
    second = runtime.advance("longitudinal-thread")
    assert "__interrupt__" in second
    assert len(calls) == 1
    with pytest.raises(ValueError, match="pending recommendation"):
        runtime.resume("longitudinal-thread", decision(first))
    assert runtime.graph.get_state(runtime._config("longitudinal-thread")).next == ("physician_review",)
    completed = runtime.resume("longitudinal-thread", decision(second))
    assert completed["clinical_state"]["clock"] == 2
    assert len(calls) == len(set(calls)) == 2


def test_thread_identity_is_not_silently_reused(monkeypatch):
    runtime, state, _, _ = make_runtime(monkeypatch)
    synthetic = {"recommendation": {"recommendation_id": "nonexistent-proposal"}}
    with pytest.raises(ValueError, match="Unknown"):
        runtime.resume("unknown", decision(synthetic))
    runtime.start(state, "existing")
    with pytest.raises(ValueError, match="already exists"):
        runtime.start(state, "existing")


def test_external_tracing_is_blocked(monkeypatch):
    monkeypatch.setenv("LANGSMITH_TRACING", "true")
    with pytest.raises(PermissionError, match="tracing"):
        LangGraphRuntimeAdapter(ClinicalCoordinator(DeterministicMockAdapter()), apply_candidate)


def test_failed_executor_retries_same_approved_action_and_key(monkeypatch):
    runtime, state, model, _ = make_runtime(monkeypatch)
    attempts = []

    def flaky_executor(observed, action, execution_id):
        attempts.append(execution_id)
        if len(attempts) == 1:
            raise RuntimeError("Synthetic transient executor failure before any side effect")
        return apply_candidate(observed, action)

    runtime.executor = flaky_executor
    paused = runtime.start(state, "retry-thread")
    with pytest.raises(RuntimeError, match="transient"):
        runtime.resume("retry-thread", decision(paused))
    count = len(model.calls)
    completed = runtime.retry_execution("retry-thread")
    assert completed["status"] == "executed"
    assert len(model.calls) == count
    assert len(attempts) == 2 and attempts[0] == attempts[1]
    with pytest.raises(ValueError, match="No approved"):
        runtime.retry_execution("retry-thread")


def test_interpreted_risk_and_differential_persist_after_approval(monkeypatch):
    runtime, state, _, _ = make_runtime(monkeypatch)
    runtime.coordinator.model.responses.update({
        "state_interpreter": {"summary": "Synthetic explicit instability", "evidence_ids": ["E1"],
                              "risk_flags": ["unstable"]},
        "problem_manager": {"differential": ["Undifferentiated synthetic symptom"], "evidence_ids": ["E1"]},
    })
    paused = runtime.start(state, "risk-thread")
    complete = runtime.resume("risk-thread", decision(paused))
    assert "unstable" in complete["clinical_state"]["risk_flags"]
    assert complete["clinical_state"]["differential"] == ["Undifferentiated synthetic symptom"]
