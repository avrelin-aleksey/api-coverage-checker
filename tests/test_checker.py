import json
from pathlib import Path

import httpx
import pytest
from click.testing import CliRunner

from api_coverage_checker.cli import command_line
from api_coverage_checker.contract.read import list_operations, list_sections
from api_coverage_checker.dashboard.publish import compose, lowest_score
from api_coverage_checker.recording.journal import recall, remember
from api_coverage_checker.recording.recorder import ApiRecorder
from api_coverage_checker.rules.skip import parse_rules
from api_coverage_checker.runtime import RuntimeConfig, WatchedApi
from api_coverage_checker.scoring.evaluate import route_fits, score_api

SPEC = """
openapi: 3.0.3
tags:
  - name: users
    description: People
  - name: infra
    description: Ops
paths:
  /health:
    get:
      tags: [infra]
      responses:
        "200":
          description: ok
  /users/{user_id}:
    parameters:
      - $ref: "#/components/parameters/UserId"
    get:
      summary: Read user
      tags: [users]
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                type: object
        "404":
          description: missing
  /users:
    post:
      summary: Create user
      requestBody:
        content:
          application/json:
            schema:
              type: object
      responses:
        "201":
          description: created
components:
  parameters:
    UserId:
      name: user_id
      in: path
      required: true
      schema:
        type: string
"""


def _config(tmp_path: Path, spec: Path) -> RuntimeConfig:
    return RuntimeConfig(
        apis=[
            WatchedApi(
                key="shop",
                title="Shop",
                spec_file=str(spec),
                skip=[{"path": "/health"}, {"tag": "infra"}],
            )
        ],
        journal_dir=tmp_path / "journal",
        page_path=tmp_path / "out" / "index.html",
        data_path=tmp_path / "out" / "report.json",
        history_path=tmp_path / "out" / "history.json",
        history_limit=2,
    )


def test_yaml_ref_becomes_operations(tmp_path: Path):
    spec = tmp_path / "openapi.yaml"
    spec.write_text(SPEC, encoding="utf-8")
    from api_coverage_checker.contract.read import _parse_text

    document = _parse_text(spec.read_text(encoding="utf-8"))
    operations = list_operations(document)
    sections = list_sections(document)
    routes = {(item.verb, item.route) for item in operations}
    assert ("GET", "/users/{user_id}") in routes
    assert ("POST", "/users") in routes
    assert sections[0] == {"name": "users", "description": "People"}


def test_template_matches_concrete_path():
    assert route_fits("/users/{user_id}", "/users/42")
    assert not route_fits("/users/{user_id}", "/users/42/orders")


def test_recorder_writes_one_file_per_call(tmp_path: Path):
    spec = tmp_path / "openapi.yaml"
    spec.write_text(SPEC, encoding="utf-8")
    config = _config(tmp_path, spec)
    recorder = ApiRecorder("shop", config)
    request = httpx.Request("GET", "http://test/users/42")
    response = httpx.Response(200, request=request, content=b"{}")

    @recorder.httpx("/users/{user_id}")
    def read_user():
        return response

    assert read_user().status_code == 200
    stored = recall(config.journal_dir)
    assert stored[0]["path"] == "/users/42"
    assert stored[0]["saw_response"] is True


def test_broken_journal_file_is_skipped(tmp_path: Path):
    folder = tmp_path / "journal"
    folder.mkdir()
    (folder / "bad.json").write_text("{not json", encoding="utf-8")
    remember(folder, {"service": "shop", "verb": "GET", "status": 200, "template": "/users", "path": "/users", "query": []})
    assert len(recall(folder)) == 1


def test_skip_rule_drops_health_from_the_score(tmp_path: Path):
    spec = tmp_path / "openapi.yaml"
    spec.write_text(SPEC, encoding="utf-8")
    from api_coverage_checker.contract.read import _parse_text

    operations = list_operations(_parse_text(spec.read_text(encoding="utf-8")))
    calls = [
        {
            "service": "shop",
            "template": "/users/{user_id}",
            "verb": "GET",
            "status": 200,
            "query": [],
            "saw_request": False,
            "saw_response": True,
            "path": "/users/42",
        }
    ]
    board = score_api(operations, calls, parse_rules([{"path": "/health"}, {"tag": "infra"}]))
    health = next(row for row in board["operations"] if row["route"] == "/health")
    assert health["skipped"] is True
    assert "path: /health" in health["restore_yaml"]
    assert board["skipped_count"] >= 1
    assert board["score"] > 0


