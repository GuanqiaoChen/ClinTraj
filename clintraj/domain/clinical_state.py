from pydantic import Field, model_validator

from .clinical_problem import ClinicalProblem, ProblemStatus
from .decision_graph import DecisionEvent, ObservedDecisionGraph
from .schemas import StrictModel


class Evidence(StrictModel):
    evidence_id: str = Field(min_length=1)
    text: str = Field(min_length=1)
    available_at: int = Field(ge=0, strict=True)
    source: str = Field(min_length=1)
    observed_at: int | None = Field(default=None, ge=0, strict=True)

    @model_validator(mode="after")
    def acquisition_precedes_release(self) -> "Evidence":
        if self.observed_at is not None and self.observed_at > self.available_at:
            raise ValueError("Evidence cannot become available before observation")
        return self


class ClinicalState(StrictModel):
    """The only object agents receive. No reference action, label, or future graph."""

    case_ref: str = Field(min_length=1)
    clock: int = Field(default=0, ge=0, strict=True)
    available_evidence: tuple[Evidence, ...] = ()
    active_problems: tuple[ClinicalProblem, ...] = ()
    resolved_problems: tuple[ClinicalProblem, ...] = ()
    suspended_problems: tuple[ClinicalProblem, ...] = ()
    current_management_ownership: dict[str, str] = Field(default_factory=dict)
    differential: tuple[str, ...] = ()
    uncertainty: tuple[str, ...] = ()
    risk_flags: tuple[str, ...] = ()
    previous_actions: tuple[str, ...] = ()
    clinical_graph: tuple[DecisionEvent, ...] = ()

    @model_validator(mode="after")
    def observable_only(self) -> "ClinicalState":
        ids = {e.evidence_id for e in self.available_evidence}
        if len(ids) != len(self.available_evidence):
            raise ValueError("Duplicate evidence IDs")
        if any(e.available_at > self.clock for e in self.available_evidence):
            raise ValueError("Future evidence in observable state")
        ObservedDecisionGraph(events=self.clinical_graph)
        for event in self.clinical_graph:
            if event.clock > self.clock or not set(event.evidence_ids) <= ids:
                raise ValueError("Runtime graph references unavailable evidence/time")
        problems = self.active_problems + self.resolved_problems + self.suspended_problems
        if len({p.problem_id for p in problems}) != len(problems):
            raise ValueError("Problem occurs in multiple state partitions")
        for group, status in [(self.active_problems, ProblemStatus.ACTIVE),
                              (self.suspended_problems, ProblemStatus.SUSPENDED),
                              (self.resolved_problems, ProblemStatus.RESOLVED)]:
            if any(p.status != status for p in group):
                raise ValueError("Incorrect problem status partition")
        if self.current_management_ownership != {p.problem_id: p.owner for p in problems}:
            raise ValueError("Ownership index must match problem owners")
        parents = {p.problem_id: p.parent_problem_id for p in problems}
        for problem_id in parents:
            visited: set[str] = set()
            current: str | None = problem_id
            while current is not None:
                if current not in parents or current in visited:
                    raise ValueError("Problem parent hierarchy is missing a parent or contains a cycle")
                visited.add(current)
                current = parents[current]
        return self

    def require_evidence(self, evidence_ids: tuple[str, ...] | list[str]) -> None:
        if not set(evidence_ids) <= {e.evidence_id for e in self.available_evidence}:
            raise ValueError("Claim references unavailable evidence")
