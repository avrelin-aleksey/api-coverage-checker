# How API Coverage Checker works

Pytest does not build the page. `acc report` does not run tests.

## Install and run

Before starting, prepare the project: install Python 3.11 or newer, create and activate its virtual environment, install the project dependencies and test runner, and make an OpenAPI JSON/YAML specification available locally or by URL. The commands below assume that the correct virtual environment is already active.

For normal use, install the product into the repository that contains your API tests. You do not need to copy the API Coverage Checker repository into the test project. A typical layout is:

```text
my-project/
├── acc.yaml
├── openapi.yaml
└── tests/
```

Open a terminal in `my-project/` and install the product from GitHub. `my-project` means the root directory of your own product, where its existing automated-test command is run. The API Coverage Checker repository does not need to be placed inside it.

```bash
cd path/to/my-project
python -m pip install "git+https://github.com/avrelin-aleksey/api-coverage-checker.git"
```

From `my-project/`, run this once:

```bash
acc init --api-key my-api --title "My API" --spec-file ./openapi.yaml
```

The command creates `acc.yaml`, `acc-journal/`, and `acc-output/` in the current directory. If the specification is served by a URL, use `--spec-url http://localhost:8000/openapi.json` instead of `--spec-file`. An existing `acc.yaml` is not replaced unless you explicitly pass `--force`. This guide assumes that the existing automated-test setup already integrates with the checker.

Run the usual automated-test command first, then run the report from `my-project/`, the same directory as `acc.yaml`:

```bash
# Run the project's usual automated-test command here.
acc report
```

Open `acc-output/index.html` in a browser. `acc report` does not start a web server or a separate desktop application; it generates a self-contained static HTML page. Repeat the same two steps after each test run. For a clean run, remove `acc-journal/` first. On Windows PowerShell use `Remove-Item -Recurse -Force .\acc-journal`; on macOS use `open acc-output/index.html`; on Linux use `xdg-open acc-output/index.html`.

To update a product installed from GitHub, use the same virtual environment that contains the project's `acc` command. On Windows PowerShell, run this in `my-project/`:

```powershell
.\.venv\Scripts\python.exe -m pip install --upgrade --force-reinstall --no-cache-dir "git+https://github.com/avrelin-aleksey/api-coverage-checker.git@main"

# If a new measurement is needed, run the project's usual automated-test command first.
.\.venv\Scripts\acc.exe report
Start-Process .\acc-output\index.html
```

On Linux/macOS use the corresponding paths:

```bash
./.venv/bin/python -m pip install --upgrade --force-reinstall --no-cache-dir "git+https://github.com/avrelin-aleksey/api-coverage-checker.git@main"
./.venv/bin/acc report
```

The explicit `.venv` paths are important: `pip` and `acc` from another Python installation can leave the project using an older checker. `--force-reinstall --no-cache-dir` makes pip fetch the current GitHub revision instead of reusing an installed VCS copy. Do not run `acc init` again during an update: it is only for the first setup. The update does not remove `acc.yaml`, `acc-journal/`, or the saved history in `acc-output/history.json`. Installing the package does not change an existing HTML file until `acc report` is run.

If the page still looks old, verify the installed revision:

```powershell
Get-Content .\.venv\Lib\site-packages\api_coverage_checker-*.dist-info\direct_url.json
```

The file should contain the current GitHub commit, not an older commit ID. Open the report only after running `.\.venv\Scripts\acc.exe report`.

If you did not run the automated tests after the update, you can still run `acc report`: when `acc-journal/` is empty, it keeps the last saved report instead of replacing the counters and operation details with zeros. If the journal still contains calls, the report is rebuilt from them. If the journal was cleared and you need a new measurement, run the tests again before building the report.

Clone the API Coverage Checker repository itself only when developing the checker or its report UI. For normal interaction with the checker, the GitHub installation above is enough.

1. Decorated tests write one JSON file per call into `acc-journal/`.
2. `acc report` reads that journal and the spec, then writes `acc-output/index.html` and `acc-output/report.json`.

Journal files accumulate. Clear `acc-journal/` before a clean run, then run the tests and `acc report` again.

