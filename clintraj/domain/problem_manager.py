"""Explicit clinical problem and ownership transitions, independent of agent runtime."""

from typing import Protocol

from .action_types import ActionType
from .clinical_problem import ClinicalProblem, ProblemStatus, ProblemTransitionError
from .clinical_state import ClinicalState
from .decision_graph import DecisionEvent, ObservedDecisionGraph
from .ownership import OwnershipChange
from .relation_types import RelationType


class ClinicalProblemManager:
    """Transactional, append-only transitions over stable problem identifiers.

    A branch needs a distinct problem label and an existing parent. Consultation records
    advisory work without ownership change. Reintegration always appends a new REASSESS.
    A manager is episode-local; it is never shared globally between patients.
    """

    def __init__(self, state: ClinicalState | None = None):
        self._problems: dict[str, ClinicalProblem] = {}
        self._events: tuple[DecisionEvent, ...] = ()
        self._ownership_changes: tuple[OwnershipChange, ...] = ()
        if state:
            self._problems = {p.problem_id: p for p in
                              state.active_problems + state.suspended_problems + state.resolved_problems}
            self._events = state.clinical_graph

    @property
    def problems(self) -> tuple[ClinicalProblem, ...]:
        return tuple(self._problems.values())

    @property
    def events(self) -> tuple[DecisionEvent, ...]:
        return self._events

    @property
    def ownership_changes(self) -> tuple[OwnershipChange, ...]:
        return self._ownership_changes

    def get(self, problem_id: str) -> ClinicalProblem:
        try:
            return self._problems[problem_id]
        except KeyError:
            raise ProblemTransitionError("Unknown problem") from None

    def _latest(self, problem_id: str) -> DecisionEvent:
        for event in reversed(self._events):
            if event.problem_id == problem_id:
                return event
        raise ProblemTransitionError("Problem has no observed events")

    def _record(self, problem: ClinicalProblem, relation: RelationType, clock: int,
                rationale: str, evidence_ids: tuple[str, ...], action_type: ActionType,
                parents: tuple[str, ...], specialty: str | None = None) -> DecisionEvent:
        if self._events and clock <= max(e.clock for e in self._events):
            raise ProblemTransitionError("New event must advance the episode clock")
        event = DecisionEvent(event_id=f"event-{len(self._events) + 1}", clock=clock,
                              problem_id=problem.problem_id, owner=problem.owner,
                              relation=relation, rationale=rationale, evidence_ids=evidence_ids,
                              action_type=action_type, parent_event_ids=parents,
                              advisory_specialty=specialty)
        ObservedDecisionGraph(events=self._events + (event,))
        self._events += (event,)
        self._problems[problem.problem_id] = problem
        return event

    def create_problem(self, problem_id: str, label: str, owner: str, *, clock: int,
                       rationale: str, evidence_ids: tuple[str, ...] = (),
                       parent_problem_id: str | None = None,
                       action_type: ActionType = ActionType.REASSESS) -> ClinicalProblem:
        if problem_id in self._problems:
            raise ProblemTransitionError("BRANCH/START requires a new stable problem ID")
        parents: tuple[str, ...] = ()
        relation = RelationType.START
        if parent_problem_id is not None:
            parent = self.get(parent_problem_id)
            if parent.status != ProblemStatus.ACTIVE:
                raise ProblemTransitionError("Cannot branch from inactive problem")
            if label.strip().casefold() == parent.label.casefold():
                raise ProblemTransitionError("BRANCH requires a distinct clinical problem")
            if owner != parent.owner:
                raise ProblemTransitionError("BRANCH inherits ownership; TRANSFER changes it later")
            parents = (self._latest(parent_problem_id).event_id,)
            relation = RelationType.BRANCH
        problem = ClinicalProblem(problem_id=problem_id, label=label, owner=owner,
                                  parent_problem_id=parent_problem_id)
        self._record(problem, relation, clock, rationale, evidence_ids, action_type, parents)
        return problem

    def update_problem(self, problem_id: str, *, clock: int, rationale: str,
                       evidence_ids: tuple[str, ...] = (), label: str | None = None,
                       action_type: ActionType = ActionType.REASSESS) -> ClinicalProblem:
        problem = self.get(problem_id)
        if problem.status != ProblemStatus.ACTIVE:
            raise ProblemTransitionError("CONTINUE requires an active problem")
        if action_type == ActionType.TRANSFER:
            raise ProblemTransitionError("Transfer actions require explicit ownership transition")
        if label is not None:
            problem = ClinicalProblem(**(problem.model_dump() | {"label": label}))
        self._record(problem, RelationType.CONTINUE, clock, rationale, evidence_ids, action_type,
                     (self._latest(problem_id).event_id,))
        return problem

    def consult(self, problem_id: str, specialty: str, *, clock: int, rationale: str,
                evidence_ids: tuple[str, ...] = ()) -> ClinicalProblem:
        problem = self.get(problem_id)
        if not specialty.strip() or problem.status != ProblemStatus.ACTIVE:
            raise ProblemTransitionError("Consult requires a specialty and active problem")
        self._record(problem, RelationType.CONSULT, clock, rationale, evidence_ids,
                     ActionType.CONSULT, (self._latest(problem_id).event_id,), specialty=specialty)
        return problem

    def transfer_ownership(self, problem_id: str, new_owner: str, *, clock: int,
                           rationale: str, evidence_ids: tuple[str, ...] = ()) -> ClinicalProblem:
        previous = self.get(problem_id)
        if previous.status != ProblemStatus.ACTIVE or new_owner == previous.owner:
            raise ProblemTransitionError("TRANSFER requires an active problem and a different owner")
        problem = ClinicalProblem(**(previous.model_dump() | {"owner": new_owner}))
        event = self._record(problem, RelationType.TRANSFER, clock, rationale, evidence_ids,
                             ActionType.TRANSFER, (self._latest(problem_id).event_id,))
        self._ownership_changes += (OwnershipChange(problem_id=problem_id,
            previous_owner=previous.owner, new_owner=new_owner, event_id=event.event_id,
            clock=clock, reason=rationale),)
        return problem

    def _change_status(self, problem_id: str, status: ProblemStatus, *, clock: int,
                       rationale: str, evidence_ids: tuple[str, ...] = ()) -> ClinicalProblem:
        previous = self.get(problem_id)
        allowed = {(ProblemStatus.ACTIVE, ProblemStatus.SUSPENDED),
                   (ProblemStatus.SUSPENDED, ProblemStatus.ACTIVE),
                   (ProblemStatus.ACTIVE, ProblemStatus.RESOLVED)}
        if (previous.status, status) not in allowed:
            raise ProblemTransitionError("Invalid clinical problem lifecycle transition")
        problem = ClinicalProblem(**(previous.model_dump() | {"status": status}))
        self._record(problem, RelationType.CONTINUE, clock, rationale, evidence_ids,
                     ActionType.REASSESS, (self._latest(problem_id).event_id,))
        return problem

    def suspend_problem(self, problem_id: str, **kwargs) -> ClinicalProblem:
        return self._change_status(problem_id, ProblemStatus.SUSPENDED, **kwargs)

    def resume_problem(self, problem_id: str, **kwargs) -> ClinicalProblem:
        return self._change_status(problem_id, ProblemStatus.ACTIVE, **kwargs)

    def resolve_problem(self, problem_id: str, **kwargs) -> ClinicalProblem:
        return self._change_status(problem_id, ProblemStatus.RESOLVED, **kwargs)

    def reintegrate_problem(self, problem_id: str, target_problem_id: str, *, clock: int,
                            rationale: str, evidence_ids: tuple[str, ...] = ()) -> DecisionEvent:
        problem, target = self.get(problem_id), self.get(target_problem_id)
        ancestor = problem.parent_problem_id
        visited: set[str] = set()
        while ancestor is not None and ancestor != target_problem_id:
            if ancestor in visited:
                raise ProblemTransitionError("Cyclic problem hierarchy")
            visited.add(ancestor)
            ancestor = self.get(ancestor).parent_problem_id
        if problem_id == target_problem_id or ancestor is None:
            raise ProblemTransitionError("RETURN must join an ancestor management problem")
        if problem.status == ProblemStatus.SUSPENDED or target.status == ProblemStatus.RESOLVED:
            raise ProblemTransitionError("RETURN source/target is not ready for reintegration")
        # Reassessment resumes the ancestor but does not imply the child is cured or its
        # ownership transferred back. Those are separately observable events.
        resumed = ClinicalProblem(**(target.model_dump() | {"status": ProblemStatus.ACTIVE}))
        return self._record(resumed, RelationType.RETURN, clock, rationale, evidence_ids,
                            ActionType.REASSESS,
                            (self._latest(problem_id).event_id, self._latest(target_problem_id).event_id))

    def into_state(self, state: ClinicalState, *, clock: int | None = None) -> ClinicalState:
        values = state.model_dump()
        values.update(clock=state.clock if clock is None else clock,
            active_problems=tuple(p for p in self.problems if p.status == ProblemStatus.ACTIVE),
            suspended_problems=tuple(p for p in self.problems if p.status == ProblemStatus.SUSPENDED),
            resolved_problems=tuple(p for p in self.problems if p.status == ProblemStatus.RESOLVED),
            current_management_ownership={p.problem_id: p.owner for p in self.problems},
            clinical_graph=self.events)
        return ClinicalState.model_validate(values)


