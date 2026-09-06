"""Conservative retrospective replay: no synthesized counterfactual EHR outcomes."""

import hashlib
import hmac
import json
from enum import StrEnum
from typing import Protocol

from pydantic import Field

from clintraj.domain.action_types import ActionType
from clintraj.domain.clinical_state import ClinicalState, Evidence
from clintraj.domain.decision_graph import ClinicalDecisionGraph
from clintraj.domain.schemas import StrictModel

from .temporal import EvidenceRelease, TemporalEvidenceGate


class ReplayMode(StrEnum):
    STRICT = "strict"
    ACCEPTABLE_ALTERNATIVE = "acceptable_alternative"
    COUNTERFACTUAL = "counterfactual"


class UnsupportedReplayError(ValueError):
    pass


class ReplayAction(Protocol):
    action_type: ActionType
    action: str


class AlternativeAction(StrictModel):
    """Evaluator-only equivalence: a reviewer explicitly licenses the observed continuation."""

    step_id: int = Field(gt=0)
    action_type: ActionType
    action: str = Field(min_length=1)
    reviewer_ref: str = Field(min_length=1)
    rationale: str = Field(min_length=1)
    observed_continuation_approved: bool


class ReplayComparison(StrictModel):
    action_type_agreement: bool
    exact_action_agreement: bool
    accepted_alternative: bool = False
    supported: bool


