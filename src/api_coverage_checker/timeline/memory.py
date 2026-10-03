"""Keep a short series of score samples per API and per operation.

Created by Avrelin Aleksei. Copyright 2026 Avrelin Aleksei.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger("acc.timeline")


def _stamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_series(path: Path | None) -> dict:
    if path is None or not path.is_file():
        return {"apis": {}}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        logger.warning("History file ignored: %s", error)
        return {"apis": {}}
    if not isinstance(payload, dict):
        return {"apis": {}}
    payload.setdefault("apis", {})
    return payload


def _trim(points: list[dict], score: float, limit: int) -> list[dict]:
    cap = max(int(limit), 1)
    extended = [*points, {"at": _stamp(), "score": score}]
    extended.sort(key=lambda point: point["at"])
    return extended[-cap:]


def extend_series(previous: dict, boards: list[dict], limit: int) -> dict:
    apis = dict(previous.get("apis") or {})
    for board in boards:
        key = board["key"]
        prior = apis.get(key) or {"score": [], "routes": {}}
        routes = dict(prior.get("routes") or {})
        for row in board["operations"]:
            if row["skipped"]:
                continue
            route_key = f"{row['verb']}|{row['route']}"
            routes[route_key] = _trim(list(routes.get(route_key) or []), float(row["score"]), limit)
        apis[key] = {"score": _trim(list(prior.get("score") or []), float(board["score"]), limit), "routes": routes}
    return {"apis": apis}


def write_series(path: Path | None, series: dict) -> None:
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(series, ensure_ascii=False, indent=2), encoding="utf-8")
