"""Append-only folder of one JSON file per observed call.

Created by Avrelin Aleksei. Copyright 2026 Avrelin Aleksei.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from uuid import uuid4

logger = logging.getLogger("acc.journal")


def remember(directory: Path, call: dict) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / f"{uuid4().hex}.json"
    temporary = destination.with_suffix(".tmp")
    temporary.write_text(json.dumps(call, ensure_ascii=False), encoding="utf-8")
    temporary.replace(destination)


def recall(directory: Path) -> list[dict]:
    if not directory.is_dir():
        logger.info("Journal folder %s is not there yet", directory)
        return []
    calls: list[dict] = []
    for path in sorted(directory.glob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            logger.warning("Dropped unreadable journal file %s (%s)", path.name, error)
            continue
        if isinstance(payload, dict) and {"service", "verb", "status"} <= payload.keys():
            calls.append(payload)
    return calls
