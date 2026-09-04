import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from block_planner import BlockPlanningEngine
from integration_adapters import validate_and_normalize
from risk_engine import score_task


class PlanningPlatformTests(unittest.TestCase):
    def test_risk_score_is_explainable_and_bounded(self):
        result = score_task({"criticality": 10, "severity": 9, "failureProbability": 8, "overdueDays": 60, "operationalCriticality": 8, "urgency": 9})
        self.assertGreater(result["score"], 70)
        self.assertLessEqual(result["score"], 100)
        self.assertAlmostEqual(sum(result["contributions"].values()), result["score"], places=1)

    def test_adapter_reports_row_errors_and_normalizes_valid_rows(self):
        rows = [{"id": "T-1", "asset_id": "TC-1", "criticality": "8"}, {"id": "T-2"}]
        accepted, errors = validate_and_normalize("tms", rows)
        self.assertEqual(len(accepted), 1)
        self.assertEqual(errors[0]["fields"], ["asset_id"])
        self.assertIn("risk", accepted[0]["payload"])

    def test_shared_resource_blocks_never_overlap(self):
        tasks = [
            {"id": "A", "assetId": "TC-1", "resources": ["TC-1"], "durationMinutes": 60, "criticality": 9},
            {"id": "B", "assetId": "TC-1", "resources": ["TC-1"], "durationMinutes": 60, "criticality": 8},
        ]
        result = BlockPlanningEngine().solve(tasks, [], [], "weekly", "balanced")
        self.assertEqual(result["unsafeConflicts"], 0)
        blocks = result["blocks"]
        a0, a1 = blocks[0]["startSlot"], blocks[0]["startSlot"] + blocks[0]["durationSlots"]
        b0, b1 = blocks[1]["startSlot"], blocks[1]["startSlot"] + blocks[1]["durationSlots"]
        self.assertTrue(a1 <= b0 or b1 <= a0)

    def test_monthly_policy_and_resolution(self):
        result = BlockPlanningEngine().solve([{"id": "A", "assetId": "TC-1", "durationMinutes": 75}], [], [], "monthly", "operations-first")
        self.assertEqual(result["horizon"], "monthly")
        self.assertEqual(result["policy"], "operations-first")
        self.assertEqual(result["blocks"][0]["durationMinutes"], 120)

    def test_coa_window_is_a_hard_constraint(self):
        tasks = [{"id": "A", "assetId": "TC-1", "durationMinutes": 60}]
        windows = [{"start_time": "01:00", "end_time": "03:00", "blocked_resources": ""}]
        result = BlockPlanningEngine().solve(tasks, windows, [], "weekly", "balanced")
        self.assertEqual(result["blocks"][0]["startMinute"], 60)

    def test_missing_coa_capacity_explains_infeasibility(self):
        tasks = [{"id": "A", "assetId": "TC-1", "durationMinutes": 180}]
        windows = [{"start_time": "01:00", "end_time": "02:00", "blocked_resources": ""}]
        result = BlockPlanningEngine().solve(tasks, windows, [], "weekly", "balanced")
        self.assertEqual(result["status"], "INFEASIBLE")
        self.assertTrue(result["recommendations"])


if __name__ == "__main__": unittest.main()
