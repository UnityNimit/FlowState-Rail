import pathlib
import sys
import unittest
from contextlib import redirect_stdout
from io import StringIO


BACKEND = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "data"))

from simulation import Simulation
from optimizer import Optimizer
from validate_v2_network import NETWORKS, validate


class SchemaV2Tests(unittest.TestCase):
    def test_all_networks_and_timetables_validate(self):
        for name in NETWORKS:
            self.assertEqual(validate(name), [], name)

    def test_all_stations_are_distinct(self):
        fingerprints = set()
        for code in ("DLI", "DSA", "ANVR", "SBB", "GZB"):
            sim = Simulation(code)
            fingerprint = (len(sim.nodes_map), len(sim.segments_map), tuple(sorted(sim.routes_map)))
            self.assertNotIn(fingerprint, fingerprints)
            fingerprints.add(fingerprint)


class InterlockingTests(unittest.TestCase):
    def setUp(self):
        self.sim = Simulation("CORRIDOR")

    def test_runtime_uses_explicit_routes(self):
        routes = self.sim.find_all_possible_routes("COR-WEST-UP_FAST-ENTRY", "COR-EAST-UP_FAST-EXIT")
        self.assertEqual(len(routes), 4)
        self.assertTrue(all(self.sim.get_route_definition(route) for route in routes))

    def test_corridor_is_a_complex_algorithm_demonstrator(self):
        self.assertGreaterEqual(len(self.sim.nodes_map), 70)
        self.assertGreaterEqual(len(self.sim.segments_map), 70)
        self.assertGreaterEqual(len(self.sim.routes_map), 16)
        self.assertGreaterEqual(sum(node["type"] == "SIGNAL" for node in self.sim.nodes_map.values()), 35)

    def test_fault_on_main_selects_relief_route(self):
        failed = "COR-UP_FAST-DSA-ANVR-TC2"
        self.sim.segments_map[failed]["status"] = "FAULTY"
        routes = self.sim.find_all_possible_routes("COR-WEST-UP_FAST-ENTRY", "COR-EAST-UP_FAST-EXIT")
        self.assertGreaterEqual(len(routes), 1)
        self.assertTrue(all(failed not in candidate for candidate in routes))
        self.assertTrue(any("COR-UP_SLOW-DSA-ANVR-TC2" in candidate for candidate in routes))

    def test_ohe_isolation_blocks_dependent_route(self):
        self.assertTrue(self.sim.set_maintenance_zone("MZ-DSA-ANVR", True))
        routes = self.sim.find_all_possible_routes("COR-WEST-UP_FAST-ENTRY", "COR-EAST-UP_FAST-EXIT")
        self.assertEqual(routes, [])
        self.assertIn("OHE-DSA-ANVR", self.sim.isolated_ohe_groups)

    def test_points_cannot_move_when_route_locked(self):
        point = "COR-DSA-EAST-XOVER"
        self.sim.locked_resources.add(point)
        self.assertFalse(self.sim.set_signal_state(point, "REVERSE"))

    def test_travel_time_uses_length_and_speed(self):
        short = self.sim.get_segment_travel_time("COR-XO-DSA-EAST-A")
        long = self.sim.get_segment_travel_time("COR-UP_FAST-DSA-ANVR-TC2")
        self.assertGreater(long, short)

    def test_weekly_and_monthly_block_plans_are_conflict_free(self):
        planner = Optimizer(self.sim)
        for horizon in ("weekly", "monthly"):
            plan = planner.generate_maintenance_plan(horizon)
            self.assertEqual(plan["horizon"], horizon)
            self.assertEqual(plan["unsafeConflicts"], 0)
            self.assertTrue(plan["blocks"])
            self.assertTrue(all(set(block["departments"]) == {"ENG", "S&T", "TRD"} for block in plan["blocks"]))

    def test_station_train_plan_respects_point_resources(self):
        station = Simulation("DSA")
        station.tick()
        waiting = [train for train in station.active_trains if train["state"] == "WAITING_PLAN"]
        plan = Optimizer(station).generate_plan(waiting, station.get_state(), station.current_ai_priorities)
        self.assertGreaterEqual(len(plan), 1)
        self.assertTrue(station.get_route_definition(plan[0]["route"]))
        actions = [p["action"] for p in plan]
        self.assertIn("PROCEED", actions)
        if len(plan) > 1:
            self.assertIn("HOLD", actions)

    def test_merge_diverge_crossover_routes_exist_on_corridor(self):
        crossover_routes = [r for r in self.sim.network.get("routes", []) if r.get("movementType") == "MERGE_DIVERGE"]
        self.assertGreaterEqual(len(crossover_routes), 12)
        for r in crossover_routes:
            self.assertTrue(any("REVERSE" in str(pos) for pos in r.get("requiredPointPositions", {}).values()))
            self.assertTrue(any("-XO-" in seg for seg in r.get("segments", [])))

    def test_contention_generates_structured_conflict_info(self):
        corridor = Simulation("CORRIDOR")
        # Bring one designed DSA crossover conflict pair into the same planning
        # batch, rather than relying on the nominal live timetable to be busy.
        for service in corridor.master_schedule[:6]:
            service["arrival_seconds"] = 0
        corridor.tick()
        waiting = [t for t in corridor.active_trains if t["state"] == "WAITING_PLAN"]
        plan = Optimizer(corridor).generate_plan(waiting, corridor.get_state(), corridor.current_ai_priorities)
        self.assertGreaterEqual(len(plan), 2)
        held = [p for p in plan if p["action"] == "HOLD"]
        self.assertGreaterEqual(len(held), 1)
        c_info = held[0].get("conflictInfo")
        self.assertIsNotNone(c_info)
        self.assertTrue(c_info.get("hasConflict"))
        self.assertIsNotNone(c_info.get("contendedResource"))
        self.assertIsNotNone(c_info.get("resolution"))

    def test_nominal_service_stays_on_its_nominal_line_when_healthy(self):
        corridor = Simulation("CORRIDOR")
        corridor.tick()
        waiting = [t for t in corridor.active_trains if t["state"] == "WAITING_PLAN"]
        plan = Optimizer(corridor).generate_plan(waiting, corridor.get_state(), corridor.current_ai_priorities)
        route_ids = {instruction["routeId"] for instruction in plan}
        self.assertEqual(route_ids, {"R-COR-UP_FAST", "R-COR-UP_SLOW"})
        self.assertTrue(all(not item["algorithmTrace"]["isAlternateRoute"] for item in plan))

    def test_held_train_placed_on_entry_segment_for_diagram_visibility(self):
        corridor = Simulation("CORRIDOR")
        for service in corridor.master_schedule[:6]:
            service["arrival_seconds"] = 0
        corridor.tick()
        waiting = [t for t in corridor.active_trains if t["state"] == "WAITING_PLAN"]
        plan = Optimizer(corridor).generate_plan(waiting, corridor.get_state(), corridor.current_ai_priorities)
        corridor.apply_plan(plan)
        held_trains = [t for t in corridor.active_trains if t["state"] == "HOLD"]
        self.assertGreaterEqual(len(held_trains), 1)
        for t in held_trains:
            self.assertIsNotNone(t.get("currentSegmentId"))
            self.assertEqual(t.get("positionOnSegment"), 0.0)
            self.assertEqual(t.get("speed_kph"), 0)

    def test_simultaneous_corridor_movements_release_junction_locks(self):
        """A busy junction must drain after a point clears, rather than deadlocking."""
        corridor = Simulation("CORRIDOR")
        corridor.master_schedule = corridor.master_schedule[:6]
        for service in corridor.master_schedule:
            service["arrival_seconds"] = 0
        corridor.tick()
        waiting = [t for t in corridor.active_trains if t["state"] == "WAITING_PLAN"]
        plan = Optimizer(corridor).generate_plan(
            waiting, corridor.get_state(), corridor.current_ai_priorities
        )
        corridor.apply_plan(plan)

        # Advance a full demonstration window without waiting in wall-clock time.
        corridor.sim_speed = 8
        for _ in range(220):
            corridor.tick()

        self.assertEqual(corridor.active_trains, [])
        self.assertEqual(corridor.locked_resources, set())
        self.assertEqual(corridor.route_point_locks, {})
        self.assertEqual(
            len(corridor.get_state().get("activeConflicts", [])), 0
        )

    def test_live_timetable_keeps_crossover_use_bounded(self):
        """Normal service must not turn every planned crossover into a live lock."""
        corridor = Simulation("CORRIDOR")
        corridor.sim_speed = 8
        max_live_crossovers = 0
        with redirect_stdout(StringIO()):
            for _ in range(180):
                corridor.tick()
                waiting = [t for t in corridor.active_trains if t.get("state") == "WAITING_PLAN"]
                if waiting and corridor.plan_needed:
                    corridor.plan_needed = False
                    corridor.apply_plan(
                        Optimizer(corridor).generate_plan(
                            waiting, corridor.get_state(), corridor.current_ai_priorities
                        )
                    )
                max_live_crossovers = max(
                    max_live_crossovers, len(corridor.get_state().get("activeCrossovers", []))
                )

        self.assertLessEqual(max_live_crossovers, 2)
        self.assertFalse(any(t.get("state") == "HOLD" for t in corridor.active_trains))
        self.assertEqual(corridor.get_state().get("activeConflicts", []), [])


if __name__ == "__main__":
    unittest.main()
