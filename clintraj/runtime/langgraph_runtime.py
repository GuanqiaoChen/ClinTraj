"""LangGraph infrastructure for one physician-reviewed clinical step at a time.

Clinical graph meaning remains in domain/problem_manager.py. Checkpoints contain
clinical text: this adapter keeps them in local process memory, never a remote
tracing service. A production implementation needs secure durable storage,
authenticated reviewer identities, and an executor with durable idempotency.

Interrupt semantics: https://docs.langchain.com/oss/python/langgraph/interrupts
"""

import os
from typing import Any, TypedDict

from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

from clintraj.agents.coordinator import ClinicalCoordinator
from clintraj.agents.schemas import PhysicianDecision, Recommendation, ReviewOutcome
from clintraj.domain.clinical_state import ClinicalState
from clintraj.runtime.base import OfflineExecutor


class WorkflowState(TypedDict, total=False):
    clinical_state: dict[str, Any]
    recommendation: dict[str, Any]
    physician_decision: dict[str, Any]
    review_outcome: dict[str, Any]
    execution_id: str
    status: str


class LangGraphRuntimeAdapter:
    """Real checkpoints and HITL interrupts; never automatically approves.

    `start` creates a case thread; `resume` accepts a physician decision; `advance`
    proposes the next clinical step after execution. Recommendation generation is
    outside the interrupt node so resumption does not regenerate the proposal.
    Duplicate completed resumes return the stored snapshot and cannot reexecute.
    """

    def __init__(self, coordinator: ClinicalCoordinator, executor: OfflineExecutor) -> None:
        if any(os.getenv(name, "").lower() in {"true", "1", "yes"}
               for name in ("LANGCHAIN_TRACING_V2", "LANGSMITH_TRACING")):
            raise PermissionError("External tracing is enabled; disable it before handling clinical state")
        self.coordinator = coordinator
        self.executor = executor
        self.checkpointer = InMemorySaver()
        self._receipts: dict[str, ClinicalState] = {}
        builder: StateGraph[WorkflowState, None, WorkflowState, WorkflowState] = StateGraph(WorkflowState)
        builder.add_node("recommend", self._recommend)
        builder.add_node("physician_review", self._physician_review)
        builder.add_node("execute", self._execute)
        builder.add_edge(START, "recommend")
        builder.add_edge("recommend", "physician_review")
        builder.add_conditional_edges("physician_review",
            lambda state: "execute" if state["review_outcome"]["approved"] else "end",
            {"execute": "execute", "end": END})
        builder.add_edge("execute", END)
        self.graph = builder.compile(checkpointer=self.checkpointer)

    @staticmethod
    def _config(thread_id: str) -> RunnableConfig:
        if not thread_id.strip():
            raise ValueError("A nonempty pseudonymous thread_id is required")
        return {"configurable": {"thread_id": thread_id}, "callbacks": []}

    def _recommend(self, state: WorkflowState) -> WorkflowState:
        clinical_state = ClinicalState.model_validate(state["clinical_state"])
        recommendation = self.coordinator.propose(clinical_state)
        return {"recommendation": recommendation.model_dump(mode="json"),
                "execution_id": recommendation.recommendation_id, "status": "awaiting_physician",
                "physician_decision": {}, "review_outcome": {}}

    def _physician_review(self, state: WorkflowState) -> WorkflowState:
        raw_decision = interrupt({"kind": "physician_decision_required",
            "allowed_responses": ["ACCEPT", "MODIFY", "REJECT"],
            "recommendation": state["recommendation"]})
        decision = PhysicianDecision.model_validate(raw_decision)
        outcome = self.coordinator.review(ClinicalState.model_validate(state["clinical_state"]),
            Recommendation.model_validate(state["recommendation"]), decision)
        status = "approved" if outcome.approved else (
            "rejected" if decision.response.value == "REJECT" else "blocked")
        return {"physician_decision": decision.model_dump(mode="json"),
                "review_outcome": outcome.model_dump(mode="json"), "status": status}

    def _execute(self, state: WorkflowState) -> WorkflowState:
        outcome = ReviewOutcome.model_validate(state["review_outcome"])
        if not outcome.approved or outcome.action is None or not state.get("physician_decision"):
            raise PermissionError("Execution requires a physician-approved and safety-screened action")
        execution_id = state["execution_id"]
        if execution_id not in self._receipts:
            observed = ClinicalState.model_validate(state["clinical_state"])
            recommendation = Recommendation.model_validate(state["recommendation"])
            clinical_state = ClinicalState.model_validate(observed.model_dump() | {
                "risk_flags": tuple(dict.fromkeys((*observed.risk_flags, *recommendation.inferred_risk_flags))),
                "differential": recommendation.proposed_differential if self.coordinator.config.multi_agent else observed.differential,
                "uncertainty": tuple(dict.fromkeys((*observed.uncertainty, *recommendation.uncertainty))),
            })
            updated = self.executor(clinical_state, outcome.action, execution_id)
            updated = ClinicalState.model_validate(updated.model_dump())
            if updated.case_ref != clinical_state.case_ref or updated.clock <= clinical_state.clock:
                raise ValueError("Executor must preserve case identity and advance observation time")
            self._receipts[execution_id] = updated
        return {"clinical_state": self._receipts[execution_id].model_dump(mode="json"), "status": "executed"}

    def start(self, state: ClinicalState, thread_id: str) -> dict[str, Any]:
        config = self._config(thread_id)
        if self.graph.get_state(config).values:
            raise ValueError("Thread already exists; use resume or advance")
        return self.graph.invoke({"clinical_state": state.model_dump(mode="json")}, config)

    def resume(self, thread_id: str, decision: PhysicianDecision) -> dict[str, Any]:
        config = self._config(thread_id)
        snapshot = self.graph.get_state(config)
        if not snapshot.values:
            raise ValueError("Unknown clinical workflow thread")
        if not snapshot.next:
            return dict(snapshot.values)
        if snapshot.values.get("status") != "awaiting_physician":
            raise ValueError("Workflow is not waiting for physician input")
        if decision.recommendation_id != snapshot.values["recommendation"]["recommendation_id"]:
            raise ValueError("Physician decision does not match the pending recommendation")
        return self.graph.invoke(Command(resume=decision.model_dump(mode="json")), config)

    def advance(self, thread_id: str) -> dict[str, Any]:
        config = self._config(thread_id)
        snapshot = self.graph.get_state(config)
        if snapshot.next or snapshot.values.get("status") != "executed":
            raise ValueError("Advance requires a completed, executed clinical step")
        return self.graph.invoke({"clinical_state": snapshot.values["clinical_state"]}, config)

    def retry_execution(self, thread_id: str) -> dict[str, Any]:
        """Retry an interrupted executor with the same approved idempotency key.

        The injected callback must itself handle a crash after an external side
        effect but before returning; the adapter cannot infer that side effect.
        No physician approval is inferred from elapsed time or an exception.
        """
        config = self._config(thread_id)
        snapshot = self.graph.get_state(config)
        if snapshot.next != ("execute",) or snapshot.values.get("status") != "approved":
            raise ValueError("No approved failed execution is available to retry")
        return self.graph.invoke(None, config)
