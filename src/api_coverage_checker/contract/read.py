"""Turn an OpenAPI or Swagger document into a flat operation list.

Created by Avrelin Aleksei. Copyright 2026 Avrelin Aleksei.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.request import urlopen

import yaml

VERBS = frozenset({"get", "put", "post", "head", "patch", "delete", "options", "trace"})


@dataclass
class Operation:
    route: str
    verb: str
    summary: str = ""
    tags: list[str] = field(default_factory=list)
    expects_body: bool = False
    statuses: list[tuple[str, bool]] = field(default_factory=list)
    query: list[str] = field(default_factory=list)


def _parse_text(text: str) -> dict[str, Any]:
    stripped = text.lstrip()
    if stripped.startswith("{") or stripped.startswith("["):
        loaded = json.loads(text)
    else:
        loaded = yaml.safe_load(text)
    if not isinstance(loaded, dict):
        raise ValueError("Specification root must be an object")
    return loaded


def fetch_document(spec_url: str | None, spec_file: str | None) -> dict[str, Any]:
    if spec_url:
        with urlopen(spec_url, timeout=30) as response:  # noqa: S310
            payload = response.read().decode("utf-8")
        return _parse_text(payload)
    if spec_file:
        path = Path(spec_file)
        if not path.is_file():
            raise ValueError(f"Specification file is missing: {path}")
        return _parse_text(path.read_text(encoding="utf-8"))
    raise ValueError("Each API needs spec_url or spec_file")


def _lookup(root: dict[str, Any], pointer: str) -> Any:
    cursor: Any = root
    for token in pointer[2:].split("/"):
        token = token.replace("~1", "/").replace("~0", "~")
        if not isinstance(cursor, dict) or token not in cursor:
            return None
        cursor = cursor[token]
    return cursor


def _expand(node: Any, root: dict[str, Any], trail: tuple[str, ...] = ()) -> Any:
    if isinstance(node, list):
        return [_expand(item, root, trail) for item in node]
    if not isinstance(node, dict):
        return node
    pointer = node.get("$ref")
    if isinstance(pointer, str) and pointer.startswith("#/"):
        if pointer in trail:
            return {}
        target = _lookup(root, pointer)
        if target is None:
            return node
        return _expand(target, root, trail + (pointer,))
    return {key: _expand(value, root, trail) for key, value in node.items()}


def _status_entries(responses: dict[str, Any]) -> list[tuple[str, bool]]:
    entries: list[tuple[str, bool]] = []
    for label, body in responses.items():
        payload = body if isinstance(body, dict) else {}
        has_body = bool(payload.get("content") or payload.get("schema"))
        entries.append((str(label), has_body))
    return entries


def _query_names(parameters: list[Any]) -> list[str]:
    names = {
        str(item.get("name"))
        for item in parameters
        if isinstance(item, dict) and str(item.get("in", "")).lower() == "query" and item.get("name")
    }
    return sorted(names)


def list_sections(document: dict[str, Any]) -> list[dict[str, str]]:
    expanded = _expand(document, document)
    sections: list[dict[str, str]] = []
    for item in expanded.get("tags") or []:
        if isinstance(item, str) and item:
            sections.append({"name": item, "description": ""})
        elif isinstance(item, dict) and item.get("name"):
            sections.append({"name": str(item["name"]), "description": str(item.get("description") or "")})
    return sections


def list_operations(document: dict[str, Any]) -> list[Operation]:
    expanded = _expand(document, document)
    paths = expanded.get("paths") or {}
    if not isinstance(paths, dict) or not paths:
        raise ValueError("Specification has no paths")
    found: list[Operation] = []
    for route, path_item in paths.items():
        if not isinstance(path_item, dict):
            continue
        shared = list(path_item.get("parameters") or [])
        for verb, raw in path_item.items():
            if verb.lower() not in VERBS or not isinstance(raw, dict):
                continue
            parameters = shared + list(raw.get("parameters") or [])
            found.append(
                Operation(
                    route=str(route),
                    verb=verb.upper(),
                    summary=str(raw.get("summary") or ""),
                    tags=[str(tag) for tag in raw.get("tags") or []],
                    expects_body=bool(raw.get("requestBody")),
                    statuses=_status_entries(raw.get("responses") or {}),
                    query=_query_names(parameters),
                )
            )
    if not found:
        raise ValueError("Specification has no operations")
    return found
