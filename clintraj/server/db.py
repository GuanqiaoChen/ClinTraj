from datetime import datetime, timezone
from functools import lru_cache
from uuid import uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, create_engine
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from .config import settings


def now():
    return datetime.now(timezone.utc)


def uid():
    return uuid4().hex


class Base(DeclarativeBase):
    pass


class KnowledgeSource(Base):
    __tablename__ = "knowledge_sources"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    corpus: Mapped[str] = mapped_column(String, index=True)
    title: Mapped[str] = mapped_column(Text)
    version: Mapped[str] = mapped_column(Text)
    citation: Mapped[str] = mapped_column(Text)
    license: Mapped[str] = mapped_column(Text)
    content_sha256: Mapped[str] = mapped_column(String(64))
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("knowledge_sources.id"), index=True)
    corpus: Mapped[str] = mapped_column(String, index=True)
    document_id: Mapped[str] = mapped_column(String, index=True)
    text: Mapped[str] = mapped_column(Text)
    concept_ids: Mapped[list] = mapped_column(JSONB, default=list)
    content_sha256: Mapped[str] = mapped_column(String(64))
    embedding: Mapped[list] = mapped_column(Vector(384))
    embedding_m3: Mapped[list | None] = mapped_column(Vector(1024), nullable=True)
    sparse_m3: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    retrieval_model: Mapped[str | None] = mapped_column(Text, nullable=True)
    search_vector: Mapped[str] = mapped_column(TSVECTOR)
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    __table_args__ = (
        Index("ix_chunks_hnsw", "embedding", postgresql_using="hnsw",
              postgresql_ops={"embedding": "vector_cosine_ops"}),
        Index("ix_chunks_fts", "search_vector", postgresql_using="gin"),
    )


class HistoricalCase(Base):
    __tablename__ = "historical_cases"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("knowledge_sources.id"))
    graph: Mapped[dict] = mapped_column(JSONB)
    review_status: Mapped[str] = mapped_column(String)
    is_synthetic: Mapped[bool] = mapped_column(default=False)


class PatientSession(Base):
    __tablename__ = "current_patient_sessions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    title: Mapped[str] = mapped_column(String(160))
    state: Mapped[dict] = mapped_column(JSONB)
    synthetic: Mapped[bool] = mapped_column(default=False)
    simulate_evidence: Mapped[bool] = mapped_column(default=False, server_default="false")
    provider: Mapped[str] = mapped_column(String, default="local")
    external_consent: Mapped[bool] = mapped_column(default=False)
    status: Mapped[str] = mapped_column(String, default="ready")
    revision: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class PatientEvidence(Base):
    __tablename__ = "current_patient_evidence"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    session_id: Mapped[str] = mapped_column(ForeignKey(PatientSession.id), index=True)
    evidence: Mapped[dict] = mapped_column(JSONB)
    prerequisite_events: Mapped[list] = mapped_column(JSONB, default=list)


class DecisionRun(Base):
    __tablename__ = "current_decision_runs"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    session_id: Mapped[str] = mapped_column(ForeignKey(PatientSession.id), index=True)
    status: Mapped[str] = mapped_column(String, default="running")
    recommendation: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    bundle: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    physician_decision: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class TraceRecord(Base):
    __tablename__ = "current_trace_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(ForeignKey(PatientSession.id), index=True)
    run_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    event: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


@lru_cache
def engine():
    return create_engine(settings().database_url, pool_pre_ping=True, hide_parameters=True)


def db_session():
    return sessionmaker(engine(), expire_on_commit=False)()
