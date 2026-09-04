"""FastAPI surface for imports, planning, approval, reporting and BDMS demo output."""
from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Header, HTTPException, UploadFile
from fastapi.responses import PlainTextResponse
from itsdangerous import BadSignature, URLSafeSerializer
from pydantic import BaseModel, Field
from sqlalchemy import select

from block_planner import BlockPlanningEngine
from integration_adapters import SOURCE_SPECS, parse_rows, template_csv, validate_and_normalize
from object_storage import ObjectStorage
from planning_models import Artifact, ImportRun, OperationalRecord, PlanDecision, PlanRun, SessionLocal, Workspace
from risk_engine import MODEL_CARD, score_task


router = APIRouter(prefix="/api/v1")
storage = ObjectStorage()
signer = URLSafeSerializer(os.getenv("WORKSPACE_TOKEN_SECRET", "local-demo-change-me"), salt="flowstate-workspace-v1")


class PlanRequest(BaseModel):
    horizon: str = "weekly"
    policy: str = "balanced"
    stationCode: str = "CORRIDOR"


class DecisionRequest(BaseModel):
    status: str
    reviewerName: str = Field(min_length=2, max_length=120)
    reviewerRole: str = Field(min_length=2, max_length=64)
    comment: str = ""


class ApplyPlanRequest(BaseModel):
    blockId: str | None = None


def _serialize(value):
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def resolve_workspace_token(token: str | None) -> str:
    if not token:
        raise ValueError("Create an anonymous workspace first")
    try:
        payload = signer.loads(token)
        workspace_id = payload["workspaceId"]
    except (BadSignature, KeyError, TypeError):
        raise ValueError("Invalid workspace token")
    with SessionLocal() as db:
        row = db.get(Workspace, workspace_id)
        now = datetime.now(timezone.utc)
        expiry = row.expires_at.replace(tzinfo=timezone.utc) if row and row.expires_at.tzinfo is None else (row.expires_at if row else now)
        if not row or (not row.pinned and expiry <= now):
            raise ValueError("Workspace expired")
    return workspace_id


def _workspace(token: str | None = Header(default=None, alias="X-Workspace-Token")) -> str:
    try:
        return resolve_workspace_token(token)
    except ValueError as exc:
        raise HTTPException(401, str(exc))


def _record_dict(record: OperationalRecord):
    value = dict(record.payload)
    value.update({"id": record.source_record_id, "assetId": record.asset_id, "source": record.source, "provenance": record.provenance, "confidence": record.confidence, "representative": record.representative})
    if record.record_type.endswith("maintenance"):
        value["risk"] = value.get("risk") or score_task(value)
    return value


def _seed_records(workspace_id: str):
    data_path = Path(__file__).parent / "data" / "corridor_layout.json"
    if not data_path.exists():
        return
    network = json.loads(data_path.read_text(encoding="utf-8"))["network"]
    with SessionLocal() as db:
        exists = db.scalar(select(OperationalRecord).where(OperationalRecord.workspace_id == workspace_id).limit(1))
        if exists:
            return
        for task in network.get("maintenanceTasks", []):
            payload = dict(task)
            payload["risk"] = score_task(payload)
            db.add(OperationalRecord(id=str(uuid.uuid4()), workspace_id=workspace_id, source=task.get("sourceSystem", task.get("department", "TMS")), record_type="track_maintenance", source_record_id=task["id"], asset_id=(task.get("affectedAssets") or [task.get("maintenanceZoneId")])[0], confidence=0.72, provenance="representative", representative=True, payload=payload))
        db.commit()


@router.post("/workspaces/anonymous")
def create_workspace():
    workspace_id = str(uuid.uuid4())
    expires = datetime.now(timezone.utc) + timedelta(hours=int(os.getenv("WORKSPACE_TTL_HOURS", "24")))
    with SessionLocal() as db:
        db.add(Workspace(id=workspace_id, expires_at=expires))
        db.commit()
    _seed_records(workspace_id)
    return {"workspaceId": workspace_id, "token": signer.dumps({"workspaceId": workspace_id}), "expiresAt": expires.isoformat(), "demoMode": True}


