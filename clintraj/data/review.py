"""Reviewer labels stay outside minimal canonical gold and agent observations."""

from enum import IntEnum

from pydantic import BaseModel, ConfigDict, Field, model_validator


class DecisionRating(IntEnum):
    CORRECT = 1
    CORRECT_ALTERNATIVE_PREFERRED = 2
    INCORRECT = 3


class RationaleRating(IntEnum):
    SUFFICIENT = 1
    PARTIAL = 2
    INCORRECT = 3


class ClinicianReview(BaseModel):
    """Unapplied reviewer annotation; missing values never imply approval."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    case_id: str = Field(min_length=1, repr=False)
    step_id: int = Field(gt=0)
    source_row: int = Field(gt=0)
    decision_rating: DecisionRating | None = None
    revised_action: str | None = Field(default=None, repr=False)
    rationale_rating: RationaleRating | None = None
    revised_rationale: str | None = Field(default=None, repr=False)

    @model_validator(mode="after")
    def validate_required_revisions(self) -> "ClinicianReview":
        if self.decision_rating == DecisionRating.INCORRECT and not self.revised_action:
            raise ValueError("incorrect_decision_requires_revision")
        if self.rationale_rating in (RationaleRating.PARTIAL, RationaleRating.INCORRECT):
            if not self.revised_rationale:
                raise ValueError("partial_or_incorrect_rationale_requires_revision")
        return self

    @property
    def is_complete(self) -> bool:
        return self.decision_rating is not None and self.rationale_rating is not None

    @property
    def has_annotation(self) -> bool:
        return any(
            value is not None
            for value in (
                self.decision_rating,
                self.revised_action,
                self.rationale_rating,
                self.revised_rationale,
            )
        )
