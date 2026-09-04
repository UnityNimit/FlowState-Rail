"""Build the deterministic, authentic schema-v2 Delhi–Ghaziabad demonstration network.

Models complete Indian Railways section anatomy:
- 4-aspect MACLS automatic block signaling
- Fast through mainlines and platform loop lines
- Locomotive run-around / engine reversal loops at DLI and ANVR
- Universal scissors crossovers and junction throat ladders
- SBB CONCOR freight loop and GZB Electric Locomotive Shed (ELS) depot leads
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import pathlib
import urllib.parse
import urllib.request
from datetime import date

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
PUBLIC_DATA = ROOT / "frontend" / "public" / "data"
SNAPSHOT = HERE / "delhi_gzb_osm_snapshot.json"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
SNAPSHOT_DATE = "2026-09-04"

STATIONS = [
    {"code": "DLI", "name": "Delhi Junction", "hindi": "दिल्ली जंक्शन", "lat": 28.6619, "lon": 77.2273, "chainageKm": 0.0, "platformCount": 16, "kind": "junction-yard"},
    {"code": "DSA", "name": "Delhi Shahdara Junction", "hindi": "दिल्ली शाहदरा जंक्शन", "lat": 28.6734, "lon": 77.2892, "chainageKm": 7.1, "platformCount": 4, "kind": "junction"},
    {"code": "ANVR", "name": "Anand Vihar Terminal", "hindi": "आनंद विहार टर्मिनल", "lat": 28.6469, "lon": 77.3160, "chainageKm": 10.8, "platformCount": 7, "kind": "terminal"},
    {"code": "SBB", "name": "Sahibabad Junction", "hindi": "साहिबाबाद जंक्शन", "lat": 28.6735, "lon": 77.3672, "chainageKm": 16.4, "platformCount": 4, "kind": "junction-freight"},
    {"code": "GZB", "name": "Ghaziabad Junction", "hindi": "गाज़ियाबाद जंक्शन", "lat": 28.6507, "lon": 77.4370, "chainageKm": 24.8, "platformCount": 6, "kind": "major-junction"},
]

CONNECTIONS = {
    "DLI": ("AMBALA / ROHTAK / REWARI", "YAMUNA BRIDGE / GHAZIABAD"),
    "DSA": ("DELHI JN / YAMUNA BRIDGE", "SAHIBABAD / GHAZIABAD"),
    "ANVR": ("TILAK BRIDGE / DELHI", "SAHIBABAD / GHAZIABAD"),
    "SBB": ("ANAND VIHAR / DELHI", "GHAZIABAD"),
    "GZB": ("SAHIBABAD / DELHI", "MEERUT / ALIGARH / MORADABAD"),
}

DISCLAIMER = (
    "Geography is derived from OpenStreetMap. Signals, routes, track circuits, "
    "speeds, OHE groups and maintenance resources are representative demonstration "
    "assumptions conforming to Indian Railways G&SR principles."
)


def refresh_osm() -> None:
    query = """