A decorator stores the method, status, query names, and whether a request or response body was present. Use the contract path, such as `/users/{user_id}`, not `/users/42`.

## What the percentage is made of

An operation is scored from the call itself, each declared status, a declared response body, a declared request body, and each query name. The API score is the average of operations that `skip` did not remove.

## Report page

The header switches language and theme. The theme choice stays in the browser. The ring is **detail coverage**: the average of covered checks inside active operations, including calls, response codes, bodies, and query parameters. The three counts beside it are endpoint coverage counts:

- **Covered** — operations the tests called at least once.
- **Uncovered** — operations with no calls. They pull the percentage down.
- **Ignored** — operations matched by `skip`. They are listed at the bottom and do not change the percentage.

Operations are grouped by OpenAPI tags, in spec order. An operation with several tags appears in each of those sections. Operations without a tag sit in **Other**.

Open an operation. Each fact is a colored badge:

- Green, **Used**.
- Red, **Absent**.
- Gray, **Not declared** — the contract does not declare this, so it is not a gap.

The facts are the request body, each query name, each response code, and the response body when the contract declares one. Next to a query name the badge is only the mark. Hover it to read **Used**, **Absent**, or **Not declared**.

The line chart at the top is coverage progress. Each `acc report` with measured calls appends one point to `acc-output/history.json`. If the journal is empty and a previous report exists, `acc report` keeps that report and does not add a duplicate point. The call journal and this file are separate: clearing `acc-journal/` does not erase the chart. Switch between **Runs**, **Days**, **Weeks**, **Months**, and **Custom period**. Days, weeks, and months keep the last report in each period. `history_limit` (default 90) is how many run points are kept.

For **Custom period**, choose a start and end date. Future dates are disabled, the start cannot be after the end, and the end cannot be before the start. A one-day range produces one daily average; a two-to-fourteen-day range produces one average per day; a longer range is divided into at most 14 equal intervals. Empty intervals stay on the axis without an invented value, so the line is broken across missing data. The selected start and end dates are always shown on the axis. The chart also shows the change from the previous run. **CSV** downloads a detailed table with the summary, history, and all API operations; **Report** downloads the complete self-contained HTML page, which can be printed to PDF from the browser.

## Attention threshold

The slider starts at 10% and changes visual status colors without recalculating scores. Section and endpoint summaries use three bands: below half the chosen threshold is red, from half up to (but not including) the threshold is yellow, and the threshold or higher is green. Individual operation percentages below the threshold are red. The slider does not filter the list by itself; the separate “Below threshold” filter uses its value.

`acc report --fail-under 80` is a separate check. The command still writes the report and exits with code 1 when the lowest API score is below 80. The slider does not set that limit. The same limit can be `minimum_score: 80` in `acc.yaml`. When `--fail-under` is passed, that value wins.

## How to ignore

`skip` rules belong to one API. A rule matches when every field it sets matches:

- `path` — the contract path. `*` is a mask, for example `/docs*`.
- `method` — `GET`, `POST`, and the other verbs.
- `tag` — an OpenAPI tag.
- `text` — a mask over method, path, summary, and tags together, for example `*internal*`.

Add one list item for every path or method you want to exclude. Separate items are alternatives (OR), while fields inside one item are combined (AND). This example ignores two complete paths, every `OPTIONS` operation, and only `GET` and `POST` for `/admin/users`:

```yaml
apis:
  - key: shop
    title: Shop API
    spec_file: ./openapi.yaml
    skip:
      - path: /health
      - path: /metrics
      - method: OPTIONS
      - path: /admin/users
        method: GET
      - path: /admin/users
        method: POST
```

To ignore every method for one path, use only `path`. To ignore several methods for the same path, repeat the path in separate items because one `method` field specifies one method. Use a mask such as `/docs*` to ignore a group of paths.

The ignored block names the matching rule and shows the YAML to delete. Remove that item from `acc.yaml` and run `acc report` again to put the operation back into the percentage.

`acc config` prints the chosen settings file and the journal and report paths. Run it from the directory that contains `acc.yaml`.

Created by Avrelin Aleksei.
