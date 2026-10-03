"""Decide which contract operations stay out of the score.

Created by Avrelin Aleksei. Copyright 2026 Avrelin Aleksei.
"""

from __future__ import annotations

import fnmatch
from dataclasses import dataclass


@dataclass(frozen=True)
class SkipRule:
    path: str | None = None
    text: str | None = None
    method: str | None = None
    tag: str | None = None

    def as_yaml(self) -> str:
        lines = ["-"]
        for label, value in (("path", self.path), ("text", self.text), ("method", self.method), ("tag", self.tag)):
            if value:
                lines.append(f"  {label}: {value}")
        return "\n".join(lines)


def parse_rules(raw_rules: list[dict]) -> list[SkipRule]:
    parsed: list[SkipRule] = []
    for item in raw_rules:
        if not isinstance(item, dict):
            continue
        parsed.append(
            SkipRule(
                path=item.get("path"),
                text=item.get("text"),
                method=(item.get("method") or "").upper() or None,
                tag=item.get("tag"),
            )
        )
    return parsed


def _glob(pattern: str, value: str) -> bool:
    return fnmatch.fnmatch(value.casefold(), pattern.casefold())


def matching_rule(route: str, verb: str, summary: str, tags: list[str], rules: list[SkipRule]) -> SkipRule | None:
    haystack = " ".join((verb, route, summary, " ".join(tags)))
    for rule in rules:
        checks: list[bool] = []
        if rule.path:
            checks.append(_glob(rule.path, route))
        if rule.method:
            checks.append(rule.method == verb.upper())
        if rule.tag:
            checks.append(any(_glob(rule.tag, tag) for tag in tags))
        if rule.text:
            checks.append(_glob(rule.text, haystack))
        if checks and all(checks):
            return rule
    return None


def describe(rule: SkipRule, lang: str) -> str:
    bits = []
    if rule.path:
        bits.append(f"path {rule.path}")
    if rule.method:
        bits.append(f"method {rule.method}")
    if rule.tag:
        bits.append(f"tag {rule.tag}")
    if rule.text:
        bits.append(f"text {rule.text}")
    joined = ", ".join(bits) or "rule"
    if lang == "ru":
        return f"Исключено правилом: {joined}"
    return f"Excluded by {joined}"
