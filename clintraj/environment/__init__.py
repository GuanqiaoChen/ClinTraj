"""Evaluator-owned patient environments. Never pass these objects to agents."""

from .temporal import EvidenceRelease, TemporalEvidenceGate

__all__ = ["EvidenceRelease", "TemporalEvidenceGate"]
