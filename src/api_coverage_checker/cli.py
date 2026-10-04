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

from api_coverage_checker.contract.read import fetch_document, list_operations
from api_coverage_checker.dashboard.junit import export_junit_xml
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
@click.option(
    "--format",
    "output_format",
    type=click.Choice(["html", "json", "junit"], case_sensitive=False),
    default="html",
    show_default=True,
    help="Output format for the report.",
)
def report_command(fail_under: float | None, output_format: str) -> None:
    """Generate coverage report and evaluate pass/fail threshold."""
    config = load_config()
    report = compose(config)

    if output_format == "json":
        click.echo(json.dumps(report, ensure_ascii=False, indent=2))
    elif output_format == "junit":
        click.echo(export_junit_xml(report))
    else:
        click.echo(f"Report generated successfully at {config.page_path}")

    threshold = fail_under if fail_under is not None else config.minimum_score
    if threshold is not None and lowest_score(report) < threshold:
        click.echo(f"Lowest score {lowest_score(report)}% is below threshold {threshold}%", err=True)
        sys.exit(1)


@command_line.command("validate")
def validate_command() -> None:
    """Validate OpenAPI contracts configured in acc.yaml."""
    config = load_config()
    if not config.apis:
        click.echo("No APIs configured in acc.yaml. Run 'acc init' to create a project configuration.", err=True)
        sys.exit(1)

    all_valid = True
    for api in config.apis:
        try:
            doc = fetch_document(api.spec_url, api.spec_file)
            ops = list_operations(doc)
            click.echo(f"✓ '{api.key}' ({api.title}): Valid spec with {len(ops)} operations.")
        except Exception as err:
            click.echo(f"✗ '{api.key}' ({api.title}): Invalid spec - {err}", err=True)
            all_valid = False

    if not all_valid:
        sys.exit(1)


@command_line.command("status")
def status_command() -> None:
    """Display quick summary of current API coverage scores."""
    config = load_config()
    if not config.apis:
        click.echo("No APIs configured in acc.yaml. Run 'acc init' to create a project configuration.", err=True)
        return

    report = compose(config)
    boards = report.get("boards") or []

    if not boards:
        click.echo("No API boards found in report.")
        return

    click.echo("\nAPI Coverage Status:")
    click.echo("--------------------")
    for board in boards:
        key = board.get("key", "")
        title = board.get("title", key)
        score = board.get("score", 0.0)
        hits = board.get("hit_count", 0)
        misses = board.get("miss_count", 0)
        skipped = board.get("skipped_count", 0)
        click.echo(f"• {title} ({key}): {score:.1f}% | Hits: {hits} | Misses: {misses} | Skipped: {skipped}")

    click.echo(f"\nLowest API Score: {lowest_score(report):.1f}%")


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
    """Show effective configuration."""
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


@command_line.command("badge")
@click.option("--out", "out_path", default="./acc-output/coverage.svg", show_default=True, help="Path to save SVG badge.")
def badge_command(out_path: str) -> None:
    """Generate SVG coverage badge for README.md."""
    config = load_config()
    report = compose(config)
    score = lowest_score(report)
    color = "#30d89a" if score >= 80 else "#f6c653" if score >= 50 else "#f06d51"
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="124" height="20" role="img" aria-label="api coverage: {score:.0f}%">
  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <clipPath id="r"><rect width="124" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="82" height="20" fill="#555"/>
    <rect x="82" width="42" height="20" fill="{color}"/>
    <rect width="124" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">
    <text x="420" y="140" transform="scale(.1)" fill="#fff" textLength="720">api coverage</text>
    <text x="1020" y="140" transform="scale(.1)" fill="#fff" textLength="320">{score:.0f}%</text>
  </g>
</svg>"""
    destination = Path(out_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(svg, encoding="utf-8")
    click.echo(f"Generated coverage badge at {destination}")


if __name__ == "__main__":
    command_line()
