"""Framework-independent agent contracts; import coordinator from its module."""

from clintraj.agents.schemas import (
    CandidateAction,
    PhysicianDecision,
    PhysicianResponse,
    Recommendation,
)

__all__ = ["CandidateAction", "PhysicianDecision", "PhysicianResponse", "Recommendation"]
