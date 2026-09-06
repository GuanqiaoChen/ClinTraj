"""Explicit specialty routing from problem ownership and consultation requests."""

from clintraj.agents.schemas import CandidateAction
from clintraj.domain.clinical_state import ClinicalState


class SpecialistRouter:
    def __init__(self, specialties: tuple[str, ...] = (
        "neurology", "gastroenterology", "otolaryngology", "pulmonology",
        "orthopedics", "breast_surgery", "urology", "critical_care",
    )) -> None:
        self.specialties = frozenset(specialties)

    def route(self, state: ClinicalState, candidates: tuple[CandidateAction, ...], *,
              include_ownership: bool = True) -> tuple[str, ...]:
        requested = {candidate.specialty for candidate in candidates if candidate.specialty}
        # Existing explicit ownership provides problem-specific routing, without
        # inferring a diagnosis or specialty from an unseen gold trajectory.
        if include_ownership:
            requested.update(p.owner for p in state.active_problems)
        return tuple(sorted(requested & self.specialties))
