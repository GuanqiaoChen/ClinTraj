"""Minimal reference schemas. Runtime metadata must not be added to these records."""

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .action_types import ActionType
from .relation_types import RelationType


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, str_strip_whitespace=True)


class GoldenNode(StrictModel):
    case_id: str = Field(min_length=1)
    step_id: int = Field(gt=0, strict=True)
    new_evidence: str
    action_type: ActionType
    action: str = Field(min_length=1)
    clinical_rationale: str = Field(min_length=1)


class GoldenEdge(StrictModel):
    parent_step_id: int | None = Field(default=None, gt=0, strict=True)
    child_step_id: int = Field(gt=0, strict=True)
    relation: RelationType

    @model_validator(mode="after")
    def start_has_no_parent(self) -> "GoldenEdge":
        if (self.relation == RelationType.START) != (self.parent_step_id is None):
            raise ValueError("Only START has an absent parent")
        return self
