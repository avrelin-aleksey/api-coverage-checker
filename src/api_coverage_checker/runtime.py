"""Read acc.yaml plus ACC_* environment overrides.

Created by Avrelin Aleksei. Copyright 2026 Avrelin Aleksei.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

import yaml


@dataclass
class WatchedApi:
    key: str
    title: str
    spec_url: str | None = None
    spec_file: str | None = None
    skip: list[dict] = field(default_factory=list)


@dataclass
class RuntimeConfig:
    apis: list[WatchedApi]
    journal_dir: Path
    page_path: Path
    data_path: Path
    history_path: Path
    history_limit: int = 90
    minimum_score: float | None = None
    source: Path | None = None


def _pick_path(env_name: str, configured: object, fallback: str) -> Path:
    override = os.environ.get(env_name)
    if override:
        return Path(override)
    if configured:
        return Path(str(configured))
    return Path(fallback)


def load_config(explicit: Path | None = None) -> RuntimeConfig:
    if explicit is not None:
        chosen = explicit
    elif os.environ.get("ACC_CONFIG"):
        chosen = Path(os.environ["ACC_CONFIG"])
    else:
        chosen = Path("acc.yaml")

    document: dict = {}
    if chosen.is_file():
        loaded = yaml.safe_load(chosen.read_text(encoding="utf-8")) or {}
        if not isinstance(loaded, dict):
            raise ValueError(f"{chosen} must be a YAML mapping")
        document = loaded

    apis = [
        WatchedApi(
            key=str(item["key"]),
            title=str(item.get("title") or item["key"]),
            spec_url=item.get("spec_url"),
            spec_file=item.get("spec_file"),
            skip=list(item.get("skip") or []),
        )
        for item in document.get("apis") or []
    ]
    minimum = document.get("minimum_score", None)
    if os.environ.get("ACC_MINIMUM_SCORE"):
        minimum = float(os.environ["ACC_MINIMUM_SCORE"])
    return RuntimeConfig(
        apis=apis,
        journal_dir=_pick_path("ACC_JOURNAL_DIR", document.get("journal_dir"), "acc-journal"),
        page_path=_pick_path("ACC_PAGE_PATH", document.get("page_path"), "acc-output/index.html"),
        data_path=_pick_path("ACC_DATA_PATH", document.get("data_path"), "acc-output/report.json"),
        history_path=_pick_path("ACC_HISTORY_PATH", document.get("history_path"), "acc-output/history.json"),
        history_limit=int(document.get("history_limit") or 90),
        minimum_score=None if minimum in (None, "") else float(minimum),
        source=chosen if chosen.is_file() else None,
    )