@router.get("/templates/{source}", response_class=PlainTextResponse)
def download_template(source: str):
    if source not in SOURCE_SPECS:
        raise HTTPException(404, "Unknown integration source")
    return PlainTextResponse(template_csv(source), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{source}-template.csv"'})


@router.post("/imports/{source}")
async def upload_import(source: str, file: UploadFile = File(...), workspace_id: str = Depends(_workspace)):
    if source not in SOURCE_SPECS:
        raise HTTPException(404, "Unknown integration source")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(413, "Upload exceeds 10 MB demo limit")
    checksum = hashlib.sha256(content).hexdigest()
    try:
        rows = parse_rows(file.filename or "upload.csv", content)
        accepted, errors = validate_and_normalize(source, rows)
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(422, str(exc))
    import_id = str(uuid.uuid4())
    path = f"{workspace_id}/imports/{import_id}/{file.filename or 'upload.csv'}"
    storage_path = await storage.put(path, content, file.content_type or "application/octet-stream")
    with SessionLocal() as db:
        prior_ids = set(db.scalars(select(OperationalRecord.source_record_id).where(OperationalRecord.workspace_id == workspace_id, OperationalRecord.source == source.upper())).all())
        fresh = [row for row in accepted if row["source_record_id"] not in prior_ids]
        duplicates = len(accepted) - len(fresh)
        run = ImportRun(id=import_id, workspace_id=workspace_id, source=source.upper(), filename=file.filename or "upload", checksum=checksum, status="IMPORTED" if fresh else "VALIDATED", row_count=len(rows), accepted_count=len(fresh), duplicate_count=duplicates, errors=errors, storage_path=storage_path)
        db.add(run)
        for row in fresh:
            db.add(OperationalRecord(id=str(uuid.uuid4()), workspace_id=workspace_id, import_id=import_id, source=source.upper(), record_type=row["record_type"], source_record_id=row["source_record_id"], asset_id=row["asset_id"], confidence=row["confidence"], provenance="uploaded", representative=False, payload=row["payload"]))
        db.commit()
    return {"id": import_id, "source": source.upper(), "filename": file.filename, "checksum": checksum, "rowCount": len(rows), "acceptedCount": len(fresh), "duplicateCount": duplicates, "errors": errors, "status": run.status}


@router.get("/imports")
def list_imports(workspace_id: str = Depends(_workspace)):
    with SessionLocal() as db:
        rows = db.scalars(select(ImportRun).where(ImportRun.workspace_id == workspace_id).order_by(ImportRun.created_at.desc())).all()
        return [{"id": r.id, "source": r.source, "filename": r.filename, "status": r.status, "rowCount": r.row_count, "acceptedCount": r.accepted_count, "duplicateCount": r.duplicate_count, "errors": r.errors, "createdAt": r.created_at.isoformat()} for r in rows]


@router.get("/imports/{import_id}/errors")
def import_errors(import_id: str, workspace_id: str = Depends(_workspace)):
    with SessionLocal() as db:
        row = db.get(ImportRun, import_id)
        if not row or row.workspace_id != workspace_id:
            raise HTTPException(404, "Import not found")
        return {"id": row.id, "errors": row.errors}


@router.get("/assets")
def list_assets(workspace_id: str = Depends(_workspace)):
    with SessionLocal() as db:
        records = db.scalars(select(OperationalRecord).where(OperationalRecord.workspace_id == workspace_id)).all()
        grouped = {}
        for record in records:
            if not record.asset_id:
                continue
            grouped.setdefault(record.asset_id, {"id": record.asset_id, "sources": set(), "records": 0, "highestRisk": 0})
            grouped[record.asset_id]["sources"].add(record.source)
            grouped[record.asset_id]["records"] += 1
            grouped[record.asset_id]["highestRisk"] = max(grouped[record.asset_id]["highestRisk"], _record_dict(record).get("risk", {}).get("score", 0))
        return [{**value, "sources": sorted(value["sources"])} for value in grouped.values()]


@router.get("/maintenance/tasks")
def list_tasks(workspace_id: str = Depends(_workspace)):
    with SessionLocal() as db:
        records = db.scalars(select(OperationalRecord).where(OperationalRecord.workspace_id == workspace_id, OperationalRecord.record_type.like("%maintenance"))).all()
        return sorted((_record_dict(record) for record in records), key=lambda row: row["risk"]["score"], reverse=True)


def _planning_inputs(db, workspace_id):
    records = db.scalars(select(OperationalRecord).where(OperationalRecord.workspace_id == workspace_id)).all()
    tasks = [_record_dict(r) for r in records if r.record_type.endswith("maintenance")]
    windows = [_record_dict(r) for r in records if r.record_type == "corridor_window"]
    forecasts = [_record_dict(r) for r in records if r.record_type == "goods_forecast"]
    return tasks, windows, forecasts


@router.post("/plans")
def create_plan(request: PlanRequest, workspace_id: str = Depends(_workspace)):
    plan_id = str(uuid.uuid4())
    with SessionLocal() as db:
        tasks, windows, forecasts = _planning_inputs(db, workspace_id)
        result = BlockPlanningEngine().solve(tasks, windows, forecasts, request.horizon, request.policy)
        status = "OPTIMIZED" if result["status"] not in {"EMPTY", "INFEASIBLE"} else result["status"]
        row = PlanRun(id=plan_id, workspace_id=workspace_id, horizon=result["horizon"], policy=result["policy"], status=status, request_payload=request.model_dump(), result_payload=result, objective=result.get("objective", {}), warnings=result.get("warnings", []), solver_runtime_ms=result.get("solverRuntimeMs", 0))
        db.add(row)
        db.commit()
    return {"id": plan_id, "version": 1, "lifecycleStatus": status, **result}


@router.get("/plans")
def list_plans(workspace_id: str = Depends(_workspace)):
    with SessionLocal() as db:
        rows = db.scalars(select(PlanRun).where(PlanRun.workspace_id == workspace_id).order_by(PlanRun.created_at.desc())).all()
        return [{"id": r.id, "horizon": r.horizon, "policy": r.policy, "status": r.status, "version": r.version, "createdAt": r.created_at.isoformat(), "kpis": r.result_payload.get("kpis", {}), "warnings": r.warnings} for r in rows]


@router.get("/plans/{plan_id}")
def get_plan(plan_id: str, workspace_id: str = Depends(_workspace)):
    with SessionLocal() as db:
        row = db.get(PlanRun, plan_id)
        if not row or row.workspace_id != workspace_id:
            raise HTTPException(404, "Plan not found")
        return {"id": row.id, "version": row.version, "lifecycleStatus": row.status, **row.result_payload}


@router.post("/plans/{plan_id}/replan")
def replan(plan_id: str, request: PlanRequest, workspace_id: str = Depends(_workspace)):
    with SessionLocal() as db:
        previous = db.get(PlanRun, plan_id)
        if not previous or previous.workspace_id != workspace_id:
            raise HTTPException(404, "Plan not found")
        tasks, windows, forecasts = _planning_inputs(db, workspace_id)
        frozen = [b for b in previous.result_payload.get("blocks", []) if b.get("status") in {"STARTED", "APPROVED"}]
        result = BlockPlanningEngine().solve(tasks, windows, forecasts, request.horizon, request.policy, frozen)
        replacement = PlanRun(id=str(uuid.uuid4()), workspace_id=workspace_id, horizon=result["horizon"], policy=result["policy"], status="OPTIMIZED", version=previous.version + 1, supersedes_id=previous.id, request_payload=request.model_dump(), result_payload=result, objective=result.get("objective", {}), warnings=result.get("warnings", []), solver_runtime_ms=result.get("solverRuntimeMs", 0))
        db.add(replacement)
        db.commit()
        return {"id": replacement.id, "version": replacement.version, "lifecycleStatus": replacement.status, **result}


TRANSITIONS = {
    "OPTIMIZED": {"DEPARTMENT_REVIEW", "REJECTED"}, "DEPARTMENT_REVIEW": {"CONTROL_REVIEW", "REJECTED"},
    "CONTROL_REVIEW": {"APPROVED", "REJECTED"}, "APPROVED": {"EXPORTED"},
    "EXPORTED": {"MOCK_SUBMITTED"}, "MOCK_SUBMITTED": {"ACKNOWLEDGED"},
}


@router.post("/plans/{plan_id}/decisions")
def decide(plan_id: str, request: DecisionRequest, workspace_id: str = Depends(_workspace)):
    target = request.status.upper()
    with SessionLocal() as db:
        plan = db.get(PlanRun, plan_id)
        if not plan or plan.workspace_id != workspace_id:
            raise HTTPException(404, "Plan not found")
        if target not in TRANSITIONS.get(plan.status, set()):
            raise HTTPException(409, f"Cannot move plan from {plan.status} to {target}")
        decision = PlanDecision(id=str(uuid.uuid4()), workspace_id=workspace_id, plan_id=plan.id, from_status=plan.status, to_status=target, reviewer_name=request.reviewerName, reviewer_role=request.reviewerRole, comment=request.comment)
        plan.status = target
        db.add(decision)
        db.commit()
        return {"planId": plan.id, "status": plan.status, "decisionId": decision.id, "demoAuthorization": True}


@router.get("/plans/{plan_id}/kpis")
def plan_kpis(plan_id: str, workspace_id: str = Depends(_workspace)):
    return get_plan(plan_id, workspace_id).get("kpis", {})


@router.post("/plans/{plan_id}/apply-to-simulation")
def apply_plan_to_simulation(plan_id: str, request: ApplyPlanRequest, workspace_id: str = Depends(_workspace)):
    """Return the exact resource reservation envelope for the Socket.IO controller.

    The API remains persistence-focused; the frontend emits the existing
    controller_set_track_status/controller_set_maintenance_zone events using
    this validated envelope, preserving the established simulation contract.
    """
    plan = get_plan(plan_id, workspace_id)
    blocks = plan.get("blocks", [])
    if request.blockId:
        blocks = [block for block in blocks if block["id"] == request.blockId]
    if not blocks:
        raise HTTPException(404, "No matching block in this plan")
    resources = sorted({resource for block in blocks for resource in block.get("resources", [])})
    zones = sorted({block["zoneId"] for block in blocks if block.get("zoneId")})
    return {"planId": plan_id, "blockIds": [block["id"] for block in blocks], "resources": resources, "maintenanceZones": zones, "socketEvents": [{"event": "controller_set_maintenance_zone", "data": {"zoneId": zone, "active": True}} for zone in zones], "safetyValidated": plan.get("unsafeConflicts", 0) == 0}


def _artifact_payload(plan: PlanRun):
    return {"planningSchemaVersion": 1, "planId": plan.id, "version": plan.version, "status": plan.status, "generatedAt": datetime.now(timezone.utc).isoformat(), "blocks": plan.result_payload.get("blocks", []), "safety": {"unsafeConflicts": plan.result_payload.get("unsafeConflicts", 0)}, "provenance": "FlowState Rail decision-support demonstration"}


@router.post("/plans/{plan_id}/exports")
async def export_plan(plan_id: str, format: str = "json", workspace_id: str = Depends(_workspace)):
    with SessionLocal() as db:
        plan = db.get(PlanRun, plan_id)
        if not plan or plan.workspace_id != workspace_id:
            raise HTTPException(404, "Plan not found")
        if plan.status not in {"APPROVED", "EXPORTED"}:
            raise HTTPException(409, "Approve the plan before export")
        payload = _artifact_payload(plan)
        export_format = format.lower()
        if export_format == "csv":
            output = io.StringIO()
            fields = ["plan_id", "version", "block_id", "day", "start_minute", "duration_minutes", "departments", "resources", "task_ids", "p90_stress", "unsafe_conflicts"]
            writer = csv.DictWriter(output, fieldnames=fields)
            writer.writeheader()
            for block in payload["blocks"]:
                writer.writerow({"plan_id": plan.id, "version": plan.version, "block_id": block["id"], "day": block["day"], "start_minute": block["startMinute"], "duration_minutes": block["durationMinutes"], "departments": "|".join(block.get("departments", [])), "resources": "|".join(block.get("resources", [])), "task_ids": "|".join(block.get("taskIds", [])), "p90_stress": block.get("p90Stress", False), "unsafe_conflicts": payload["safety"]["unsafeConflicts"]})
            content = output.getvalue().encode()
            content_type, extension = "text/csv", "csv"
        else:
            content = json.dumps(payload, indent=2).encode()
            content_type, extension, export_format = "application/json", "json", "json"
        checksum = hashlib.sha256(content).hexdigest()
        artifact_id = str(uuid.uuid4())
        path = await storage.put(f"{workspace_id}/exports/{artifact_id}.{extension}", content, content_type)
        db.add(Artifact(id=artifact_id, workspace_id=workspace_id, plan_id=plan.id, artifact_type=f"BDMS_{export_format.upper()}", checksum=checksum, storage_path=path, payload=payload))
        plan.status = "EXPORTED"
        db.commit()
        return {"id": artifact_id, "planId": plan.id, "checksum": checksum, "format": export_format.upper(), "status": plan.status, "payload": payload}


@router.post("/plans/{plan_id}/bdms/mock-submit")
def mock_submit(plan_id: str, workspace_id: str = Depends(_workspace)):
    with SessionLocal() as db:
        plan = db.get(PlanRun, plan_id)
        if not plan or plan.workspace_id != workspace_id:
            raise HTTPException(404, "Plan not found")
        if plan.status != "EXPORTED":
            raise HTTPException(409, "Export the approved plan before submission")
        acknowledgement = "BDMS-DEMO-" + hashlib.sha256(f"{plan.id}:{plan.version}".encode()).hexdigest()[:12].upper()
        payload = {"acknowledgementId": acknowledgement, "submittedAt": datetime.now(timezone.utc).isoformat(), "endpoint": "mock://bdms/block-plans", "message": "Demonstration acknowledgement; no Railway system was contacted"}
        db.add(Artifact(id=str(uuid.uuid4()), workspace_id=workspace_id, plan_id=plan.id, artifact_type="BDMS_ACK", checksum=hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest(), payload=payload))
        plan.status = "ACKNOWLEDGED"
        db.commit()
        return {"planId": plan.id, "status": plan.status, **payload}


@router.get("/model-card")
def model_card():
    return MODEL_CARD
