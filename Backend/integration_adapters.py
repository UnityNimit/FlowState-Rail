"""CSV/JSON adapters for departmental maintenance and operations feeds."""
from __future__ import annotations

import csv
import io
import json
from dataclasses import dataclass

from risk_engine import score_task


SOURCE_SPECS = {
    "tms": {"required": ["id", "asset_id"], "type": "track_maintenance", "department": "ENGINEERING"},
    "smms": {"required": ["id", "asset_id"], "type": "signalling_maintenance", "department": "S&T"},
    "tdms": {"required": ["id", "asset_id"], "type": "traction_maintenance", "department": "TRD"},
    "coa": {"required": ["id", "start_time", "end_time"], "type": "corridor_window", "department": "CONTROL"},
    "timetable": {"required": ["id", "train_no", "start_time"], "type": "train_movement", "department": "CONTROL"},
    "goods-forecast": {"required": ["id", "time_band", "direction"], "type": "goods_forecast", "department": "CONTROL"},
}


TEMPLATE_FIELDS = {
    "tms": ["id", "asset_id", "zone_id", "crew_id", "machine_id", "description", "criticality", "severity", "overdue_days", "duration_minutes", "deadline_day"],
    "smms": ["id", "asset_id", "zone_id", "crew_id", "description", "criticality", "failure_probability", "overdue_days", "duration_minutes", "deadline_day"],
    "tdms": ["id", "asset_id", "zone_id", "ohe_group", "crew_id", "machine_id", "description", "criticality", "severity", "overdue_days", "duration_minutes", "deadline_day"],
    "coa": ["id", "start_time", "end_time", "direction", "capacity_percent", "blocked_resources"],
    "timetable": ["id", "train_no", "train_type", "start_time", "end_time", "route_id", "direction", "priority"],
    "goods-forecast": ["id", "time_band", "direction", "p50_trains", "p90_trains", "confidence"],
}


def parse_rows(filename: str, content: bytes) -> list[dict]:
    text = content.decode("utf-8-sig")
    if filename.lower().endswith(".json"):
        value = json.loads(text)
        rows = value if isinstance(value, list) else value.get("records", [])
    else:
        rows = list(csv.DictReader(io.StringIO(text)))
    if not isinstance(rows, list):
        raise ValueError("Input must contain a list of records")
    return [dict(row) for row in rows]


def validate_and_normalize(source: str, rows: list[dict]) -> tuple[list[dict], list[dict]]:
    spec = SOURCE_SPECS[source]
    accepted, errors = [], []
    seen = set()
    for index, raw in enumerate(rows, start=2):
        missing = [field for field in spec["required"] if not str(raw.get(field, "")).strip()]
        if missing:
            errors.append({"row": index, "fields": missing, "message": "Missing required value"})
            continue
        source_id = str(raw["id"]).strip()
        if source_id in seen:
            errors.append({"row": index, "fields": ["id"], "message": "Duplicate record in upload"})
            continue
        seen.add(source_id)
        payload = {key: value for key, value in raw.items() if value not in (None, "")}
        payload["department"] = spec["department"]
        payload["source"] = source.upper()
        if source in {"tms", "smms", "tdms"}:
            aliases = {
                "overdue_days": "overdueDays", "duration_minutes": "durationMinutes",
                "asset_id": "assetId", "zone_id": "maintenanceZoneId",
                "failure_probability": "failureProbability",
            }
            for old, new in aliases.items():
                if old in payload:
                    payload[new] = payload[old]
            resources = [payload.get(key) for key in ("asset_id", "zone_id", "ohe_group", "crew_id", "machine_id") if payload.get(key)]
            payload["resources"] = list(dict.fromkeys(str(value).strip() for value in resources))
            payload["risk"] = score_task(payload)
        accepted.append({
            "source_record_id": source_id,
            "record_type": spec["type"],
            "asset_id": payload.get("asset_id") or payload.get("assetId"),
            "confidence": float(payload.get("confidence", 1) or 1),
            "payload": payload,
        })
    return accepted, errors


def template_csv(source: str) -> str:
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=TEMPLATE_FIELDS[source])
    writer.writeheader()
    return output.getvalue()
