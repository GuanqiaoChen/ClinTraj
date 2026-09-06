"""Synthetic integration scenarios derived from the requested five image patterns.

These deliberately contain no copied patient narratives or source case IDs. They
exercise programmatic clinical semantics and do not repair source labels, validate
clinical treatment choices, or stand in for empirical clinical evaluation.
"""

from clintraj.domain.action_types import ActionType
from clintraj.domain.clinical_problem import ProblemStatus
from clintraj.domain.decision_graph import ObservedDecisionGraph
from clintraj.domain.problem_manager import ClinicalProblemManager
from clintraj.domain.relation_types import RelationType

WHY = "Synthetic scenario transition supplied for graph integration testing"


def _start(label, owner):
    manager = ClinicalProblemManager()
    manager.create_problem(
        "P1", label, owner, clock=1, rationale=WHY, action_type=ActionType.ASK_HISTORY
    )
    manager.update_problem("P1", clock=2, rationale=WHY, action_type=ActionType.EXAM)
    manager.update_problem("P1", clock=3, rationale=WHY, action_type=ActionType.TEST)
    return manager


def _assert_forward_and_integrated(manager, integration):
    ObservedDecisionGraph(events=manager.events)
    indexed = {event.event_id: event for event in manager.events}
    assert integration.relation == RelationType.RETURN
    assert integration.action_type == ActionType.REASSESS
    assert len(integration.parent_event_ids) == 2
    assert len(set(integration.parent_event_ids)) == 2
    assert all(indexed[parent].clock < integration.clock for parent in integration.parent_event_ids)
    assert integration.event_id not in integration.parent_event_ids


def test_conceptual_case_one_linear_procedure_and_pathology():
    manager = _start("Synthetic breast problem", "surgical_team")
    rest = (
        ActionType.PROCEDURE, ActionType.PATHOLOGY, ActionType.REASSESS,
        ActionType.DISCHARGE_FOLLOWUP,
    )
    for clock, action in enumerate(rest, start=4):
        manager.update_problem("P1", clock=clock, rationale=WHY, action_type=action)
    ObservedDecisionGraph(events=manager.events)
    assert len(manager.problems) == 1
    assert {event.action_type for event in manager.events} == {
        ActionType.ASK_HISTORY, ActionType.EXAM, ActionType.TEST, *rest
    }
    assert [event.relation for event in manager.events] == [
        RelationType.START, *([RelationType.CONTINUE] * 6)
    ]
    assert not manager.ownership_changes


def test_conceptual_case_two_gastrointestinal_and_ent_advisory_reintegration():
    manager = _start("Synthetic gastrointestinal problem", "gastrointestinal_team")
    manager.create_problem(
        "P2", "Synthetic ENT problem", "gastrointestinal_team",
        parent_problem_id="P1", clock=4, rationale=WHY,
    )
    manager.consult("P2", "ENT", clock=5, rationale=WHY)
    assert manager.get("P2").owner == "gastrointestinal_team"
    manager.update_problem("P1", clock=6, rationale=WHY, action_type=ActionType.PROCEDURE)
    manager.update_problem("P1", clock=7, rationale=WHY, action_type=ActionType.PATHOLOGY)
    manager.update_problem("P1", clock=8, rationale=WHY, action_type=ActionType.TREATMENT)
    manager.resolve_problem("P2", clock=9, rationale=WHY)
    integration = manager.reintegrate_problem("P2", "P1", clock=10, rationale=WHY)
    manager.update_problem("P1", clock=11, rationale=WHY, action_type=ActionType.DISCHARGE_FOLLOWUP)
    _assert_forward_and_integrated(manager, integration)
    assert not manager.ownership_changes
    assert RelationType.CONSULT in {event.relation for event in manager.events}
    assert RelationType.TRANSFER not in {event.relation for event in manager.events}


