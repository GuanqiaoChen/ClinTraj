"""Derive the graph relation a proposed action actually performs.

A relation is a structural property of a transition, not an independent clinical
claim: it follows from the problem an action addresses and from the ownership or
reintegration change that action performs. A declared relation is therefore
advisory. One that does not describe the transition is repaired here and the
repair is reported, so a clinically reasonable action is never rejected for a
label the domain can derive itself. CONTINUE is the default next step under an
existing problem; START, BRANCH, CONSULT, TRANSFER and RETURN are used only when
their own preconditions hold. Transitions that remain impossible still fail in
`apply_candidate`, which stays the only authority on execution.
"""

from typing import NamedTuple

from .action_types import ActionType
from .clinical_problem import ClinicalProblem, ProblemStatus
from .clinical_state import ClinicalState
from .problem_manager import ActionProposal
from .relation_types import RelationType


class RelationRepair(NamedTuple):
    """Field updates that make a proposal structurally executable, and why.

    `updates` is empty when the declared transition already describes the action.
    Notes are structural only and never contain clinical text.
    """

    updates: dict[str, object]
    notes: tuple[str, ...]


def observed_problems(state: ClinicalState) -> dict[str, ClinicalProblem]:
    return {p.problem_id: p for p in
            (*state.active_problems, *state.suspended_problems, *state.resolved_problems)}


def _has_ancestor(problems: dict[str, ClinicalProblem], problem_id: str, ancestor_id: str) -> bool:
    seen: set[str] = set()
    current = problems[problem_id].parent_problem_id if problem_id in problems else None
    while current is not None and current not in seen:
        if current == ancestor_id:
            return True
        seen.add(current)
        current = problems[current].parent_problem_id if current in problems else None
    return False


def _reintegrates(problems: dict[str, ClinicalProblem], source: ClinicalProblem,
                  target_id: str | None) -> bool:
    """Mirror ClinicalProblemManager.reintegrate_problem without recording anything."""
    target = problems.get(target_id or "")
    return (target is not None and target.problem_id != source.problem_id
            and source.status != ProblemStatus.SUSPENDED
            and target.status != ProblemStatus.RESOLVED
            and _has_ancestor(problems, source.problem_id, target.problem_id))


def infer_relation(state: ClinicalState, candidate: ActionProposal) -> RelationRepair:
    """Classify the transition a candidate performs against the observed state.

    Ambiguity is never resolved by guessing: when the addressed problem cannot be
    identified without a choice between several active problems, nothing is
    repaired and the existing safety checks report the unknown reference.
    """
    problems = observed_problems(state)
    action, declared = candidate.action_type, candidate.relation
    label = (candidate.new_problem_label or "").strip()
    parent = problems.get(candidate.parent_problem_id or "")

    def repair(relation: RelationType, reason: str, **fields: object) -> RelationRepair:
        proposed: dict[str, object] = {"relation": relation, **fields}
        updates = {key: value for key, value in proposed.items() if getattr(candidate, key) != value}
        if not updates:
            return RelationRepair({}, ())
        note = (f"Declared {declared.value} recorded as {relation.value}: {reason}"
                if "relation" in updates else f"{relation.value} retained: {reason}")
        return RelationRepair(updates, (note,))

    # Only an actually new, labelled problem opens one. A consultation may open a
    # branch under an active parent, whose ownership it inherits; a transfer
    # changes the owner of an existing problem and can never create one.
    opens_problem = bool(candidate.problem_id) and candidate.problem_id not in problems and bool(label)
    if opens_problem and action != ActionType.TRANSFER:
        if parent is not None and parent.status == ProblemStatus.ACTIVE:
            if label.casefold() != parent.label.casefold():
                return repair(RelationType.BRANCH, "a distinct new problem opens under an active parent.",
                              new_problem_label=label, reintegration_target_id=None)
            return repair(RelationType.CONTINUE, "the proposed problem repeats its parent.",
                          problem_id=parent.problem_id, new_problem_label=None,
                          parent_problem_id=None, reintegration_target_id=None)
        if action != ActionType.CONSULT:
            return repair(RelationType.START, "a new problem has no existing active parent.",
                          new_problem_label=label, parent_problem_id=None, reintegration_target_id=None)

    problem = problems.get(candidate.problem_id or "")
    if problem is None:
        if len(state.active_problems) != 1:
            return RelationRepair({}, ())
        problem = state.active_problems[0]
    addressed: dict[str, object] = {"problem_id": problem.problem_id, "new_problem_label": None,
                                    "parent_problem_id": None}
    if action == ActionType.TRANSFER:
        return repair(RelationType.TRANSFER, "the action hands primary management to another team.",
                      **addressed, reintegration_target_id=None)
    if action == ActionType.CONSULT:
        return repair(RelationType.CONSULT, "advisory input does not change management ownership.",
                      **addressed, reintegration_target_id=None)
    if action == ActionType.REASSESS and _reintegrates(problems, problem, candidate.reintegration_target_id):
        return repair(RelationType.RETURN, "the reassessment rejoins an ancestor management problem.",
                      **addressed)
    return repair(RelationType.CONTINUE, "the action is a next step under an existing problem.",
                  **addressed, reintegration_target_id=None)
