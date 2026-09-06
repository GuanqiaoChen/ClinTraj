"""Validated, inspectable messages exchanged by the clinical method roles."""

from enum import Enum
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from clintraj.domain.action_types import ActionType
from clintraj.domain.relation_types import RelationType


class Message(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Ordinal(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    UNKNOWN = "UNKNOWN"


class ActionAssessment(Message):
    """Uncalibrated ordinal judgments, never probabilities or measured utility."""

    information_gain: Ordinal = Ordinal.UNKNOWN
    clinical_benefit: Ordinal = Ordinal.UNKNOWN
    urgency: Ordinal = Ordinal.UNKNOWN
    harm: Ordinal = Ordinal.UNKNOWN
    burden: Ordinal = Ordinal.UNKNOWN
    delay: Ordinal = Ordinal.UNKNOWN
    explanation: str = "No calibrated estimates are available."


class CandidateAction(Message):
    candidate_id: str = Field(min_length=1)
    action_type: ActionType
    action: str = Field(min_length=1)
    rationale: str = Field(min_length=1)
    evidence_ids: tuple[str, ...] = ()
    problem_id: str | None = None
    relation: RelationType = RelationType.CONTINUE
    specialty: str | None = None
    new_problem_label: str | None = None
    parent_problem_id: str | None = None
    reintegration_target_id: str | None = None
    assessment: ActionAssessment = Field(default_factory=ActionAssessment)
    contraindications: tuple[str, ...] = ()
    prerequisites: tuple[str, ...] = ()
    uncertainty: tuple[str, ...] = ()


class StateInterpretation(Message):
    summary: str
    evidence_ids: tuple[str, ...] = ()
    risk_flags: tuple[str, ...] = ()
    uncertainty: tuple[str, ...] = ()


class ProblemFormulation(Message):
    differential: tuple[str, ...] = ()
    evidence_ids: tuple[str, ...] = ()
    problem_summaries: dict[str, str] = Field(default_factory=dict)
    suggested_specialties: tuple[str, ...] = ()
    uncertainty: tuple[str, ...] = ()


class ActionGeneration(Message):
    candidates: tuple[CandidateAction, ...] = ()
    uncertainty: tuple[str, ...] = ()

    @model_validator(mode="after")
    def unique_candidates(self) -> Self:
        ids = [candidate.candidate_id for candidate in self.candidates]
        if len(ids) != len(set(ids)):
            raise ValueError("Candidate IDs must be unique")
        return self


class StrategyAssessment(Message):
    assessments: dict[str, ActionAssessment] = Field(default_factory=dict)
    uncertainty: tuple[str, ...] = ()


class SpecialistAdvice(Message):
    specialty: str
    candidate_ids: tuple[str, ...] = ()
    evidence_ids: tuple[str, ...] = ()
    advice: str
    concerns: tuple[str, ...] = ()


class GroundingAssessment(Message):
    supported_candidate_ids: tuple[str, ...] = ()
    citation_ids: tuple[str, ...] = ()
    limitations: tuple[str, ...] = ()


class SafetyFinding(Message):
    code: str
    explanation: str
    veto: bool = True


class SafetyAssessment(Message):
    candidate_id: str
    findings: tuple[SafetyFinding, ...] = ()

    @property
    def vetoed(self) -> bool:
        return any(finding.veto for finding in self.findings)


class SafetyReview(Message):
    assessments: tuple[SafetyAssessment, ...] = ()
    uncertainty: tuple[str, ...] = ()


class ArbiterExplanation(Message):
    explanation: str
    uncertainty: tuple[str, ...] = ()


class RankedAction(Message):
    candidate_id: str
    heuristic_score: float
    assessed_dimensions: int
    unknown_dimensions: tuple[str, ...] = ()


class Recommendation(Message):
    recommendation_id: str
    state_fingerprint: str
    candidates: tuple[CandidateAction, ...]
    selected_candidate_id: str | None
    rankings: tuple[RankedAction, ...] = ()
    safety_assessments: tuple[SafetyAssessment, ...] = ()
    specialist_advice: tuple[SpecialistAdvice, ...] = ()
    citation_ids: tuple[str, ...] = ()
    citation_hashes: dict[str, str] = Field(default_factory=dict)
    inferred_risk_flags: tuple[str, ...] = ()
    proposed_differential: tuple[str, ...] = ()
    problem_summaries: dict[str, str] = Field(default_factory=dict)
    explanation: str
    uncertainty: tuple[str, ...] = ()
    roles_invoked: tuple[str, ...] = ()
    prompt_versions: dict[str, str] = Field(default_factory=dict)
    prompt_hashes: dict[str, str] = Field(default_factory=dict)
    model_metadata: dict[str, str | int | float | None] = Field(default_factory=dict)

    @property
    def selected_action(self) -> CandidateAction | None:
        return next((a for a in self.candidates if a.candidate_id == self.selected_candidate_id), None)


class PhysicianResponse(str, Enum):
    ACCEPT = "ACCEPT"
    MODIFY = "MODIFY"
    REJECT = "REJECT"


class PhysicianDecision(Message):
    recommendation_id: str = Field(min_length=1)
    response: PhysicianResponse
    physician_ref: str = Field(min_length=1)
    rationale: str = Field(min_length=1)
    modified_action: CandidateAction | None = None

    @model_validator(mode="after")
    def modification_matches_response(self) -> Self:
        if (self.response == PhysicianResponse.MODIFY) != (self.modified_action is not None):
            raise ValueError("MODIFY requires a modified_action; other responses forbid it")
        return self


class ReviewOutcome(Message):
    approved: bool
    action: CandidateAction | None = None
    reason: str
    safety: SafetyAssessment | None = None