def test_conceptual_case_three_pulmonary_and_fracture_ownership():
    manager = _start("Synthetic pulmonary problem", "pulmonary_team")
    manager.create_problem(
        "P2", "Synthetic vertebral fracture", "pulmonary_team",
        parent_problem_id="P1", clock=4, rationale=WHY,
    )
    manager.consult("P2", "orthopedics", clock=5, rationale=WHY)
    assert manager.get("P2").owner == "pulmonary_team"
    manager.transfer_ownership("P2", "orthopedics", clock=6, rationale=WHY)
    assert manager.get("P1").owner == "pulmonary_team"
    assert manager.get("P2").owner == "orthopedics"
    manager.update_problem("P1", clock=7, rationale=WHY, action_type=ActionType.TREATMENT)
    manager.update_problem("P2", clock=8, rationale=WHY, action_type=ActionType.PROCEDURE)
    manager.update_problem("P2", clock=9, rationale=WHY, action_type=ActionType.REASSESS)
    integration = manager.reintegrate_problem("P2", "P1", clock=10, rationale=WHY)
    _assert_forward_and_integrated(manager, integration)
    assert manager.get("P2").owner == "orthopedics"
    assert integration.owner == "pulmonary_team"
    assert len(manager.ownership_changes) == 1
    assert {manager.get(pid).status for pid in ("P1", "P2")} == {ProblemStatus.ACTIVE}


def test_conceptual_case_four_neurological_and_breast_parallel_problems():
    manager = _start("Synthetic dizziness syndrome", "neurology")
    manager.create_problem(
        "P2", "Synthetic incidental breast lesion", "neurology",
        parent_problem_id="P1", clock=4, rationale=WHY,
    )
    manager.consult("P2", "breast_surgery", clock=5, rationale=WHY)
    assert manager.get("P2").owner == "neurology"
    manager.transfer_ownership("P2", "breast_surgery", clock=6, rationale=WHY)
    manager.update_problem("P1", clock=7, rationale=WHY, action_type=ActionType.TEST)
    manager.update_problem("P1", clock=8, rationale=WHY, action_type=ActionType.TREATMENT)
    neurological_latest = manager.events[-1].event_id
    manager.update_problem("P2", clock=9, rationale=WHY, action_type=ActionType.PROCEDURE)
    manager.update_problem("P2", clock=10, rationale=WHY, action_type=ActionType.PATHOLOGY)
    breast_latest = manager.events[-1].event_id
    integration = manager.reintegrate_problem("P2", "P1", clock=11, rationale=WHY)
    _assert_forward_and_integrated(manager, integration)
    assert set(integration.parent_event_ids) == {neurological_latest, breast_latest}
    assert manager.get("P1").owner == "neurology"
    assert manager.get("P2").owner == "breast_surgery"
    assert manager.get("P2").parent_problem_id == "P1"
    assert {RelationType.BRANCH, RelationType.CONSULT, RelationType.TRANSFER, RelationType.RETURN} <= {
        event.relation for event in manager.events
    }


def test_conceptual_case_five_acute_deterioration_and_resumption_before_procedure():
    manager = _start("Synthetic urologic problem", "urology")
    manager.update_problem("P1", clock=4, rationale=WHY, action_type=ActionType.TREATMENT)
    manager.create_problem(
        "P2", "Synthetic acute infection deterioration", "urology",
        parent_problem_id="P1", clock=5, rationale=WHY,
    )
    manager.suspend_problem("P1", clock=6, rationale=WHY)
    suspended_event = manager.events[-1].event_id
    manager.transfer_ownership("P2", "ICU", clock=7, rationale=WHY)
    manager.update_problem("P2", clock=8, rationale=WHY, action_type=ActionType.TREATMENT)
    manager.update_problem("P2", clock=9, rationale=WHY, action_type=ActionType.REASSESS)
    manager.resolve_problem("P2", clock=10, rationale=WHY)
    acute_latest = manager.events[-1].event_id
    integration = manager.reintegrate_problem("P2", "P1", clock=11, rationale=WHY)
    assert manager.get("P1").status == ProblemStatus.ACTIVE
    assert manager.get("P1").owner == "urology"
    assert manager.get("P2").status == ProblemStatus.RESOLVED
    assert set(integration.parent_event_ids) == {suspended_event, acute_latest}
    manager.update_problem("P1", clock=12, rationale=WHY, action_type=ActionType.PROCEDURE)
    procedure = manager.events[-1]
    manager.update_problem("P1", clock=13, rationale=WHY, action_type=ActionType.PATHOLOGY)
    manager.update_problem("P1", clock=14, rationale=WHY, action_type=ActionType.DISCHARGE_FOLLOWUP)
    _assert_forward_and_integrated(manager, integration)
    assert procedure.parent_event_ids == (integration.event_id,)
    assert procedure.clock > integration.clock
