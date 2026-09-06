"""A capability boundary that projects only observations released by events."""

from pydantic import Field

from clintraj.domain.clinical_state import ClinicalState, Evidence
from clintraj.domain.schemas import StrictModel


class EvidenceRelease(StrictModel):
    evidence: Evidence
    prerequisite_events: frozenset[str] = frozenset()


class EvidenceGateError(ValueError):
    pass


class TemporalEvidenceGate:
    """Hold full evidence privately and release conjunctively gated observations.

    Availability time and completed prerequisites must BOTH hold. The environment owns
    event completion. An arbitrary agent assertion cannot advance this gate. Python object
    privacy is an application boundary, not isolation against malicious Python execution.
    """

    def __init__(self, releases: tuple[EvidenceRelease, ...], *, case_ref: str):
        if len({r.evidence.evidence_id for r in releases}) != len(releases):
            raise EvidenceGateError("Duplicate release evidence ID")
        self.__releases = tuple(releases)
        self.__completed: dict[str, int] = {}
        self.__clock = 0
        self.__case_ref = case_ref

    @property
    def clock(self) -> int:
        return self.__clock

    def complete_event(self, event_id: str, *, at: int) -> None:
        if isinstance(at, bool) or not isinstance(at, int) or at < 0:
            raise EvidenceGateError("Event time must be a nonnegative integer ordinal")
        if at < self.__clock:
            raise EvidenceGateError("Cannot rewind evidence time")
        if event_id in self.__completed:
            if self.__completed[event_id] != at:
                raise EvidenceGateError("Event already completed at another time")
            return
        if not event_id.strip():
            raise EvidenceGateError("Empty event identifier")
        self.__completed[event_id] = at
        self.__clock = at

    def available(self) -> tuple[Evidence, ...]:
        return tuple(r.evidence for r in self.__releases
                     if r.evidence.available_at <= self.__clock
                     and r.prerequisite_events <= self.__completed.keys())

    def snapshot(self) -> ClinicalState:
        return ClinicalState(case_ref=self.__case_ref, clock=self.__clock,
                             available_evidence=self.available())

    def validate_references(self, evidence_ids: tuple[str, ...]) -> None:
        if not set(evidence_ids) <= {e.evidence_id for e in self.available()}:
            raise EvidenceGateError("Unavailable evidence reference")


class LeakageAudit(StrictModel):
    """Evaluation-only result. Must never enter an agent prompt or retry feedback."""

    unavailable_reference_count: int = Field(ge=0)
    exact_future_text_matches: int = Field(ge=0)
    limitation: str = "Exact-string screening does not detect all semantic/paraphrased leakage."


def audit_future_leakage(*, visible: ClinicalState, complete_evidence: tuple[Evidence, ...],
                         generated_text: str, evidence_ids: tuple[str, ...] = ()) -> LeakageAudit:
    """Post-hoc screen; no hidden phrases or oracle feedback returned to the policy."""
    known = {e.evidence_id for e in visible.available_evidence}
    visible_text = "\n".join(e.text for e in visible.available_evidence).casefold()
    future = [e for e in complete_evidence if e.evidence_id not in known]
    matches = sum(1 for e in future if len(e.text.strip()) >= 8
                  and e.text.casefold() in generated_text.casefold()
                  and e.text.casefold() not in visible_text)
    return LeakageAudit(unavailable_reference_count=len(set(evidence_ids) - known),
                        exact_future_text_matches=matches)
