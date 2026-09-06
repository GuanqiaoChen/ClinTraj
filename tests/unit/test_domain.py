import pytest
from pydantic import ValidationError

from clintraj.domain.action_types import ActionType as A
from clintraj.domain.clinical_problem import ClinicalProblem, ProblemTransitionError
from clintraj.domain.clinical_state import ClinicalState, Evidence
from clintraj.domain.decision_graph import ClinicalDecisionGraph, GoldenEdge, GoldenNode
from clintraj.domain.problem_manager import ClinicalProblemManager
from clintraj.domain.relation_types import RelationType as R


def node(step):
    return GoldenNode(case_id="synthetic", step_id=step, new_evidence="Synthetic observation",
                      action_type=A.REASSESS, action="Reassess", clinical_rationale="Review observations")


def test_canonical_schemas_reject_unknown_types_and_metadata():
    for changes in ({"action_type": "DIAGNOSE"}, {"timestamp": "tomorrow"}, {"step_id": 1.5}):
        with pytest.raises(ValidationError):
            GoldenNode.model_validate(node(1).model_dump() | changes)
    with pytest.raises(ValidationError):
        GoldenEdge(child_step_id=1, relation="FOLLOW")
    with pytest.raises(ValidationError):
        GoldenEdge(parent_step_id=1, child_step_id=2, relation=R.START)


@pytest.mark.parametrize("edges", [
    (GoldenEdge(child_step_id=1, relation=R.START),),
    (GoldenEdge(child_step_id=1, relation=R.START), GoldenEdge(parent_step_id=3, child_step_id=2, relation=R.CONTINUE)),
    (GoldenEdge(child_step_id=2, relation=R.START), GoldenEdge(parent_step_id=2, child_step_id=1, relation=R.RETURN)),
])
def test_graph_rejects_orphans_missing_parent_backward_return(edges):
    with pytest.raises(ValidationError):
        ClinicalDecisionGraph(nodes=(node(1), node(2)), edges=edges)


def test_duplicate_nodes_and_edges_rejected():
    edge = GoldenEdge(child_step_id=1, relation=R.START)
    with pytest.raises(ValidationError):
        ClinicalDecisionGraph(nodes=(node(1), node(1)), edges=(edge,))
    with pytest.raises(ValidationError):
        ClinicalDecisionGraph(nodes=(node(1),), edges=(edge, edge))


def test_branch_consult_transfer_and_reintegration():
    manager = ClinicalProblemManager()
    manager.create_problem("P1", "Presenting syndrome", "medicine", clock=0, rationale="Initial observation")
    manager.create_problem("P2", "Separate lesion", "medicine", parent_problem_id="P1", clock=1,
                           rationale="An independent clinical problem")
    manager.consult("P2", "surgery", clock=2, rationale="Seek specialist advice")
    assert manager.get("P2").owner == "medicine"
    assert manager.events[-1].advisory_specialty == "surgery"
    manager.transfer_ownership("P2", "surgery", clock=3, rationale="Specialty accepts management")
    manager.suspend_problem("P1", clock=4, rationale="Await stabilization")
    event = manager.reintegrate_problem("P2", "P1", clock=5, rationale="New integrated review")
    assert event.action_type == A.REASSESS
    assert len(event.parent_event_ids) == 2
    assert event.clock == 5
    assert manager.get("P1").status == "ACTIVE"
    assert manager.get("P2").owner == "surgery"
    assert manager.ownership_changes[0].previous_owner == "medicine"


def test_failed_transitions_are_transactional():
    manager = ClinicalProblemManager()
    manager.create_problem("P1", "Problem", "medicine", clock=0, rationale="Observed")
    before = manager.events
    with pytest.raises(ProblemTransitionError):
        manager.create_problem("P2", "Problem", "medicine", parent_problem_id="P1", clock=1,
                               rationale="Different test is not a branch")
    with pytest.raises(ProblemTransitionError):
        manager.transfer_ownership("P1", "medicine", clock=1, rationale="No ownership change")
    with pytest.raises(ProblemTransitionError):
        manager.update_problem("P1", clock=0, rationale="Cannot rewind")
    assert manager.events == before
    assert len(manager.problems) == 1


def test_problem_state_hierarchy_rejects_cycles_and_missing_parents():
    for parent in ("P1", "missing"):
        p = ClinicalProblem(problem_id="P1", label="Synthetic", owner="primary", parent_problem_id=parent)
        with pytest.raises(ValidationError):
            ClinicalState(case_ref="test", active_problems=(p,), current_management_ownership={"P1": "primary"})


def test_observable_state_rejects_hidden_gold_and_future_evidence():
    evidence = Evidence(evidence_id="e1", text="Synthetic finding", available_at=2, source="fixture")
    with pytest.raises(ValidationError):
        ClinicalState(case_ref="test", clock=1, available_evidence=(evidence,))
    with pytest.raises(ValidationError):
        ClinicalState(case_ref="test", clinical_graph=(node(1),))
