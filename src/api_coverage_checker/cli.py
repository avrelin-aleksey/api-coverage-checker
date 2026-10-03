"""Command line for API Coverage Checker.

Created by Avrelin Aleksei. Copyright 2026 Avrelin Aleksei.
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

import click
import yaml

from api_coverage_checker.dashboard.publish import compose, lowest_score
from api_coverage_checker.runtime import load_config

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


def _initial_config(api_key: str, title: str, spec_file: str | None, spec_url: str | None) -> str:
    api = {"key": api_key, "title": title, "spec_file" if spec_file else "spec_url": spec_file or spec_url}
    return yaml.safe_dump(
        {
            "apis": [api],
            "journal_dir": "./acc-journal",
            "page_path": "./acc-output/index.html",
            "data_path": "./acc-output/report.json",
            "history_path": "./acc-output/history.json",
            "history_limit": 90,
            "minimum_score": 80,
        },
        allow_unicode=True,
        sort_keys=False,
    )


@click.group()
def command_line() -> None:
    """Measure how API tests exercise an OpenAPI contract."""


@command_line.command("report")
@click.option("--fail-under", type=float, default=None, help="Exit 1 when the lowest API score is below this percent.")
def report_command(fail_under: float | None) -> None:
    config = load_config()
    report = compose(config)
    threshold = fail_under if fail_under is not None else config.minimum_score
    if threshold is not None and lowest_score(report) < threshold:
        click.echo(f"Lowest score {lowest_score(report)} is below {threshold}", err=True)
        sys.exit(1)


@command_line.command("init")
@click.option("--api-key", default="my-api", show_default=True, help="Identifier used for the API in the report.")
@click.option("--title", default="My API", show_default=True, help="Title shown in the report.")
@click.option("--spec-file", default="./openapi.yaml", show_default=True, help="Local OpenAPI JSON/YAML file.")
@click.option("--spec-url", default=None, help="URL of the OpenAPI document instead of --spec-file.")
@click.option("--force", is_flag=True, help="Replace an existing acc.yaml.")
def init_command(api_key: str, title: str, spec_file: str | None, spec_url: str | None, force: bool) -> None:
    """Create the checker files in the current project directory."""
    if spec_url and spec_file != "./openapi.yaml":
        raise click.UsageError("Use either --spec-file or --spec-url, not both.")
    if spec_url:
        spec_file = None
    config_path = Path("acc.yaml")
    if config_path.exists() and not force:
        raise click.ClickException("acc.yaml already exists. Use --force only if you want to replace it.")
    config_path.write_text(_initial_config(api_key, title, spec_file, spec_url), encoding="utf-8")
    Path("acc-journal").mkdir(exist_ok=True)
    Path("acc-output").mkdir(exist_ok=True)
    click.echo("Created acc.yaml, acc-journal/ and acc-output/ in the current directory.")


@command_line.command("config")
def config_command() -> None:
    config = load_config()
    click.echo(
        json.dumps(
            {
                "source": str(config.source) if config.source else None,
                "apis": [api.key for api in config.apis],
                "journal_dir": str(config.journal_dir),
                "page_path": str(config.page_path),
                "data_path": str(config.data_path),
                "history_path": str(config.history_path),
                "minimum_score": config.minimum_score,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    command_line()
