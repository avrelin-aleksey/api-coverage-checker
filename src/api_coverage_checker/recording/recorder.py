"""Decorators that store the HTTP exchange returned by a test helper.

Created by Avrelin Aleksei. Copyright 2026 Avrelin Aleksei.
"""

from __future__ import annotations

import functools
import inspect
import logging
from collections.abc import Callable
from typing import Any
from urllib.parse import parse_qsl, urlsplit

from api_coverage_checker.recording.journal import remember
from api_coverage_checker.runtime import RuntimeConfig, load_config

logger = logging.getLogger("acc.recorder")


def _snapshot(service: str, template: str, response: Any) -> dict:
    request = response.request
    location = urlsplit(str(getattr(request, "url", "")))
    query = sorted({name for name, _value in parse_qsl(location.query, keep_blank_values=True)})
    request_body = getattr(request, "content", None)
    if request_body is None:
        request_body = getattr(request, "body", None)
    return {
        "service": service,
        "template": template,
        "verb": str(getattr(request, "method", "GET")).upper(),
        "status": int(response.status_code),
        "query": query,
        "saw_request": bool(request_body),
        "saw_response": bool(getattr(response, "content", b"")),
        "path": location.path or template,
    }


class ApiRecorder:
    def __init__(self, service: str, config: RuntimeConfig | None = None):
        self.service = service
        self.config = config or load_config()
        known = [api.key for api in self.config.apis]
        if service not in known:
            raise ValueError(f"API '{service}' is not listed in acc.yaml. Known: {', '.join(known) or 'none'}")

    def _keep(self, template: str, response: Any) -> None:
        try:
            remember(self.config.journal_dir, _snapshot(self.service, template, response))
        except Exception as error:  # noqa: BLE001
            logger.error("Could not record %s: %s", template, error)

    def _decorate(self, template: str, func: Callable) -> Callable:
        if inspect.iscoroutinefunction(func):

            @functools.wraps(func)
            async def async_call(*args, **kwargs):
                response = await func(*args, **kwargs)
                self._keep(template, response)
                return response

            return async_call

        @functools.wraps(func)
        def call(*args, **kwargs):
            response = func(*args, **kwargs)
            self._keep(template, response)
            return response

        return call

    def httpx(self, template: str) -> Callable:
        return lambda func: self._decorate(template, func)

    def requests(self, template: str) -> Callable:
        return lambda func: self._decorate(template, func)
