"""Trajectory evaluation with explicit denominators and unavailable clinical labels."""

import random
from collections import defaultdict
from collections.abc import Callable, Sequence

from pydantic import Field

from clintraj.domain.action_types import ActionType
from clintraj.domain.decision_graph import ClinicalDecisionGraph
from clintraj.domain.relation_types import RelationType
from clintraj.domain.schemas import StrictModel


class StepEvaluation(StrictModel):
    case_ref: str
    reference_type: ActionType
    predicted_type: ActionType | None = None
    top_k_types: tuple[ActionType, ...] = ()
    exact_action_match: bool | None = None
    decision_correctness: int | None = Field(default=None, ge=1, le=3)
    rationale_correctness: int | None = Field(default=None, ge=1, le=3)
    reference_relation: RelationType | None = None
    predicted_relation: RelationType | None = None
    critical_action: bool | None = None
    critical_action_recalled: bool | None = None
    unnecessary_action: bool | None = None
    unsafe_action: bool | None = None
    missed_escalation: bool | None = None
    premature_discharge: bool | None = None
    contraindicated_action: bool | None = None
    critical_omission: bool | None = None
    future_leakage: bool | None = None
    evidence_grounded: bool | None = None
    unsupported_claim: bool | None = None
    completed: bool | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)


class MetricResult(StrictModel):
    value: float | None
    numerator: float
    denominator: int
    unit: str = "step"
    status: str = "computed"


def rate(values: Sequence[bool | None], *, unit: str = "step") -> MetricResult:
    observed = [v for v in values if v is not None]
    return MetricResult(value=sum(observed) / len(observed) if observed else None,
                        numerator=float(sum(observed)), denominator=len(observed), unit=unit,
                        status="computed" if observed else "unavailable_labels")


def evaluate_steps(rows: Sequence[StepEvaluation]) -> dict[str, MetricResult]:
    metrics = {
        "action_type_agreement": rate([r.predicted_type == r.reference_type for r in rows]),
        "exact_action_agreement": rate([r.exact_action_match for r in rows]),
        "top_k_action_type_agreement": rate([r.reference_type in r.top_k_types for r in rows]),
        "clinical_acceptability": rate([None if r.decision_correctness is None else
                                       r.decision_correctness in (1, 2) for r in rows]),
        "clinician_correct": rate([None if r.decision_correctness is None else
                                   r.decision_correctness == 1 for r in rows]),
        "acceptable_alternative": rate([None if r.decision_correctness is None else
                                        r.decision_correctness == 2 for r in rows]),
        "clinician_incorrect": rate([None if r.decision_correctness is None else
                                     r.decision_correctness == 3 for r in rows]),
        "rationale_agreement": rate([None if r.rationale_correctness is None else
                                     r.rationale_correctness == 1 for r in rows]),
        "critical_action_recall": rate([r.critical_action_recalled for r in rows
                                        if r.critical_action is True]),
    }
    for key in ("unnecessary_action", "unsafe_action", "missed_escalation", "premature_discharge",
                "contraindicated_action", "critical_omission", "future_leakage",
                "evidence_grounded", "unsupported_claim"):
        metrics[f"{key}_rate"] = rate([getattr(r, key) for r in rows])
    for relation in (RelationType.BRANCH, RelationType.TRANSFER, RelationType.RETURN):
        labeled = [r for r in rows if r.reference_relation is not None]
        metrics[f"{relation.lower()}_accuracy"] = rate([
            r.predicted_relation is not None and
            (r.predicted_relation == relation) == (r.reference_relation == relation)
            for r in labeled])
        metrics[f"{relation.lower()}_recall"] = rate([
            r.predicted_relation == relation for r in labeled if r.reference_relation == relation])
        metrics[f"{relation.lower()}_precision"] = rate([
            r.reference_relation == relation for r in labeled if r.predicted_relation == relation])
    metrics["relation_prediction_coverage"] = rate([
        r.predicted_relation is not None for r in rows if r.reference_relation is not None])
    cases: dict[str, list[StepEvaluation]] = defaultdict(list)
    for row in rows:
        cases[row.case_ref].append(row)
    metrics["trajectory_completion"] = rate([
        next((r.completed for r in reversed(case) if r.completed is not None), None)
        for case in cases.values()], unit="case")
    calibrated = [r for r in rows if r.confidence is not None and r.decision_correctness is not None]
    errors = [(r.confidence - float(r.decision_correctness in (1, 2))) ** 2  # type: ignore[operator]
              for r in calibrated]
    metrics["brier_score"] = MetricResult(value=sum(errors) / len(errors) if errors else None,
        numerator=sum(errors), denominator=len(errors),
        status="computed" if errors else "unavailable_labels")
    return metrics


def aligned_graph_edit_distance(reference: ClinicalDecisionGraph,
                                 predicted: ClinicalDecisionGraph) -> int:
    """Unit-cost edit count under supplied step alignment, not optimized semantic GED.

    Missing/extra nodes and labeled edges cost one; an action-type substitution costs one.
    Clinical equivalence and unaligned graph matching require a separate clinician matcher.
    """
    ref = {n.step_id: n.action_type for n in reference.nodes}
    pred = {n.step_id: n.action_type for n in predicted.nodes}
    re = {(e.parent_step_id, e.child_step_id, e.relation) for e in reference.edges}
    pe = {(e.parent_step_id, e.child_step_id, e.relation) for e in predicted.edges}
    return len(ref.keys() ^ pred.keys()) + sum(ref[i] != pred[i] for i in ref.keys() & pred.keys()) + len(re ^ pe)


def case_bootstrap_interval(case_values: Sequence[float], *, seed: int = 42,
                            samples: int = 2000) -> tuple[float, float] | None:
    """Percentile bootstrap across cases, never across correlated steps."""
    if len(case_values) < 2:
        return None
    if samples < 100:
        raise ValueError("At least 100 bootstrap samples required")
    rng = random.Random(seed)
    means = sorted(sum(rng.choices(case_values, k=len(case_values))) / len(case_values)
                   for _ in range(samples))
    return means[int(samples * .025)], means[min(samples - 1, int(samples * .975))]


class MetricRegistry:
    """Extension point for clinician-adjudicated reasoning and sequential metrics."""

    def __init__(self):
        self._metrics: dict[str, Callable[[Sequence[StepEvaluation]], MetricResult]] = {}

    def register(self, name: str, metric: Callable[[Sequence[StepEvaluation]], MetricResult]) -> None:
        if name in self._metrics:
            raise ValueError("Metric already registered")
        self._metrics[name] = metric

    def evaluate(self, rows: Sequence[StepEvaluation]) -> dict[str, MetricResult]:
        return {name: metric(rows) for name, metric in self._metrics.items()}
