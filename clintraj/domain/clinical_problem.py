from enum import StrEnum

from pydantic import Field

from .schemas import StrictModel


class ProblemStatus(StrEnum):
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    RESOLVED = "RESOLVED"


class ClinicalProblem(StrictModel):
    problem_id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    owner: str = Field(min_length=1)
    status: ProblemStatus = ProblemStatus.ACTIVE
    parent_problem_id: str | None = None


class ProblemTransitionError(ValueError):
    pass