def test_report_round_trip_and_history_cap(tmp_path: Path):
    spec = tmp_path / "openapi.yaml"
    spec.write_text(SPEC, encoding="utf-8")
    config = _config(tmp_path, spec)
    remember(
        config.journal_dir,
        {
            "service": "shop",
            "template": "/users/{user_id}",
            "verb": "GET",
            "status": 200,
            "query": [],
            "saw_request": False,
            "saw_response": True,
            "path": "/users/7",
        },
    )
    first = compose(config)
    second = compose(config)
    assert "generated_at" in first
    assert first["created_by"] == "Avrelin Aleksei"
    assert first["boards"][0]["operations"]
    assert first["boards"][0]["sections"][0]["name"] == "users"
    saved = json.loads(config.data_path.read_text(encoding="utf-8"))
    assert saved["catalog"][0]["key"] == "shop"
    html = config.page_path.read_text(encoding="utf-8")
    assert "acc-data" in html
    assert "Created by Avrelin Aleksei" in html
    assert len(second["boards"][0]["history"]) == 2
    assert lowest_score(second) == second["boards"][0]["score"]
    third = compose(config)
    history = third["boards"][0]["history"]
    assert len(history) == 2
    assert history[0]["at"] == second["boards"][0]["history"][1]["at"]


def test_zero_score_is_kept_in_history(tmp_path: Path):
    spec = tmp_path / "openapi.yaml"
    spec.write_text(SPEC, encoding="utf-8")
    config = _config(tmp_path, spec)
    empty = compose(config)
    assert empty["boards"][0]["score"] == 0
    assert len(empty["boards"][0]["history"]) == 1
    assert empty["boards"][0]["history"][0]["score"] == 0
    repeated = compose(config)
    assert len(repeated["boards"][0]["history"]) == 1
    assert [point["score"] for point in repeated["boards"][0]["history"]] == [0]


def test_empty_journal_keeps_previous_report(tmp_path: Path):
    spec = tmp_path / "openapi.yaml"
    spec.write_text(SPEC, encoding="utf-8")
    config = _config(tmp_path, spec)
    remember(
        config.journal_dir,
        {
            "service": "shop",
            "template": "/users/{user_id}",
            "verb": "GET",
            "status": 200,
            "query": [],
            "saw_request": False,
            "saw_response": True,
            "path": "/users/7",
        },
    )
    first = compose(config)
    first_history = first["boards"][0]["history"]
    for journal_file in config.journal_dir.glob("*.json"):
        journal_file.unlink()

    second = compose(config)

    assert second["boards"][0]["score"] == first["boards"][0]["score"]
    assert second["boards"][0]["hit_count"] == first["boards"][0]["hit_count"]
    assert second["boards"][0]["miss_count"] == first["boards"][0]["miss_count"]
    assert second["boards"][0]["operations"] == first["boards"][0]["operations"]
    assert second["boards"][0]["history"] == first_history


def test_fail_under_exits(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    spec = tmp_path / "openapi.yaml"
    spec.write_text(SPEC, encoding="utf-8")
    config_file = tmp_path / "acc.yaml"
    config_file.write_text(
        "apis:\n  - key: shop\n    title: Shop\n    spec_file: openapi.yaml\n",
        encoding="utf-8",
    )
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("ACC_CONFIG", str(config_file))
    result = CliRunner().invoke(command_line, ["report", "--fail-under", "99"])
    assert result.exit_code == 1


def test_init_creates_project_files(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.chdir(tmp_path)
    result = CliRunner().invoke(
        command_line,
        ["init", "--api-key", "shop", "--title", "Shop API", "--spec-file", "./openapi.yaml"],
    )
    assert result.exit_code == 0
    assert "Created acc.yaml" in result.output
    config = (tmp_path / "acc.yaml").read_text(encoding="utf-8")
    assert "key: shop" in config
    assert "title: Shop API" in config
    assert "spec_file: ./openapi.yaml" in config
    assert (tmp_path / "acc-journal").is_dir()
    assert (tmp_path / "acc-output").is_dir()


def test_init_does_not_replace_config_without_force(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "acc.yaml").write_text("keep: me\n", encoding="utf-8")
    result = CliRunner().invoke(command_line, ["init"])
    assert result.exit_code != 0
    assert "already exists" in result.output
    assert (tmp_path / "acc.yaml").read_text(encoding="utf-8") == "keep: me\n"


def test_unknown_service_is_rejected(tmp_path: Path):
    config = RuntimeConfig(
        apis=[],
        journal_dir=tmp_path / "journal",
        page_path=tmp_path / "index.html",
        data_path=tmp_path / "report.json",
        history_path=tmp_path / "history.json",
    )
    with pytest.raises(ValueError, match="not listed"):
        ApiRecorder("missing", config)
