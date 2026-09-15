from datetime import datetime, timezone
from typing import Literal

from pydantic import Field

from clintraj.domain.schemas import StrictModel

from .db import TraceRecord, db_session

EventType = Literal[
    "EVIDENCE_UNLOCKED", "STATE_UPDATED", "PROBLEM_CREATED", "PROBLEM_SUSPENDED",
    "PROBLEM_RESUMED", "BRANCH_CREATED", "AGENT_STARTED", "AGENT_COMPLETED",
    "RETRIEVAL_COMPLETED", "ACTION_PROPOSED", "SAFETY_WARNING", "ARBITRATION_COMPLETED",
    "PHYSICIAN_DECISION", "NODE_FINALIZED", "RUN_FAILED", "RUN_COMPLETED",
]


class TraceEvent(StrictModel):
    type: EventType
    agent: str
    data: dict = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


def event_record(session_id: str, run_id: str | None, kind: EventType, agent: str, data: dict):
    event = TraceEvent(type=kind, agent=agent, data=data)
    return TraceRecord(session_id=session_id, run_id=run_id, event=event.model_dump(mode="json"))


def emitter(session_id: str, run_id: str | None = None):
    def emit(kind: EventType, agent: str, data: dict):
        with db_session() as db:
            db.add(event_record(session_id, run_id, kind, agent, data))
            db.commit()
    return emit
