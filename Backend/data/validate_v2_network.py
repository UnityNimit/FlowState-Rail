"""Validate schema-v2 railway layout references and route safety invariants."""

from __future__ import annotations

import csv
import json
import pathlib
import sys


HERE = pathlib.Path(__file__).resolve().parent
NETWORKS = ("corridor", "dli", "dsa", "anvr", "sbb", "gzb")
VALID_DIRECTIONS = {"EAST", "WEST", "BI"}


def validate(name):
    errors = []
    network = json.loads((HERE / f"{name}_layout.json").read_text(encoding="utf-8"))["network"]
    if network.get("schemaVersion") != 2:
        errors.append("schemaVersion must be 2")
    for field in ("metadata", "nodes", "trackSegments", "routes", "maintenanceZones", "maintenanceTasks"):
        if field not in network:
            errors.append(f"missing {field}")
    nodes = {item["id"]: item for item in network.get("nodes", [])}
    segments = {item["id"]: item for item in network.get("trackSegments", [])}
    routes = {item["id"]: item for item in network.get("routes", [])}
    if len(nodes) != len(network.get("nodes", [])):
        errors.append("duplicate node IDs")
    if len(segments) != len(network.get("trackSegments", [])):
        errors.append("duplicate segment IDs")
    if len(routes) != len(network.get("routes", [])):
        errors.append("duplicate route IDs")
    for seg in segments.values():
        if seg.get("startNodeId") not in nodes or seg.get("endNodeId") not in nodes:
            errors.append(f"{seg['id']}: invalid node reference")
        if seg.get("lengthMeters", 0) <= 0:
            errors.append(f"{seg['id']}: non-positive length")
        if seg.get("direction") not in VALID_DIRECTIONS:
            errors.append(f"{seg['id']}: invalid direction")
        if not seg.get("provenance"):
            errors.append(f"{seg['id']}: missing provenance")
    for route_item in routes.values():
        route_segments = route_item.get("segments", [])
        if not route_segments:
            errors.append(f"{route_item['id']}: empty route")
            continue
        current = route_item.get("entrySignalId")
        for seg_id in route_segments:
            seg = segments.get(seg_id)
            if not seg:
                errors.append(f"{route_item['id']}: unknown segment {seg_id}")
                break
            if current == seg["startNodeId"]:
                current = seg["endNodeId"]
            elif current == seg["endNodeId"]:
                if seg.get("direction") != "BI":
                    errors.append(f"{route_item['id']}: traverses directional segment {seg_id} in reverse")
                    break
                current = seg["startNodeId"]
            else:
                errors.append(f"{route_item['id']}: discontinuity at {seg_id}")
                break
        if current != route_item.get("exitSignalId"):
            errors.append(f"{route_item['id']}: route does not terminate at exit signal")
        for point_id in route_item.get("requiredPointPositions", {}):
            if point_id not in nodes or nodes[point_id].get("type") != "SWITCH":
                errors.append(f"{route_item['id']}: invalid required point {point_id}")
        for conflict in route_item.get("conflicts", []):
            if conflict not in routes:
                errors.append(f"{route_item['id']}: unknown conflict {conflict}")
    for zone in network.get("maintenanceZones", []):
        for seg_id in zone.get("affectedSegments", []):
            if seg_id not in segments:
                errors.append(f"{zone['id']}: unknown segment {seg_id}")
        for point_id in zone.get("affectedPoints", []):
            if point_id not in nodes:
                errors.append(f"{zone['id']}: unknown point {point_id}")
    zone_ids = {zone["id"] for zone in network.get("maintenanceZones", [])}
    task_ids = set()
    for task in network.get("maintenanceTasks", []):
        if task["id"] in task_ids:
            errors.append(f"duplicate maintenance task {task['id']}")
        task_ids.add(task["id"])
        if task.get("maintenanceZoneId") not in zone_ids:
            errors.append(f"{task['id']}: invalid maintenance zone")
        if task.get("durationMinutes", 0) <= 0 or not 1 <= task.get("criticality", 0) <= 5:
            errors.append(f"{task['id']}: invalid duration/criticality")
    with (HERE / f"{name}_schedule.csv").open(encoding="utf-8") as handle:
        valid_pairs = {(r["entrySignalId"], r["exitSignalId"]) for r in routes.values()}
        for row in csv.DictReader(handle):
            pair = (row["Start Node"], row["End Node"])
            if pair not in valid_pairs:
                errors.append(f"schedule train {row['Train No']}: no explicit route {pair}")
    return errors


def main():
    all_errors = []
    fingerprints = set()
    for name in NETWORKS:
        errors = validate(name)
        network = json.loads((HERE / f"{name}_layout.json").read_text(encoding="utf-8"))["network"]
        fingerprint = (len(network["nodes"]), len(network["trackSegments"]), tuple(sorted(r["id"] for r in network["routes"])))
        if name != "corridor" and fingerprint in fingerprints:
            errors.append("station topology is not distinct")
        fingerprints.add(fingerprint)
        if errors:
            all_errors.extend(f"{name}: {error}" for error in errors)
        else:
            print(f"OK {name}: {len(network['nodes'])} nodes, {len(network['trackSegments'])} segments, {len(network['routes'])} routes")
    if all_errors:
        print("\n".join(all_errors), file=sys.stderr)
        raise SystemExit(1)
    print("All schema-v2 networks and schedules are valid.")


if __name__ == "__main__":
    main()
