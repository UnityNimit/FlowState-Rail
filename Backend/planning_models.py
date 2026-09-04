"""Canonical persistence model for FlowState block planning.

Supabase is ordinary PostgreSQL from the backend's perspective.  JSON columns keep
the integration contracts flexible while the stable relational envelope provides
workspace isolation, versioning and an auditable lifecycle.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker


def utcnow():
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Workspace(Base):
    __tablename__ = "workspaces"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    label: Mapped[str] = mapped_column(String(120), default="Anonymous jury workspace")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ImportRun(Base):
    __tablename__ = "import_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    source: Mapped[str] = mapped_column(String(32), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    checksum: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(24), default="VALIDATED")
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    accepted_count: Mapped[int] = mapped_column(Integer, default=0)
    duplicate_count: Mapped[int] = mapped_column(Integer, default=0)
    errors: Mapped[list] = mapped_column(JSON, default=list)
    storage_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class OperationalRecord(Base):
    __tablename__ = "operational_records"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    import_id: Mapped[str | None] = mapped_column(ForeignKey("import_runs.id"), nullable=True)
    source: Mapped[str] = mapped_column(String(32), index=True)
    record_type: Mapped[str] = mapped_column(String(48), index=True)
    source_record_id: Mapped[str] = mapped_column(String(160), index=True)
    asset_id: Mapped[str | None] = mapped_column(String(160), nullable=True, index=True)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    provenance: Mapped[str] = mapped_column(String(24), default="uploaded")
    representative: Mapped[bool] = mapped_column(Boolean, default=False)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class PlanRun(Base):
    __tablename__ = "plan_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    horizon: Mapped[str] = mapped_column(String(16))
    policy: Mapped[str] = mapped_column(String(24), default="balanced")
    status: Mapped[str] = mapped_column(String(32), default="DRAFT", index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    planning_schema_version: Mapped[int] = mapped_column(Integer, default=1)
    request_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    result_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    objective: Mapped[dict] = mapped_column(JSON, default=dict)
    warnings: Mapped[list] = mapped_column(JSON, default=list)
    solver_runtime_ms: Mapped[int] = mapped_column(Integer, default=0)
    supersedes_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class PlanDecision(Base):
    __tablename__ = "plan_decisions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    plan_id: Mapped[str] = mapped_column(ForeignKey("plan_runs.id"), index=True)
    from_status: Mapped[str] = mapped_column(String(32))
    to_status: Mapped[str] = mapped_column(String(32))
    reviewer_name: Mapped[str] = mapped_column(String(120))
    reviewer_role: Mapped[str] = mapped_column(String(64))
    comment: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Artifact(Base):
    __tablename__ = "artifacts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    plan_id: Mapped[str | None] = mapped_column(ForeignKey("plan_runs.id"), nullable=True)
    artifact_type: Mapped[str] = mapped_column(String(32))
    checksum: Mapped[str] = mapped_column(String(64))
    storage_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SimulationCheckpoint(Base):
    __tablename__ = "simulation_checkpoints"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    station_code: Mapped[str] = mapped_column(String(16))
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


def database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip()
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url:
        return url
    runtime = os.path.join(os.path.dirname(__file__), ".runtime")
    os.makedirs(runtime, exist_ok=True)
    return f"sqlite:///{os.path.join(runtime, 'flowstate.db')}"


ENGINE = create_engine(database_url(), pool_pre_ping=True)
SessionLocal = sessionmaker(bind=ENGINE, expire_on_commit=False)


def initialize_database():
    Base.metadata.create_all(ENGINE)