class PatientReplayEnvironment:
    """One ordinal source path, with hidden actions isolated from agent state.

    new_evidence at row n is treated as available just before decision n. Completing
    decision n unlocks the next row. This is a documented replay assumption, not a claim
    of verified event times. Whole-row strict matching deliberately stops unsupported
    actions even when their action types match. Parallel counterfactual order is not inferred.
    """

    def __init__(self, reference: ClinicalDecisionGraph, *, pseudonym_key: bytes,
                 mode: ReplayMode = ReplayMode.STRICT,
                 alternatives: tuple[AlternativeAction, ...] = ()):
        if not pseudonym_key:
            raise ValueError("A local pseudonym key is required")
        if mode == ReplayMode.COUNTERFACTUAL:
            raise UnsupportedReplayError("Counterfactual outcome generation is not implemented")
        self.__reference = reference.ordered_nodes()
        self.__mode = mode
        self.__alternatives = alternatives
        self.__position = 0
        self.__receipts: dict[str, tuple[tuple[str, str], ClinicalState]] = {}
        self.__callback_receipts: dict[str, tuple[str, str, ClinicalState]] = {}
        self.__history: tuple[str, ...] = ()
        ref = hmac.new(pseudonym_key, reference.case_id.encode(), hashlib.sha256).hexdigest()[:20]
        releases = tuple(EvidenceRelease(
            evidence=Evidence(evidence_id=f"observation-{index + 1}", text=node.new_evidence,
                              available_at=index, source=f"trajectory-row-{node.step_id}"),
            prerequisite_events=frozenset({f"decision-{index}"}) if index else frozenset())
            for index, node in enumerate(self.__reference) if node.new_evidence.strip())
        self.__gate = TemporalEvidenceGate(releases, case_ref=f"case-{ref}")

    @property
    def complete(self) -> bool:
        return self.__position == len(self.__reference)

    @property
    def completed_steps(self) -> int:
        return self.__position

    def observe(self) -> ClinicalState:
        state = self.__gate.snapshot()
        return ClinicalState.model_validate(state.model_dump() | {"previous_actions": self.__history})

    def compare(self, action: ReplayAction) -> ReplayComparison:
        if self.complete:
            raise UnsupportedReplayError("Replay has completed")
        gold = self.__reference[self.__position]
        type_match = action.action_type == gold.action_type
        exact = type_match and action.action.strip() == gold.action.strip()
        alternative = self.__mode == ReplayMode.ACCEPTABLE_ALTERNATIVE and any(
            alt.step_id == gold.step_id and alt.action_type == action.action_type
            and alt.action.strip() == action.action.strip() and alt.observed_continuation_approved
            for alt in self.__alternatives)
        return ReplayComparison(action_type_agreement=type_match,
                                exact_action_agreement=exact,
                                accepted_alternative=alternative, supported=exact or alternative)

    def execute(self, action: ReplayAction, *, execution_id: str,
                physician_approved: bool) -> ClinicalState:
        """Only the trusted HITL executor calls this method after review.

        An approval flag is a local research interface, not physician authentication.
        Production identity, signed orders, durable receipts, and access control are future work.
        """
        if not physician_approved:
            raise PermissionError("Physician approval required before evidence release")
        if not execution_id.strip():
            raise ValueError("Execution ID is required")
        fingerprint = (str(action.action_type), action.action.strip())
        if execution_id in self.__receipts:
            prior, snapshot = self.__receipts[execution_id]
            if prior != fingerprint:
                raise ValueError("Execution ID reused for a different action")
            return snapshot
        if not self.compare(action).supported:
            raise UnsupportedReplayError("Action has no supported observed continuation")
        self.__position += 1
        self.__gate.complete_event(f"decision-{self.__position}", at=self.__position)
        self.__history += (action.action,)
        snapshot = self.observe()
        self.__receipts[execution_id] = (fingerprint, snapshot)
        return snapshot

    def executor(self, state: ClinicalState, action: ReplayAction, execution_id: str) -> ClinicalState:
        """Callback for a runtime that has already approved the action through HITL."""
        fingerprint = self._callback_fingerprint(state, action)
        receipt = self._callback_receipt(execution_id, "plain", fingerprint)
        if receipt is not None:
            return receipt
        if state.case_ref != self.observe().case_ref or state.clock != self.__gate.clock:
            raise ValueError("Stale or cross-case execution state")
        updated = self.execute(action, execution_id=execution_id, physician_approved=True)
        self.__callback_receipts[execution_id] = ("plain", fingerprint, updated)
        return updated

    @staticmethod
    def _callback_fingerprint(state: ClinicalState, action: ReplayAction) -> str:
        content = action.model_dump(mode="json") if hasattr(action, "model_dump") else {  # type: ignore[attr-defined]
            "action_type": action.action_type, "action": action.action}
        return hashlib.sha256(json.dumps({"state": state.model_dump(mode="json"),
            "action": content}, sort_keys=True).encode()).hexdigest()

    def _callback_receipt(self, execution_id: str, mode: str, fingerprint: str) -> ClinicalState | None:
        if execution_id not in self.__callback_receipts:
            return None
        previous_mode, previous_fingerprint, snapshot = self.__callback_receipts[execution_id]
        if (mode, fingerprint) != (previous_mode, previous_fingerprint):
            raise ValueError("Execution ID reused with changed state, action, or execution mode")
        return snapshot

    def graph_executor(self, state: ClinicalState, action, execution_id: str) -> ClinicalState:
        """Apply approved domain semantics before releasing the next recorded observations.

        All graph validation precedes environment mutation. Returned state carries the
        executed problem graph, ownership, and inference state into the next decision.
        """
        from clintraj.domain.problem_manager import apply_candidate

        fingerprint = self._callback_fingerprint(state, action)
        receipt = self._callback_receipt(execution_id, "graph", fingerprint)
        if receipt is not None:
            return receipt
        if state.case_ref != self.observe().case_ref or state.clock != self.__gate.clock:
            raise ValueError("Stale or cross-case execution state")
        transitioned = apply_candidate(state, action)
        observed = self.execute(action, execution_id=execution_id, physician_approved=True)
        updated = ClinicalState.model_validate(transitioned.model_dump() | {
            "clock": observed.clock, "available_evidence": observed.available_evidence,
            "previous_actions": observed.previous_actions,
        })
        self.__callback_receipts[execution_id] = ("graph", fingerprint, updated)
        return updated
