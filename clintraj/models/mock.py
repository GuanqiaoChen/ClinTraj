"""Local deterministic workflow fixtures, not a clinically validated model."""

import json
from collections.abc import Callable, Mapping
from typing import Any

from clintraj.models.base import ModelMetadata, ModelRequest


class DeterministicMockAdapter:
    """No network. Overrides support scientifically controlled synthetic tests.

    The default generator only requests reassessment. It cannot diagnose, choose
    medication, or establish safety and must not be interpreted as clinical AI.
    Only role names are retained, never patient payloads.
    """

    def __init__(self, responses: Mapping[str, dict[str, Any] | Callable[[ModelRequest], dict[str, Any]]] | None = None) -> None:
        self.metadata = ModelMetadata(provider="local_fixture", model_identifier="conservative-workflow-fixture", model_version="1.0.0")
        self.responses = dict(responses or {})
        self.calls: list[str] = []

    def generate(self, request: ModelRequest) -> str:
        self.calls.append(request.role)
        override = self.responses.get(request.role)
        if override is not None:
            return json.dumps(override(request) if callable(override) else override)
        state = request.payload.get("state", {})
        evidence_ids = [e["evidence_id"] for e in state.get("available_evidence", [])]
        candidates = request.payload.get("candidates", [])
        result: dict[str, Any]
        if request.role == "state_interpreter":
            result = {"summary": "Available evidence requires clinician interpretation.", "evidence_ids": evidence_ids,
                      "risk_flags": [], "uncertainty": ["Fixture model does not interpret clinical findings."]}
        elif request.role == "problem_manager":
            result = {"differential": [], "evidence_ids": evidence_ids, "problem_summaries": {},
                      "suggested_specialties": [], "uncertainty": ["Problem formulation requires a validated model or physician."]}
        elif request.role == "action_generator":
            active = state.get("active_problems", [])
            result = {"candidates": [{"candidate_id": "reassess-available-evidence", "action_type": "REASSESS",
                      "action": "Ask the treating physician to reassess the currently available evidence.",
                      "rationale": "The local fixture cannot make clinical decisions.", "evidence_ids": evidence_ids,
                      "problem_id": active[0]["problem_id"] if active else "P1",
                      "relation": "CONTINUE" if active else "START",
                      "new_problem_label": None if active else "Undifferentiated presenting concern",
                      "uncertainty": ["All clinical utility dimensions remain unknown."]}]}
        elif request.role == "information_gain":
            result = {"assessments": {}, "uncertainty": ["No information-gain model has been calibrated."]}
        elif request.role == "specialist":
            result = {"specialty": request.payload["specialty"], "candidate_ids": [a["candidate_id"] for a in candidates],
                      "evidence_ids": evidence_ids, "advice": "Specialist physician review is required.", "concerns": []}
        elif request.role == "grounding":
            result = {"supported_candidate_ids": [], "citation_ids": [], "limitations": ["Fixture does not assert guideline support."]}
        elif request.role == "safety_critic":
            result = {"assessments": [{"candidate_id": a["candidate_id"], "findings": []} for a in candidates],
                      "uncertainty": ["Rule checks cannot establish clinical safety."]}
        elif request.role == "arbiter":
            result = {"explanation": "Uncalibrated ordinal ranking with independent safety exclusions; physician review is mandatory.",
                      "uncertainty": ["No demonstrated clinical utility."]}
        else:
            raise ValueError(f"Unsupported mock role: {request.role}")
        return json.dumps(result)
