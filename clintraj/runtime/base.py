"""Runtime-independent physician workflow contract."""

from typing import Any, Protocol

from clintraj.agents.schemas import CandidateAction, PhysicianDecision
from clintraj.domain.clinical_state import ClinicalState


class OfflineExecutor(Protocol):
    def __call__(self, state: ClinicalState, action: CandidateAction, execution_id: str) -> ClinicalState:
        """Replay an approved action; honor execution_id if persistence is added."""
        ...


class RuntimeAdapter(Protocol):
    def start(self, state: ClinicalState, thread_id: str) -> dict[str, Any]: ...
    def resume(self, thread_id: str, decision: PhysicianDecision) -> dict[str, Any]: ...
    def advance(self, thread_id: str) -> dict[str, Any]: ...
    def retry_execution(self, thread_id: str) -> dict[str, Any]: ...
