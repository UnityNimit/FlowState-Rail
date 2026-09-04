"""Explainable hybrid risk scoring used by maintenance planning."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


WEIGHTS = {
    "safetyCriticality": 0.30,
    "defectSeverity": 0.20,
    "failureProbability": 0.15,
    "overdue": 0.15,
    "operationalCriticality": 0.10,
    "statutoryUrgency": 0.10,
}


def _score(value: Any, default: float = 5.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = default
    if number <= 10:
        number *= 10
    return max(0.0, min(100.0, number))


def score_task(task: dict) -> dict:
    overdue_days = max(0.0, float(task.get("overdueDays", task.get("overdue_days", 0)) or 0))
    components = {
        "safetyCriticality": _score(task.get("safetyCriticality", task.get("criticality", 5))),
        "defectSeverity": _score(task.get("defectSeverity", task.get("severity", 5))),
        "failureProbability": _score(task.get("failureProbability", task.get("conditionTrend", 4))),
        "overdue": min(100.0, overdue_days / 90.0 * 100.0),
        "operationalCriticality": _score(task.get("operationalCriticality", task.get("trafficImpact", 5))),
        "statutoryUrgency": _score(task.get("statutoryUrgency", task.get("urgency", 5))),
    }
    contributions = {key: round(value * WEIGHTS[key], 2) for key, value in components.items()}
    total = round(sum(contributions.values()), 1)
    band = "CRITICAL" if total >= 75 else "HIGH" if total >= 55 else "MEDIUM" if total >= 35 else "LOW"
    return {
        "score": total,
        "band": band,
        "components": {key: round(value, 1) for key, value in components.items()},
        "contributions": contributions,
        "weights": WEIGHTS,
        "method": "explainable-weighted-v1",
    }


MODEL_CARD = {
    "name": "FlowState maintenance risk",
    "version": "1.0.0",
    "mode": "deterministic-fallback",
    "purpose": "Prioritisation support; never a signalling or safety authority",
    "features": list(WEIGHTS),
    "limitations": [
        "Representative operational values are not calibrated against Indian Railways production history.",
        "A trained estimator is enabled only after sufficient labelled historical outcomes are supplied.",
    ],
}
