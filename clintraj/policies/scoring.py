"""Transparent ordinal arbitration; interfaces also admit learned scoring."""

from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field

from clintraj.agents.schemas import CandidateAction, Ordinal, RankedAction


class PolicyWeights(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    information_gain: float = Field(default=1.0, ge=0)
    clinical_benefit: float = Field(default=1.0, ge=0)
    urgency: float = Field(default=1.0, ge=0)
    harm: float = Field(default=1.0, ge=0)
    burden: float = Field(default=1.0, ge=0)
    delay: float = Field(default=1.0, ge=0)


class ScoringPolicy(Protocol):
    def rank(self, candidates: tuple[CandidateAction, ...]) -> tuple[RankedAction, ...]: ...


class OrdinalScoringPolicy:
    """LOW/MEDIUM/HIGH encode 0/1/2 solely for a reproducible sensitivity rubric.

    UNKNOWN is omitted and always reported. Scores do not measure clinical
    utility, are not calibrated, and cannot establish benefit. Different missing
    dimensions make comparisons weak; ties preserve candidate generation order.
    Safety vetoes are applied outside this policy before ranking.
    """

    def __init__(self, weights: PolicyWeights | None = None) -> None:
        self.weights = weights or PolicyWeights()

    def rank(self, candidates: tuple[CandidateAction, ...]) -> tuple[RankedAction, ...]:
        values = {Ordinal.LOW: 0.0, Ordinal.MEDIUM: 1.0, Ordinal.HIGH: 2.0}
        ranked = []
        for candidate in candidates:
            score, count, unknown = 0.0, 0, []
            for dimension, weight in self.weights.model_dump().items():
                if weight == 0:
                    continue
                ordinal = getattr(candidate.assessment, dimension)
                if ordinal == Ordinal.UNKNOWN:
                    unknown.append(dimension)
                    continue
                count += 1
                direction = -1 if dimension in {"harm", "burden", "delay"} else 1
                score += direction * weight * values[ordinal]
            ranked.append(RankedAction(candidate_id=candidate.candidate_id, heuristic_score=score,
                                       assessed_dimensions=count, unknown_dimensions=tuple(unknown)))
        return tuple(sorted(ranked, key=lambda rank: -rank.heuristic_score))