class ActionProposal(Protocol):
    problem_id: str | None
    parent_problem_id: str | None
    new_problem_label: str | None
    reintegration_target_id: str | None
    specialty: str | None
    relation: RelationType
    action_type: ActionType
    evidence_ids: tuple[str, ...]
    rationale: str


def apply_candidate(state: ClinicalState, candidate: ActionProposal) -> ClinicalState:
    """Apply an already physician-approved candidate to an observed graph snapshot.

    External order execution and evidence release are the caller's responsibility.
    ClinicalState is revalidated, never mutated with unchecked model_copy updates.
    """
    state.require_evidence(candidate.evidence_ids)
    manager = ClinicalProblemManager(state)
    pid = candidate.problem_id
    if not pid:
        raise ProblemTransitionError("Explicit problem ID required for graph execution")
    clock = state.clock + 1
    rationale = candidate.rationale
    evidence_ids = tuple(candidate.evidence_ids)
    relation = candidate.relation
    if relation in (RelationType.START, RelationType.BRANCH):
        parent = candidate.parent_problem_id if relation == RelationType.BRANCH else None
        if relation == RelationType.BRANCH and not parent:
            raise ProblemTransitionError("BRANCH requires a parent problem")
        owner = manager.get(parent).owner if parent else (candidate.specialty or "primary_team")
        if not candidate.new_problem_label:
            raise ProblemTransitionError("New problem needs a clinical label")
        manager.create_problem(pid, candidate.new_problem_label, owner, clock=clock,
                               rationale=rationale, evidence_ids=evidence_ids,
                               parent_problem_id=parent, action_type=candidate.action_type)
    elif relation == RelationType.CONSULT:
        if candidate.action_type != ActionType.CONSULT:
            raise ProblemTransitionError("Runtime CONSULT transition requires CONSULT action")
        manager.consult(pid, candidate.specialty or "", clock=clock,
                        rationale=rationale, evidence_ids=evidence_ids)
    elif relation == RelationType.TRANSFER:
        if candidate.action_type != ActionType.TRANSFER:
            raise ProblemTransitionError("TRANSFER transition requires TRANSFER action")
        manager.transfer_ownership(pid, candidate.specialty or "", clock=clock,
                                   rationale=rationale, evidence_ids=evidence_ids)
    elif relation == RelationType.RETURN:
        if candidate.action_type != ActionType.REASSESS or not candidate.reintegration_target_id:
            raise ProblemTransitionError("RETURN requires new integration reassessment and target")
        manager.reintegrate_problem(pid, candidate.reintegration_target_id, clock=clock,
                                    rationale=rationale, evidence_ids=evidence_ids)
    else:
        manager.update_problem(pid, clock=clock, rationale=rationale,
                               evidence_ids=evidence_ids, action_type=candidate.action_type)
    return manager.into_state(state, clock=state.clock + 1)