[out:json][timeout:180];
(
  way[railway~"^(rail|platform)$"](28.61,77.19,28.72,77.48);
  node[railway~"^(station|halt|switch|signal|buffer_stop)$"](28.61,77.19,28.72,77.48);
  way[bridge][railway](28.61,77.19,28.72,77.48);
);
out body geom;
""".strip()
    request = urllib.request.Request(
        OVERPASS_URL,
        data=urllib.parse.urlencode({"data": query}).encode("utf-8"),
        headers={"User-Agent": "FlowState-Rail-SIH/2.0 (offline educational snapshot)"},
    )
    with urllib.request.urlopen(request, timeout=210) as response:
        payload = json.load(response)
    payload["flowstateSnapshot"] = {
        "date": date.today().isoformat(),
        "query": query,
        "attribution": "© OpenStreetMap contributors, ODbL 1.0",
    }
    SNAPSHOT.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    print(f"Refreshed {SNAPSHOT} ({len(payload.get('elements', []))} elements)")


def load_osm():
    if not SNAPSHOT.exists():
        return {"elements": [], "flowstateSnapshot": {"date": SNAPSHOT_DATE}}
    return json.loads(SNAPSHOT.read_text(encoding="utf-8"))


def osm_features(snapshot):
    features = []
    station_nodes = []
    for element in snapshot.get("elements", []):
        tags = element.get("tags", {})
        railway = tags.get("railway")
        if railway in {"rail", "platform"} and element.get("geometry"):
            features.append({
                "osmType": element.get("type"),
                "osmId": element.get("id"),
                "railway": railway,
                "bridge": tags.get("bridge"),
                "service": tags.get("service"),
                "usage": tags.get("usage"),
                "name": tags.get("name"),
                "geometryType": "LineString",
                "coordinates": [[p["lon"], p["lat"]] for p in element["geometry"]],
            })
        elif railway in {"station", "halt", "switch", "signal", "buffer_stop"} and "lat" in element:
            features.append({
                "osmType": element.get("type"),
                "osmId": element.get("id"),
                "railway": railway,
                "name": tags.get("name"),
                "ref": tags.get("ref"),
                "signalDirection": tags.get("railway:signal:direction"),
                "geometryType": "Point",
                "coordinates": [element["lon"], element["lat"]],
            })
        if railway in {"station", "halt"} and "lat" in element:
            station_nodes.append(element)
    return features, station_nodes


def nearest_osm_station(station, station_nodes):
    best = None
    best_distance = 999
    for node in station_nodes:
        distance = (node["lat"] - station["lat"]) ** 2 + (node["lon"] - station["lon"]) ** 2
        if distance < best_distance:
            best, best_distance = node, distance
    if best is not None and best_distance < 0.0004:
        return best
    return None


def haversine_m(a, b):
    radius = 6_371_000
    p1, p2 = math.radians(a["lat"]), math.radians(b["lat"])
    dp = math.radians(b["lat"] - a["lat"])
    dl = math.radians(b["lon"] - a["lon"])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return round(2 * radius * math.asin(math.sqrt(h)))


def metadata(identity, topology_type, snapshot_date):
    return {
        "networkId": identity["code"],
        "name": identity["name"],
        "hindiName": identity.get("hindi", identity["name"]),
        "topologyType": topology_type,
        "source": ["OpenStreetMap", "OpenRailwayMap-compatible tags", "representative operational layer"],
        "attribution": "© OpenStreetMap contributors · ODbL 1.0",
        "snapshotDate": snapshot_date,
        "licenseUrl": "https://www.openstreetmap.org/copyright",
        "disclaimer": DISCLAIMER,
        "movementTimeScale": 0.16,
    }


def node(node_id, node_type, x, y, lat, lon, *, osm_id=None, state=None, direction=None, label=None):
    item = {
        "id": node_id,
        "osmId": osm_id,
        "type": node_type,
        "position": {"x": round(x, 1), "y": round(y, 1)},
        "geoPosition": {"lat": round(lat, 7), "lon": round(lon, 7)},
        "label": label or node_id,
        "provenance": {
            "geoPosition": "osm" if osm_id else "osm-anchor-interpolation",
            "type": "osm" if osm_id else "representative",
            "state": "simulation",
        },
    }
    if state is not None:
        item["state"] = state
    if direction is not None:
        item["direction"] = direction
    if node_type == "SWITCH":
        item["normalPosition"] = "NORMAL"
        item["state"] = state or "NORMAL"
    return item


def segment(seg_id, start, end, length, direction, speed, circuit, block, *, line_id, platform=None, ohe="OHE-A", status="OPERATIONAL", osm_id=None, tags=None):
    return {
        "id": seg_id,
        "osmId": osm_id,
        "startNodeId": start,
        "endNodeId": end,
        "lineId": line_id,
        "length": int(max(1, length)),
        "lengthMeters": int(max(1, length)),
        "direction": direction,
        "permissibleSpeedKph": speed,
        "maxSpeed": speed,
        "trackCircuit": circuit,
        "blockSection": block,
        "platform": platform,
        "electrification": "25 kV AC",
        "oheIsolationGroup": ohe,
        "isOccupied": False,
        "occupancy": "CLEAR",
        "condition": "GOOD",
        "status": status,
        "weather": "GOOD",
        "defects": [],
        "tags": tags or {},
        "provenance": {
            "geometry": "osm" if osm_id else "osm-anchor-interpolation",
            "lengthMeters": "calculated-from-geography",
            "direction": "representative",
            "permissibleSpeedKph": "representative",
            "trackCircuit": "representative",
            "blockSection": "representative",
            "electrification": "representative",
            "oheIsolationGroup": "representative",
        },
    }


def route(route_id, start, end, segments, points, speed, movement="THROUGH"):
    return {
        "id": route_id,
        "entrySignalId": start,
        "exitSignalId": end,
        "segments": segments,
        "requiredPointPositions": points,
        "overlapSegments": segments[-1:],
        "conflicts": [],
        "routeSpeedKph": speed,
        "movementType": movement,
        "validated": True,
        "provenance": "representative-validated-demonstration-route",
    }


def add_conflicts(routes):
    for current in routes:
        resources = set(current["segments"]) | set(current["requiredPointPositions"])
        current["conflicts"] = sorted(
            other["id"] for other in routes
            if other["id"] != current["id"]
            and resources.intersection(set(other["segments"]) | set(other["requiredPointPositions"]))
        )


def add_maintenance_tasks(network, prefix):
    systems = [
        ("TMS", "ENG", "rail/track geometry defect renewal", 180),
        ("SMMS", "S&T", "point machine and track circuit calibration", 120),
        ("TDMS", "TRD", "25 kV OHE isolator and contact wire inspection", 150)
    ]
    tasks = []
    for zone_index, zone in enumerate(network.get("maintenanceZones", []), 1):
        for task_index, (source, department, asset, duration) in enumerate(systems, 1):
            tasks.append({
                "id": f"{prefix}-{source}-{zone_index:02d}",
                "sourceSystem": source,
                "department": department,
                "assetType": asset,
                "description": f"{asset.title()} in {zone['name']}",
                "maintenanceZoneId": zone["id"],
                "criticality": 5 - min(2, zone_index - 1),
                "urgency": 5 - min(2, task_index - 1),
                "overdueDays": 12 + zone_index * 3 + task_index,
                "durationMinutes": duration,
                "preferredHorizons": ["weekly", "monthly"],
                "provenance": {
                    "sourceSystem": "representative-integration-contract",
                    "priorityFields": "representative",
                    "resourceMapping": "derived-from-maintenance-zone",
                },
            })
    network["maintenanceTasks"] = tasks
    return network


def build_corridor(snapshot_date, geo_features, station_nodes):
    lines = [
        ("UP_FAST", "UP FAST (MAIN)", "EAST", 130, 140),
        ("UP_SLOW", "UP SLOW (SUBURBAN)", "EAST", 80, 200),
        ("DN_FAST", "DOWN FAST (MAIN)", "WEST", 130, 300),
        ("DN_SLOW", "DOWN SLOW (SUBURBAN)", "WEST", 80, 360),
    ]
    nodes, segments, routes = [], [], []
    nodes_by_id = {}

    def add_node(item):
        nodes.append(item)
        nodes_by_id[item["id"]] = item
        return item

    located = []
    for station in STATIONS:
        osm_station = nearest_osm_station(station, station_nodes)
        resolved = dict(station)
        if osm_station:
            resolved.update({"lat": osm_station["lat"], "lon": osm_station["lon"], "osmId": osm_station["id"]})
        located.append(resolved)

    x_positions = [300, 950, 1500, 2250, 3100]
    line_paths = {}
    boundary_offsets = {}

    # 1. Mainlines Generation with Automatic Block Signals
    for line_id, line_name, direction, speed, y in lines:
        ordered = located if direction == "EAST" else list(reversed(located))
        ordered_x = x_positions if direction == "EAST" else list(reversed(x_positions))
        entry_code = "WEST" if direction == "EAST" else "EAST"
        exit_code = "EAST" if direction == "EAST" else "WEST"
        entry_station, exit_station = ordered[0], ordered[-1]
        entry = f"COR-{entry_code}-{line_id}-ENTRY"
        exit_id = f"COR-{exit_code}-{line_id}-EXIT"
        entry_x = ordered_x[0] - (150 if direction == "EAST" else -150)
        exit_x = ordered_x[-1] + (150 if direction == "EAST" else -150)

        add_node(node(entry, "SIGNAL", entry_x, y, entry_station["lat"], entry_station["lon"], state="GREEN", direction=direction, label=f"{line_id} HOME"))

        route_segments = []
        boundary_offsets[line_id] = {}
        first_boundary = f"COR-{ordered[0]['code']}-{line_id}"
        add_node(node(first_boundary, "STATION_BOUNDARY", ordered_x[0], y, ordered[0]["lat"], ordered[0]["lon"], osm_id=ordered[0].get("osmId"), label=ordered[0]["code"]))
        approach_id = f"COR-{line_id}-{entry_code}-APP"
        approach_block = f"{entry_code}-{ordered[0]['code']}-APPROACH"
        segments.append(segment(approach_id, entry, first_boundary, 600, direction, min(speed, 60), f"TC-{line_id}-{entry_code}-APP", approach_block, line_id=line_id, ohe=f"OHE-{approach_block}"))
        route_segments.append(approach_id)
        boundary_offsets[line_id][ordered[0]["code"]] = len(route_segments)

        auto_index = 1
        previous_id = first_boundary
        for section_index, (start_station, end_station, start_x, end_x) in enumerate(zip(ordered, ordered[1:], ordered_x, ordered_x[1:]), 1):
            station_pair = f"{start_station['code']}-{end_station['code']}"
            section_length = max(900, haversine_m(
                {"lat": start_station["lat"], "lon": start_station["lon"]},
                {"lat": end_station["lat"], "lon": end_station["lon"]},
            ))
            for circuit_index, fraction in enumerate((1 / 3, 2 / 3), 1):
                signal_id = f"COR-{station_pair}-{line_id}-AS{circuit_index}"
                curve = (4 if section_index % 2 else -4) * math.sin(math.pi * fraction)
                add_node(node(
                    signal_id,
                    "SIGNAL",
                    start_x + (end_x - start_x) * fraction,
                    y + curve,
                    start_station["lat"] + (end_station["lat"] - start_station["lat"]) * fraction,
                    start_station["lon"] + (end_station["lon"] - start_station["lon"]) * fraction,
                    state="GREEN",
                    direction=direction,
                    label=f"A{auto_index:02d}",
                ))
                seg_id = f"COR-{line_id}-{station_pair}-TC{circuit_index}"
                segments.append(segment(seg_id, previous_id, signal_id, section_length / 3, direction, speed, f"TC-{line_id}-{station_pair}-{circuit_index}", station_pair, line_id=line_id, ohe=f"OHE-{station_pair}"))
                route_segments.append(seg_id)
                previous_id = signal_id
                auto_index += 1

            boundary_id = f"COR-{end_station['code']}-{line_id}"
            add_node(node(boundary_id, "STATION_BOUNDARY", end_x, y, end_station["lat"], end_station["lon"], osm_id=end_station.get("osmId"), label=end_station["code"]))
            seg_id = f"COR-{line_id}-{station_pair}-TC3"
            segments.append(segment(seg_id, previous_id, boundary_id, section_length / 3, direction, speed, f"TC-{line_id}-{station_pair}-3", station_pair, line_id=line_id, ohe=f"OHE-{station_pair}"))
            route_segments.append(seg_id)
            previous_id = boundary_id
            boundary_offsets[line_id][end_station["code"]] = len(route_segments)

        add_node(node(exit_id, "SIGNAL", exit_x, y, exit_station["lat"], exit_station["lon"], state="GREEN", direction=direction, label=f"{line_id} EXIT"))
        exit_approach_id = f"COR-{line_id}-{exit_code}-APP"
        exit_block = f"{exit_station['code']}-{exit_code}-APPROACH"
        segments.append(segment(exit_approach_id, previous_id, exit_id, 600, direction, min(speed, 60), f"TC-{line_id}-{exit_code}-APP", exit_block, line_id=line_id, ohe=f"OHE-{exit_block}"))
        route_segments.append(exit_approach_id)
        line_paths[line_id] = route_segments
        routes.append(route(f"R-COR-{line_id}", entry, exit_id, route_segments, {}, speed, "THROUGH"))

    # 2. Universal Throat Ladders & Scissors Crossovers
    for direction, main, slow in [("EAST", "UP_FAST", "UP_SLOW"), ("WEST", "DN_FAST", "DN_SLOW")]:
        for station_code in ("DSA", "ANVR", "SBB"):
            a = f"COR-{station_code}-{main}"
            b = f"COR-{station_code}-{slow}"
            sw = f"COR-{station_code}-{direction}-XOVER"
            na, nb = nodes_by_id[a], nodes_by_id[b]
            add_node(node(sw, "SWITCH", na["position"]["x"] + (38 if direction == "EAST" else -38), (na["position"]["y"] + nb["position"]["y"]) / 2, na["geoPosition"]["lat"], na["geoPosition"]["lon"]))
            segments.append(segment(f"COR-XO-{station_code}-{direction}-A", a, sw, 90, "BI", 30, f"TC-XO-{station_code}-{direction}-A", station_code, line_id="CROSSOVER", ohe=f"OHE-{station_code}"))
            segments.append(segment(f"COR-XO-{station_code}-{direction}-B", sw, b, 90, "BI", 30, f"TC-XO-{station_code}-{direction}-B", station_code, line_id="CROSSOVER", ohe=f"OHE-{station_code}"))

        direct = {item["id"]: item for item in routes}
        main_route = direct[f"R-COR-{main}"]
        slow_route = direct[f"R-COR-{slow}"]
        transfer_order = (["DSA", "ANVR", "SBB"] if direction == "EAST" else ["SBB", "ANVR", "DSA"])
        for first_index, second_index in ((0, 1), (1, 2), (0, 2)):
            first_station = transfer_order[first_index]
            second_station = transfer_order[second_index]
            main_first = boundary_offsets[main][first_station]
            main_second = boundary_offsets[main][second_station]
            slow_first = boundary_offsets[slow][first_station]
            slow_second = boundary_offsets[slow][second_station]
            main_segments = line_paths[main]
            slow_segments = line_paths[slow]
            main_alt = (
                main_segments[:main_first]
                + [f"COR-XO-{first_station}-{direction}-A", f"COR-XO-{first_station}-{direction}-B"]
                + slow_segments[slow_first:slow_second]
                + [f"COR-XO-{second_station}-{direction}-B", f"COR-XO-{second_station}-{direction}-A"]
                + main_segments[main_second:]
            )
            slow_alt = (
                slow_segments[:slow_first]
                + [f"COR-XO-{first_station}-{direction}-B", f"COR-XO-{first_station}-{direction}-A"]
                + main_segments[main_first:main_second]
                + [f"COR-XO-{second_station}-{direction}-A", f"COR-XO-{second_station}-{direction}-B"]
                + slow_segments[slow_second:]
            )
            points = {
                f"COR-{first_station}-{direction}-XOVER": "REVERSE",
                f"COR-{second_station}-{direction}-XOVER": "REVERSE",
            }
            suffix = f"VIA-{first_station}-{second_station}"
            routes.append(route(f"R-COR-{main}-{suffix}", main_route["entrySignalId"], main_route["exitSignalId"], main_alt, points, 30, "RELIEF_DIVERSION"))
            routes.append(route(f"R-COR-{slow}-{suffix}", slow_route["entrySignalId"], slow_route["exitSignalId"], slow_alt, points, 30, "RELIEF_DIVERSION"))

        for station_code in transfer_order:
            main_offset = boundary_offsets[main][station_code]
            slow_offset = boundary_offsets[slow][station_code]
            point_id = f"COR-{station_code}-{direction}-XOVER"
            main_to_slow = (
                line_paths[main][:main_offset]
                + [f"COR-XO-{station_code}-{direction}-A", f"COR-XO-{station_code}-{direction}-B"]
                + line_paths[slow][slow_offset:]
            )
            slow_to_main = (
                line_paths[slow][:slow_offset]
                + [f"COR-XO-{station_code}-{direction}-B", f"COR-XO-{station_code}-{direction}-A"]
                + line_paths[main][main_offset:]
            )
            routes.append(route(
                f"R-COR-{main}-TO-{slow}-VIA-{station_code}",
                main_route["entrySignalId"], slow_route["exitSignalId"],
                main_to_slow, {point_id: "REVERSE"}, 30, "MERGE_DIVERGE",
            ))
            routes.append(route(
                f"R-COR-{slow}-TO-{main}-VIA-{station_code}",
                slow_route["entrySignalId"], main_route["exitSignalId"],
                slow_to_main, {point_id: "REVERSE"}, 30, "MERGE_DIVERGE",
            ))

    # 3. Real-World Locomotive Run-Around & Yard Sidings (DLI, ANVR, SBB, GZB)
    branch_specs = [
        ("DLI-LOCO-REV", "COR-DLI-UP_FAST", 440, 85, "DLI LOCO ESCAPE & RUN-AROUND"),
        ("ANVR-LOCO-REV", "COR-ANVR-UP_SLOW", 1680, 75, "ANVR ENGINE TURNAROUND NECK"),
        ("SBB-CONCOR-LOOP", "COR-SBB-DN_SLOW", 2480, 425, "SBB CONCOR FREIGHT RECEPTION"),
        ("GZB-ELS-DEPOT", "COR-GZB-UP_SLOW", 3280, 180, "GZB ELECTRIC LOCO SHED (ELS)"),
    ]
    for branch_id, anchor_id, end_x, end_y, label in branch_specs:
        anchor = nodes_by_id[anchor_id]
        direction = "EAST" if end_x >= anchor["position"]["x"] else "WEST"
        junction_id = f"COR-{branch_id}-POINT"
        buffer_id = f"COR-{branch_id}-BUFFER"
        add_node(node(junction_id, "SWITCH", anchor["position"]["x"] + (70 if direction == "EAST" else -70), (anchor["position"]["y"] + end_y) / 2, anchor["geoPosition"]["lat"], anchor["geoPosition"]["lon"], label=f"{branch_id} P"))
        add_node(node(buffer_id, "BUFFER_STOP", end_x, end_y, anchor["geoPosition"]["lat"], anchor["geoPosition"]["lon"], label=label))
        segments.append(segment(f"COR-{branch_id}-A", anchor_id, junction_id, 220, "BI", 25, f"TC-{branch_id}-A", branch_id, line_id="SIDING", ohe=f"OHE-{branch_id}"))
        segments.append(segment(f"COR-{branch_id}-B", junction_id, buffer_id, 480, "BI", 15, f"TC-{branch_id}-B", branch_id, line_id="SIDING", ohe=f"OHE-{branch_id}"))

    add_conflicts(routes)
    network = {
        "schemaVersion": 2,
        "metadata": metadata({"code": "CORRIDOR", "name": "Delhi–Ghaziabad Quadruple-Line Corridor", "hindi": "दिल्ली–गाज़ियाबाद रेल गलियारा"}, "corridor-overview", snapshot_date),
        "corridor": {
            "westConnection": "DELHI JUNCTION",
            "eastConnection": "GHAZIABAD JUNCTION",
            "lines": [{"id": x[0], "name": x[1], "direction": x[2]} for x in lines],
            "stations": [{**s, "x": x_positions[i]} for i, s in enumerate(located)],
            "geographicFeatures": geo_features,
            "infrastructure": [
                {"id": "YAMUNA-BRIDGE", "name": "HISTORIC YAMUNA RAIL BRIDGE", "type": "bridge", "x": 625, "width": 160, "provenance": "osm-derived-corridor-landmark"},
                {"id": "ANVR-TERMINAL", "name": "ANAND VIHAR TERMINAL COMPLEX", "type": "terminal", "x": 1500, "width": 320, "provenance": "representative-operational-layer"},
                {"id": "SBB-FREIGHT", "name": "SAHIBABAD CONCOR FREIGHT YARD", "type": "freight", "x": 2250, "width": 360, "provenance": "representative-operational-layer"},
                {"id": "GZB-ELS-YARD", "name": "GHAZIABAD ELECTRIC LOCO SHED", "type": "depot", "x": 3100, "width": 340, "provenance": "representative-operational-layer"},
            ],
        },
        "nodes": nodes,
        "trackSegments": segments,
        "routes": routes,
        "maintenanceZones": [
            {"id": "MZ-DSA-ANVR", "name": "DSA–ANVR coordinated block", "affectedSegments": [s["id"] for s in segments if s["blockSection"] in {"DSA-ANVR", "ANVR-DSA"}], "affectedPoints": ["COR-DSA-EAST-XOVER"], "oheGroups": ["OHE-DSA-ANVR", "OHE-ANVR-DSA"], "kilometreLimits": [7.1, 10.8], "compatibleDepartments": ["ENG", "S&T", "TRD"], "provenance": "representative"},
            {"id": "MZ-SBB-GZB", "name": "SBB–GZB integrated possession", "affectedSegments": [s["id"] for s in segments if s["blockSection"] in {"SBB-GZB", "GZB-SBB"}], "affectedPoints": ["COR-SBB-WEST-XOVER"], "oheGroups": ["OHE-SBB-GZB", "OHE-GZB-SBB"], "kilometreLimits": [16.4, 24.8], "compatibleDepartments": ["ENG", "S&T", "TRD"], "provenance": "representative"},
        ],
    }
    network["metadata"]["rawSnapshot"] = SNAPSHOT.name
    network["metadata"]["sourceFeatureCount"] = len(geo_features)
    network["metadata"]["sourceFeatureTypes"] = {
        kind: sum(1 for feature in geo_features if feature.get("railway") == kind)
        for kind in sorted({feature.get("railway") for feature in geo_features})
    }
    return add_maintenance_tasks(network, "COR")


def build_station(station, snapshot_date, station_nodes):
    code, count = station["code"], station["platformCount"]
    osm_station = nearest_osm_station(station, station_nodes)
    lat = osm_station.get("lat", station["lat"]) if osm_station else station["lat"]
    lon = osm_station.get("lon", station["lon"]) if osm_station else station["lon"]
    osm_id = osm_station.get("id") if osm_station else None
    nodes, segments, routes = [], [], []
    platform_rows = []
    tracks_meta = []
    up_count = math.ceil(count / 2)
    base_y, spacing = 105, max(34, min(54, 340 // max(count, 1)))

    endpoints = [
        (f"{code}-WEST-UP-ENTRY", 120, base_y + 20, "EAST"),
        (f"{code}-EAST-UP-EXIT", 2380, base_y + 20, "EAST"),
        (f"{code}-EAST-DN-ENTRY", 2380, base_y + spacing * (count - 1) + 20, "WEST"),
        (f"{code}-WEST-DN-EXIT", 120, base_y + spacing * (count - 1) + 20, "WEST"),
    ]
    for node_id, x, y, direction in endpoints:
        nodes.append(node(node_id, "SIGNAL", x, y, lat, lon, state="GREEN", direction=direction))

    throats = [
        (f"{code}-W-UP-THROAT", 420, base_y + 20),
        (f"{code}-E-UP-THROAT", 2080, base_y + 20),
        (f"{code}-E-DN-THROAT", 2080, base_y + spacing * (count - 1) + 20),
        (f"{code}-W-DN-THROAT", 420, base_y + spacing * (count - 1) + 20),
    ]
    for node_id, x, y in throats:
        nodes.append(node(node_id, "SWITCH", x, y, lat, lon))

    approach_defs = [
        (f"{code}-APP-W-UP", endpoints[0][0], throats[0][0], "EAST", "UP"),
        (f"{code}-APP-E-UP", throats[1][0], endpoints[1][0], "EAST", "UP"),
        (f"{code}-APP-E-DN", endpoints[2][0], throats[2][0], "WEST", "DN"),
        (f"{code}-APP-W-DN", throats[3][0], endpoints[3][0], "WEST", "DN"),
    ]
    for idx, (seg_id, start, end, direction, line) in enumerate(approach_defs):
        segments.append(segment(seg_id, start, end, 700, direction, 80, f"TC-{code}-APP-{idx+1}", f"{code}-APPROACH", line_id=line, ohe=f"OHE-{code}-APP"))

    for i in range(count):
        pf = i + 1
        y = base_y + i * spacing + 20
        direction = "EAST" if pf <= up_count else "WEST"
        west = f"{code}-PF{pf}-W"
        berth = f"{code}-PF{pf}-BERTH"
        east = f"{code}-PF{pf}-E"
        nodes.extend([
            node(west, "SWITCH", 650, y, lat, lon),
            node(berth, "PLATFORM", 1250, y, lat, lon, osm_id=osm_id if pf == 1 else None, label=f"Platform {pf}"),
            node(east, "SWITCH", 1850, y, lat, lon),
        ])
        platform_rows.append({"number": pf, "name": f"Platform {pf}", "x_start": 690, "x_end": 1810, "y": y, "direction": direction})
        tracks_meta.append({"index": pf, "name": f"PF {pf} · {'UP' if direction == 'EAST' else 'DOWN'} LOOP", "y": y})

        if direction == "EAST":
            link_a, link_b = throats[0][0], throats[1][0]
            route_start, route_end = endpoints[0][0], endpoints[1][0]
            approach_first, approach_last = approach_defs[0][0], approach_defs[1][0]
        else:
            link_a, link_b = throats[2][0], throats[3][0]
            route_start, route_end = endpoints[2][0], endpoints[3][0]
            approach_first, approach_last = approach_defs[2][0], approach_defs[3][0]

        part_ids = [f"{code}-PF{pf}-A", f"{code}-PF{pf}-B", f"{code}-PF{pf}-C", f"{code}-PF{pf}-D"]
        ordered_nodes = [link_a, east if direction == "WEST" else west, berth, west if direction == "WEST" else east, link_b]
        lengths = [180, 540, 540, 180]
        for j, (start, end) in enumerate(zip(ordered_nodes, ordered_nodes[1:])):
            segments.append(segment(part_ids[j], start, end, lengths[j], direction, 30 if j in {0, 3} else 50, f"TC-{code}-PF{pf}-{j+1}", code, line_id=f"PF{pf}", platform=pf, ohe=f"OHE-{code}-{'UP' if direction == 'EAST' else 'DN'}"))
        route_segments = [approach_first] + part_ids + [approach_last]
        routes.append(route(
            f"R-{code}-PF{pf}-{'UP' if direction == 'EAST' else 'DN'}",
            route_start,
            route_end,
            route_segments,
            {link_a: "REVERSE" if pf not in {1, count} else "NORMAL", link_b: "REVERSE" if pf not in {1, count} else "NORMAL"},
            30,
            "PLATFORM_LOOP"
        ))

    # Locomotive Reversal & Stabling Yard Siding per Station
    extras = {
        "DLI": [("LOCO RUN-AROUND LOOP", "LOCO_REV", 515), ("COACHING SIDING", "STABLING", 555)],
        "DSA": [("BRANCH DIVERSION LOOP", "BRANCH", 315)],
        "ANVR": [("ENGINE TURNAROUND NECK", "LOCO_REV", 430), ("COACHING STABLING YARD", "STABLING", 480)],
        "SBB": [("FREIGHT OVERTAKE LOOP", "FREIGHT", 330)],
        "GZB": [("ELECTRIC LOCO SHED LEAD", "LOCO_DEPOT", 390), ("BRANCH SORTING YARD", "BRANCH", 440)],
    }[code]
    for idx, (name, role, y) in enumerate(extras, 1):
        a, b = f"{code}-{role}-{idx}-W", f"{code}-{role}-{idx}-E"
        nodes.extend([node(a, "SWITCH", 720, y, lat, lon), node(b, "BUFFER_STOP", 1800, y, lat, lon)])
        segments.append(segment(f"{code}-{role}-{idx}", a, b, 650, "BI", 15 if "STABLING" in role or "REV" in role else 30, f"TC-{code}-{role}-{idx}", code, line_id=role, ohe=f"OHE-{code}-YARD"))
        tracks_meta.append({"index": f"E{idx}", "name": name, "y": y})

    add_conflicts(routes)
    network = {
        "schemaVersion": 2,
        "metadata": metadata(station, "station-schematic", snapshot_date),
        "station": {
            "code": code,
            "name": station["name"],
            "hindiName": station["hindi"],
            "kind": station["kind"],
            "platformCount": count,
            "osmId": osm_id,
            "geoPosition": {"lat": lat, "lon": lon},
            "westConnection": CONNECTIONS[code][0],
            "eastConnection": CONNECTIONS[code][1],
            "platforms": platform_rows,
            "tracksMeta": tracks_meta,
        },
        "nodes": nodes,
        "trackSegments": segments,
        "routes": routes,
        "maintenanceZones": [
            {"id": f"MZ-{code}-UP", "name": f"{code} UP-side integrated block", "affectedSegments": [s["id"] for s in segments if s["direction"] == "EAST"], "affectedPoints": [throats[0][0], throats[1][0]], "oheGroups": [f"OHE-{code}-UP"], "kilometreLimits": [station["chainageKm"] - 0.4, station["chainageKm"] + 0.4], "compatibleDepartments": ["ENG", "S&T", "TRD"], "provenance": "representative"},
            {"id": f"MZ-{code}-DN", "name": f"{code} DOWN-side integrated block", "affectedSegments": [s["id"] for s in segments if s["direction"] == "WEST"], "affectedPoints": [throats[2][0], throats[3][0]], "oheGroups": [f"OHE-{code}-DN"], "kilometreLimits": [station["chainageKm"] - 0.4, station["chainageKm"] + 0.4], "compatibleDepartments": ["ENG", "S&T", "TRD"], "provenance": "representative"},
        ],
    }
    return add_maintenance_tasks(network, code)


def write_json(name, network):
    payload = json.dumps({"network": network}, ensure_ascii=False, indent=2) + "\n"
    (HERE / name).write_text(payload, encoding="utf-8")
    PUBLIC_DATA.mkdir(parents=True, exist_ok=True)
    (PUBLIC_DATA / name).write_text(payload, encoding="utf-8")


def write_schedule(name, network, count):
    routes = network["routes"]
    route_cycle = routes
    burst_size = 1
    if network.get("metadata", {}).get("networkId") == "CORRIDOR":
        through_routes = [item for item in routes if item.get("movementType") != "MERGE_DIVERGE"]
        movement_routes = [item for item in routes if item.get("movementType") == "MERGE_DIVERGE"]
        nominal = [
            next(item for item in through_routes if item["id"] == "R-COR-UP_FAST"),
            next(item for item in through_routes if item["id"] == "R-COR-UP_SLOW"),
            next(item for item in through_routes if item["id"] == "R-COR-DN_FAST"),
            next(item for item in through_routes if item["id"] == "R-COR-DN_SLOW"),
        ]
        ordered_movements = []
        for station_code in ("DSA", "ANVR", "SBB"):
            for movement in (
                "UP_FAST-TO-UP_SLOW", "UP_SLOW-TO-UP_FAST",
                "DN_FAST-TO-DN_SLOW", "DN_SLOW-TO-DN_FAST",
            ):
                match = next((item for item in movement_routes if movement in item["id"] and item["id"].endswith(station_code)), None)
                if match:
                    ordered_movements.append(match)

        route_cycle = []
        for index in range(0, len(ordered_movements), 2):
            route_cycle.extend(nominal)
            route_cycle.extend(ordered_movements[index:index + 2])
        burst_size = 2
    else:
        route_cycle = routes
        burst_size = 2

    rows = []
    scheduled_by_segment = {segment["id"]: [] for segment in network["trackSegments"]}
    types = ["Vande Bharat", "Shatabdi", "Rajdhani", "Passenger", "MEMU", "Express", "Freight"]
    for i in range(count):
        r = route_cycle[i % len(route_cycle)]
        minute = (i // burst_size) * (2 if count >= 100 else 4)
        movement_type = r.get("movementType", "THROUGH")
        rows.append({
            "Train No": str(12000 + i),
            "Train Name": f"{'Junction Conflict' if movement_type == 'MERGE_DIVERGE' else 'Demonstration'} Service {i + 1:03d}",
            "Start Node": r["entrySignalId"],
            "End Node": r["exitSignalId"],
            "Arrival time": f"{minute // 60:02d}:{minute % 60:02d}:00",
            "Type": types[i % len(types)],
            "Movement": movement_type,
        })
        for segment_id in r["segments"]:
            scheduled_by_segment[segment_id].append(str(12000 + i))

    for item in network["trackSegments"]:
        services = scheduled_by_segment[item["id"]]
        item["scheduledTrainCount"] = len(services)
        item["scheduledTrainIds"] = services[:12]

    path = HERE / name
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh-osm", action="store_true", help="Refresh Overpass snapshot before generating")
    args = parser.parse_args()
    if args.refresh_osm:
        refresh_osm()

    snapshot = load_osm()
    features, station_nodes = osm_features(snapshot)
    snapshot_date = snapshot.get("flowstateSnapshot", {}).get("date", SNAPSHOT_DATE)

    corridor = build_corridor(snapshot_date, features, station_nodes)
    write_schedule("corridor_schedule.csv", corridor, 120)
    write_json("corridor_layout.json", corridor)
    write_json("delhi_gzb_corridor.json", corridor)

    for station in STATIONS:
        network = build_station(station, snapshot_date, station_nodes)
        filename = f"{station['code'].lower()}_layout.json"
        write_schedule(f"{station['code'].lower()}_schedule.csv", network, 20 if station["code"] == "DLI" else 12)
        write_json(filename, network)

    for alias, canonical in [("anand_vihar", "anvr"), ("ghaziabad", "gzb"), ("shahibabad", "sbb")]:
        (HERE / f"{alias}_layout.json").write_text((HERE / f"{canonical}_layout.json").read_text(encoding="utf-8"), encoding="utf-8")
        (HERE / f"{alias}_schedule.csv").write_text((HERE / f"{canonical}_schedule.csv").read_text(encoding="utf-8"), encoding="utf-8")

    print(f"Generated schema-v2 network with engine reversal loops, scissors crossovers, and freight sidings.")


if __name__ == "__main__":
    main()