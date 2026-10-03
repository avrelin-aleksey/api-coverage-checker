"""Compare recorded calls with one API contract.

Created by Avrelin Aleksei. Copyright 2026 Avrelin Aleksei.
"""

from __future__ import annotations

from api_coverage_checker.contract.read import Operation
from api_coverage_checker.rules.skip import SkipRule, describe, matching_rule


def route_fits(template: str, observed: str) -> bool:
    left = [part for part in template.split("/") if part]
    right = [part for part in observed.split("/") if part]
    if len(left) != len(right):
        return False
    for expected, actual in zip(left, right, strict=True):
        if expected.startswith("{") and expected.endswith("}"):
            continue
        if expected != actual:
            return False
    return True


def _status_fits(label: str, code: int) -> bool:
    token = str(label).upper()
    if token == "DEFAULT":
        return True
    if len(token) == 3 and token.endswith("XX") and token[0].isdigit():
        return code // 100 == int(token[0])
    return token == str(code)


def _related(operation: Operation, calls: list[dict]) -> list[dict]:
    related = []
    for call in calls:
        if str(call.get("verb", "")).upper() != operation.verb:
            continue
        candidates = (str(call.get("template") or ""), str(call.get("path") or ""))
        if any(candidate and (candidate == operation.route or route_fits(operation.route, candidate) or route_fits(candidate, operation.route)) for candidate in candidates):
            related.append(call)
    return related


def _percent(passed: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return round(passed * 100 / total, 2)


def _operation_row(operation: Operation, calls: list[dict], rule: SkipRule | None) -> dict:
    related = _related(operation, calls)
    checks: list[bool] = [bool(related)]
    statuses = []
    for label, has_body in operation.statuses:
        hits = [call for call in related if _status_fits(label, int(call.get("status", 0)))]
        checks.append(bool(hits))
        body_state = "unused"
        if has_body:
            body_seen = any(call.get("saw_response") for call in hits)
            checks.append(body_seen)
            body_state = "seen" if body_seen else "absent"
        statuses.append(
            {
                "label": label,
                "calls": len(hits),
                "seen": "seen" if hits else "absent",
                "body": body_state,
            }
        )
    if operation.expects_body:
        request_seen = any(call.get("saw_request") for call in related)
        checks.append(request_seen)
        request_state = "seen" if request_seen else "absent"
    else:
        request_state = "unused"
    query_rows = []
    for name in operation.query:
        seen = any(name in (call.get("query") or []) for call in related)
        checks.append(seen)
        query_rows.append({"name": name, "seen": "seen" if seen else "absent"})
    score = 0.0 if rule else _percent(sum(checks), len(checks))
    return {
        "route": operation.route,
        "verb": operation.verb,
        "summary": operation.summary,
        "score": score,
        "calls": len(related),
        "skipped": rule is not None,
        "skip_note": describe(rule, "en") if rule else "",
        "skip_note_ru": describe(rule, "ru") if rule else "",
        "restore_yaml": rule.as_yaml() if rule else "",
        "tags": operation.tags,
        "request": request_state,
        "statuses": statuses,
        "query": query_rows,
    }


def score_api(operations: list[Operation], calls: list[dict], rules: list[SkipRule]) -> dict:
    rows = []
    for operation in operations:
        rule = matching_rule(operation.route, operation.verb, operation.summary, operation.tags, rules)
        rows.append(_operation_row(operation, calls, rule))
    active = [row for row in rows if not row["skipped"]]
    hit = sum(1 for row in active if row["calls"] > 0)
    return {
        "score": _percent(sum(row["score"] for row in active), 100 * len(active)) if active else 0.0,
        "hit_count": hit,
        "miss_count": len(active) - hit,
        "skipped_count": len(rows) - len(active),
        "operations": rows,
    }
