"""Assemble the report document and drop it into the static page.

Created by Avrelin Aleksei. Copyright 2026 Avrelin Aleksei.
"""

from __future__ import annotations

import json
import logging
from copy import deepcopy
from datetime import UTC, datetime
from importlib.resources import files
from pathlib import Path

from api_coverage_checker.contract.read import fetch_document, list_operations, list_sections
from api_coverage_checker.recording.journal import recall
from api_coverage_checker.rules.skip import parse_rules
from api_coverage_checker.runtime import RuntimeConfig
from api_coverage_checker.scoring.evaluate import score_api
from api_coverage_checker.timeline.memory import extend_series, read_series, write_series

logger = logging.getLogger("acc.dashboard")


def _html_json(payload: dict) -> str:
    # Keep a literal "</script>" inside recorded text from closing the host tag.
    return json.dumps(payload, ensure_ascii=False).replace("<", "\\u003c")


def _splice(template: str, payload: str) -> str:
    marker = 'id="acc-data"'
    folded = template.casefold()
    at = folded.find(marker)
    if at < 0:
        block = f'<script id="acc-data" type="application/json">{payload}</script><!-- Created by Avrelin Aleksei -->'
        return template.replace("</body>", f"{block}</body>", 1)
    open_at = template.rfind("<script", 0, at)
    close_at = folded.find("</script>", at)
    if open_at < 0 or close_at < 0:
        return template
    block = f'<script id="acc-data" type="application/json">{payload}</script><!-- Created by Avrelin Aleksei -->'
    return template[:open_at] + block + template[close_at + len("</script>") :]


def bundled_template() -> str:
    return files("api_coverage_checker.dashboard").joinpath("page.html").read_text(encoding="utf-8")


def _read_report(path: Path | None) -> dict:
    if path is None or not path.is_file():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        logger.warning("Previous report ignored: %s", error)
        return {}
    return payload if isinstance(payload, dict) else {}


def compose(config: RuntimeConfig) -> dict:
    calls = recall(config.journal_dir)
    previous = read_series(config.history_path)
    previous_report = _read_report(config.data_path)
    previous_boards = {
        str(board.get("key")): board
        for board in previous_report.get("boards") or []
        if isinstance(board, dict) and board.get("key")
    }
    boards = []
    measured_keys: set[str] = set()
    for api in config.apis:
        document = fetch_document(api.spec_url, api.spec_file)
        owned = [call for call in calls if call.get("service") == api.key]

        # An empty journal means that no test run has produced new data. Keep
        # the last report instead of replacing useful coverage with zeros.
        # A first report still gets calculated normally because there is no
        # previous board to preserve.
        if not owned and api.key in previous_boards:
            board = deepcopy(previous_boards[api.key])
            board["key"] = api.key
            board["title"] = api.title
            boards.append(board)
            continue

        measured = score_api(list_operations(document), owned, parse_rules(api.skip))
        measured["sections"] = list_sections(document)
        prior_routes = ((previous.get("apis") or {}).get(api.key) or {}).get("routes") or {}
        for row in measured["operations"]:
            row["history"] = list(prior_routes.get(f"{row['verb']}|{row['route']}") or [])
        boards.append({"key": api.key, "title": api.title, **measured})
        measured_keys.add(api.key)

    series = extend_series(previous, [board for board in boards if board["key"] in measured_keys], config.history_limit)
    for board in boards:
        stored = (series.get("apis") or {}).get(board["key"]) or {}
        if stored.get("score") is not None:
            board["history"] = list(stored.get("score") or [])
    report = {
        "generated_at": datetime.now(UTC).isoformat(),
        "created_by": "Avrelin Aleksei",
        "catalog": [{"key": api.key, "title": api.title} for api in config.apis],
        "boards": boards,
    }
    write_series(config.history_path, series)
    _store(config, report)
    return report


def _store(config: RuntimeConfig, report: dict) -> None:
    config.data_path.parent.mkdir(parents=True, exist_ok=True)
    config.data_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    page = _splice(bundled_template(), _html_json(report))
    config.page_path.parent.mkdir(parents=True, exist_ok=True)
    config.page_path.write_text(page, encoding="utf-8")
    logger.info("Wrote %s and %s", config.data_path, config.page_path)


def lowest_score(report: dict) -> float:
    scores = [float(board["score"]) for board in report.get("boards") or []]
    return min(scores) if scores else 0.0
