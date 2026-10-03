import { useEffect, useMemo, useRef, useState } from "react";
import { averageHistory, barLabel, bucketLabelLines, chartLabelLines, compareHistory, parseStamp, scaleHistory, type HistoryBucket, type HistoryChange, type HistoryPoint, type ProgressScale } from "./history";
import { I18N, methodLabel, stateHint, stateLabel, type Lang } from "./i18n";
import type { Board, OperationRow, ReportFile, Section } from "./types";

/** Created by Avrelin Aleksei. Copyright 2026 Avrelin Aleksei. */
const EMPTY: ReportFile = { generated_at: "", catalog: [], boards: [] };

function loadReport(): ReportFile {
  const value = document.querySelector<HTMLScriptElement>("#acc-data")?.textContent;
  if (!value) return EMPTY;
  try {
    return JSON.parse(value) as ReportFile;
  } catch {
    return EMPTY;
  }
}

function groupBySection(rows: OperationRow[], sections: Section[]) {
  const notes = new Map(sections.map((section) => [section.name, section.description || ""]));
  const buckets = new Map<string, OperationRow[]>();
  const extra: string[] = [];
  const untagged: OperationRow[] = [];
  for (const row of rows) {
    const tags = (row.tags || []).filter(Boolean);
    if (!tags.length) {
      untagged.push(row);
      continue;
    }
    for (const tag of tags) {
      if (!buckets.has(tag)) {
        buckets.set(tag, []);
        if (!notes.has(tag)) extra.push(tag);
      }
      buckets.get(tag)?.push(row);
    }
  }
  const named = sections.map((section) => section.name).filter((name) => buckets.get(name)?.length);
  const groups = [...named, ...extra].map((name) => ({
    name,
    description: notes.get(name) || "",
    rows: buckets.get(name) || [],
  }));
  if (untagged.length) groups.push({ name: "", description: "", rows: untagged });
  return groups;
}

function normalizeTagLabel(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9а-яё]+/gi, "");
}

function localDateInputValue(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function coverageTone(score: number, threshold: number): "attention" | "partial" | "complete" {
  if (score < threshold / 2) return "attention";
  if (score < threshold) return "partial";
  return "complete";
}

function downloadBlob(content: BlobPart, type: string, filename: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadCoverageCsv(board: Board, points: HistoryPoint[], lang: Lang) {
  const t = I18N[lang];
  const sections = new Map((board.sections || []).map((section) => [section.name, section.description || section.name]));
  const rows: unknown[][] = [
    [t.reportTitle, board.title || board.key],
    [t.reportGenerated, new Date().toISOString()],
    [t.reportScore, `${Number(board.score || 0).toFixed(1)}%`],
    [t.reportCovered, board.hit_count],
    [t.reportUncovered, board.miss_count],
    [t.reportIgnored, board.skipped_count],
    [],
    [t.reportHistory],
    [t.reportAt, t.reportScore],
    ...points.map((point) => [point.at, `${Number(point.score).toFixed(1)}%`]),
    [],
    [t.reportOperations],
    [t.reportSection, t.reportMethod, t.reportPath, t.reportSummary, t.reportScore, t.reportCalls, t.reportStatus, t.reportRequest, t.reportResponseCodes, t.reportQuery, t.reportTags],
    ...board.operations.map((row) => [
      sections.get((row.tags || [])[0] || "") || (row.tags || []).join("; "),
      methodLabel(row.verb),
      row.route,
      row.summary || "",
      `${Number(row.score || 0).toFixed(1)}%`,
      row.calls,
      row.skipped ? t.reportIgnoredStatus : row.calls > 0 ? t.reportCoveredStatus : t.reportUncoveredStatus,
      row.request,
      (row.statuses || []).map((status) => `${status.label}: ${status.calls}`).join("; "),
      (row.query || []).map((item) => `${item.name}: ${item.seen}`).join("; "),
      (row.tags || []).join("; "),
    ]),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const safeName = (board.title || board.key || "api").replace(/[^a-z0-9а-яё_-]+/gi, "-").replace(/^-+|-+$/g, "") || "api";
  downloadBlob(`\ufeff${csv}\n`, "text/csv;charset=utf-8", `coverage-${safeName}.csv`);
}

function downloadCoveragePage(title: string, apiKey: string) {
  const safeName = (title || apiKey || "api").replace(/[^a-z0-9а-яё_-]+/gi, "-").replace(/^-+|-+$/g, "") || "api";
  downloadBlob(`<!doctype html>\n${document.documentElement.outerHTML}`, "text/html;charset=utf-8", `coverage-${safeName}-report.html`);
}

function EndpointCoverage({ board, lang, threshold }: { board: Board; lang: Lang; threshold: number }) {
  const t = I18N[lang];
  const endpointTotal = board.hit_count + board.miss_count + board.skipped_count;
  const endpointCoverage = endpointTotal ? (board.hit_count * 100) / endpointTotal : 0;
  const endpointTone = coverageTone(endpointCoverage, threshold);
  const coveredWidth = endpointTotal ? (board.hit_count * 100) / endpointTotal : 0;
  const ignoredWidth = endpointTotal ? (board.skipped_count * 100) / endpointTotal : 0;
  const uncoveredWidth = endpointTotal ? (board.miss_count * 100) / endpointTotal : 0;

  return <div className="endpoint-coverage">
    <div className="endpoint-coverage-head"><span>{t.endpointCoverage}</span><strong className={endpointTone}>{endpointCoverage.toFixed(0)}%</strong></div>
    <div className="endpoint-coverage-track" aria-label={t.endpointCoverage}>
      <span className="coverage-segment segment-covered" style={{ width: `${coveredWidth}%` }} />
      <span className="coverage-segment segment-ignored" style={{ width: `${ignoredWidth}%` }} />
      <span className="coverage-segment segment-uncovered" style={{ width: `${uncoveredWidth}%` }} />
    </div>
    <div className="endpoint-coverage-counts">
      <span className="coverage-count is-covered"><i aria-hidden="true" />{board.hit_count} {t.covered}</span>
      <span className="coverage-count is-ignored"><i aria-hidden="true" />{board.skipped_count} {t.ignored}</span>
      <span className="coverage-count is-uncovered"><i aria-hidden="true" />{board.miss_count} {t.uncovered}</span>
    </div>
  </div>;
}

function ProgressChart({ points, board, lang }: { points: HistoryPoint[]; board: Board; lang: Lang }) {
  const t = I18N[lang];
  const stored = localStorage.getItem("acc-progress");
  const today = useMemo(() => localDateInputValue(), []);
  const [scale, setScale] = useState<ProgressScale>(stored === "days" || stored === "weeks" || stored === "months" ? stored : "runs");
  const [customOpen, setCustomOpen] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const customActive = Boolean(customStart || customEnd);
  const customRangeActive = Boolean(customStart && customEnd);
  const customPoints = scaleHistory(points, "runs").filter((point) => {
    const timestamp = parseStamp(point.at).getTime();
    const start = customStart ? Date.parse(`${customStart}T00:00:00Z`) : Number.NEGATIVE_INFINITY;
    const end = customEnd ? Date.parse(`${customEnd}T23:59:59.999Z`) : Number.POSITIVE_INFINITY;
    return timestamp >= start && timestamp <= end;
  });
  const bars: HistoryBucket[] = customRangeActive
    ? averageHistory(points, customStart, customEnd, 14, today)
    : (customActive ? customPoints : scaleHistory(points, scale)).slice(-14).map((point) => ({
      ...point,
      from: "",
      to: "",
    }));
  const runs = scaleHistory(points, "runs");
  const [exportOpen, setExportOpen] = useState(false);
  const chartRef = useRef<SVGSVGElement>(null);
  const [chartWidth, setChartWidth] = useState(720);
  const chartHeight = 260;
  const chartLeft = Math.min(78, Math.max(26, chartWidth * .1));
  const chartRight = Math.min(26, Math.max(10, chartWidth * .03));
  const chartTop = 20;
  const chartBottom = 46;
  const chartInnerWidth = chartWidth - chartLeft - chartRight;
  const chartInnerHeight = chartHeight - chartTop - chartBottom;
  const chartPoints = bars.map((point, index) => ({
    point,
    x: bars.length === 1 ? chartLeft + chartInnerWidth / 2 : chartLeft + (index / (bars.length - 1)) * chartInnerWidth,
    y: point.score === null ? null : chartTop + (1 - Math.max(0, Math.min(100, point.score)) / 100) * chartInnerHeight,
  }));
  const lineSegments: string[] = [];
  let currentSegment: string[] = [];
  for (const { x, y } of chartPoints) {
    if (y === null) {
      if (currentSegment.length > 1) lineSegments.push(currentSegment.join(" "));
      currentSegment = [];
      continue;
    }
    currentSegment.push(`${x},${y}`);
  }
  if (currentSegment.length > 1) lineSegments.push(currentSegment.join(" "));

  useEffect(() => {
    localStorage.setItem("acc-progress", scale);
  }, [scale]);

  useEffect(() => {
    const element = chartRef.current;
    if (!element) return;
    const updateWidth = () => setChartWidth(Math.max(320, Math.round(element.clientWidth)));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, [bars.length]);

  return <div className="progress">
    <div className="progress-head">
      <p className="eyebrow">{t.progress}</p>
      <div className="progress-actions">
        <div className="progress-scales" role="group" aria-label={t.progress}>
          <button type="button" className={scale === "runs" && !customActive ? "active" : ""} onClick={() => { setScale("runs"); setCustomStart(""); setCustomEnd(""); }}>{t.progressRuns}</button>
          <button type="button" className={scale === "days" && !customActive ? "active" : ""} onClick={() => { setScale("days"); setCustomStart(""); setCustomEnd(""); }}>{t.progressDays}</button>
          <button type="button" className={scale === "weeks" && !customActive ? "active" : ""} onClick={() => { setScale("weeks"); setCustomStart(""); setCustomEnd(""); }}>{t.progressWeeks}</button>
          <button type="button" className={scale === "months" && !customActive ? "active" : ""} onClick={() => { setScale("months"); setCustomStart(""); setCustomEnd(""); }}>{t.progressMonths}</button>
          <button type="button" className={customActive ? "active" : ""} onClick={() => setCustomOpen((value) => !value)}>{t.progressCustom}</button>
        </div>
        <div className="progress-exports">
          <div className="progress-export-menu">
            <button type="button" className="progress-export progress-export-toggle" aria-expanded={exportOpen} aria-haspopup="menu" onClick={() => setExportOpen((value) => !value)}>
              <ExportIcon />{t.progressExport}
            </button>
            {exportOpen && <div className="progress-export-popover" role="menu">
              <button type="button" role="menuitem" onClick={() => { downloadCoverageCsv(board, runs, lang); setExportOpen(false); }} disabled={!runs.length}><ExportIcon />{t.progressExportCsv}</button>
              <button type="button" role="menuitem" onClick={() => { downloadCoveragePage(board.title, board.key); setExportOpen(false); }}><ExportIcon report />{t.progressExportReport}</button>
            </div>}
          </div>
        </div>
      </div>
    </div>
    {customOpen && <div className="progress-custom-range">
      <label><span>{t.periodFrom}</span><input type="date" max={customEnd || today} value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label>
      <label><span>{t.periodTo}</span><input type="date" min={customStart || undefined} max={today} value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label>
      <button type="button" onClick={() => { setCustomStart(""); setCustomEnd(""); }}>{t.periodReset}</button>
    </div>}
    {bars.length ? <svg ref={chartRef} className="progress-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={t.progress}>
      <line className="chart-gridline" x1={chartLeft} x2={chartWidth - chartRight} y1={chartTop} y2={chartTop} />
      <line className="chart-gridline" x1={chartLeft} x2={chartWidth - chartRight} y1={chartTop + chartInnerHeight / 2} y2={chartTop + chartInnerHeight / 2} />
      <line className="chart-gridline" x1={chartLeft} x2={chartWidth - chartRight} y1={chartTop + chartInnerHeight} y2={chartTop + chartInnerHeight} />
      <text className="chart-axis-label" x="24" y={chartTop + 4}>100%</text>
      <text className="chart-axis-label" x="24" y={chartTop + chartInnerHeight / 2 + 4}>50%</text>
      <text className="chart-axis-label" x="24" y={chartTop + chartInnerHeight + 4}>0%</text>
      {lineSegments.map((pointsValue, index) => <polyline key={`segment-${index}`} className="chart-line" points={pointsValue} />)}
      {chartPoints.map(({ point, x, y }, index) => {
        const showLabel = true;
        const labelLines = customRangeActive ? bucketLabelLines(point, lang) : chartLabelLines({ at: point.at, score: point.score ?? 0 }, scale, lang);
        return <g key={`${point.at}-${index}`}>
          {point.score !== null && <title>{`${customRangeActive ? labelLines.join(" — ") : barLabel({ at: point.at, score: point.score }, scale, lang)} — ${parseStamp(point.at).toLocaleString(lang)}: ${Math.round(point.score)}%`}</title>}
          {point.score !== null && <circle className="chart-point" cx={x} cy={y ?? 0} r="4.5" />}
          {point.score !== null && <text className="chart-value" x={x} y={(y ?? 0) - 11} textAnchor="middle">{Math.round(point.score)}%</text>}
          {showLabel ? <text className="chart-label chart-run-label" x={x} y={chartHeight - (labelLines.length > 1 ? 26 : 14)} textAnchor="middle">
            {labelLines.map((line, lineIndex) => <tspan key={`${line}-${lineIndex}`} x={x} dy={lineIndex === 0 ? "0" : "12"}>{line}</tspan>)}
          </text> : null}
        </g>;
      })}
    </svg> : null}
    {bars.length < 2 ? <p className="progress-hint">{t.progressHint}</p> : null}
  </div>;
}

function Metric({ label, value, tone = "" }: { label: string; value: string | number; tone?: string }) {
  return <article className={`metric ${tone}`}><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong></article>;
}

function ExportIcon({ report = false }: { report?: boolean }) {
  return report
    ? <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v5h4M9 14h6M9 17h6" /></svg>
    : <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1M12 4v11m0 0-4-4m4 4 4-4" />
      </svg>;
}

function ThemeIcon({ dark = false }: { dark?: boolean }) {
  return dark
    ? <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z" /></svg>
    : <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
}

function ChangeList({
  title,
  changes,
  tone,
  empty,
  moreLabel,
  onSelect,
}: {
  title: string;
  changes: HistoryChange<OperationRow>[];
  tone: "positive" | "negative";
  empty: string;
  moreLabel: string;
  onSelect: (row: OperationRow) => void;
}) {
  return <div className={`change-list ${tone}`}>
    <h3>{title} <span>{changes.length}</span></h3>
    {changes.length ? <ul>{changes.slice(0, 6).map((change) =>
      <li key={`${change.item.verb}-${change.item.route}`}>
        <button type="button" onClick={() => onSelect(change.item)}>
          <span><Method value={change.item.verb} /> <strong>{change.item.route}</strong></span>
          <small>{change.previousScore.toFixed(0)}% → {change.item.score.toFixed(0)}%</small>
        </button>
      </li>)}
    </ul> : <p>{empty}</p>}
    {changes.length > 6 && <small className="change-more">+{changes.length - 6} {moreLabel}</small>}
  </div>;
}

function Method({ value }: { value: string }) {
  const method = methodLabel(value);
  return <span className={`method method-${method.toLowerCase()}`}>{method}</span>;
}

function sectionKey(name: string): string {
  return name || "untagged";
}

function Mark({ lang, state, caption, compact }: { lang: Lang; state: string; caption?: string; compact?: boolean }) {
  const kind = state === "seen" || state === "absent" || state === "unused" ? state : "unused";
  const glyph = kind === "seen" ? "✓" : kind === "absent" ? "✕" : "–";
  const hint = stateHint(lang, kind);
  const label = caption || stateLabel(lang, kind);
  if (compact) {
    return <span className={`mark mark-${kind} mark-compact`} data-tip={label} tabIndex={0} aria-label={label}><b>{glyph}</b></span>;
  }
  return <span className={`mark mark-${kind}`}>
    <b>{glyph} {label}</b>
    {hint ? <small>{hint}</small> : null}
  </span>;
}

function DetailPanel({ row, lang, close }: { row: OperationRow; lang: Lang; close: () => void }) {
  const t = I18N[lang];
  return <div className="scrim" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <aside className="drawer" role="dialog" aria-modal="true" aria-label={t.details}>
      <button className="icon-button" onClick={close} aria-label={t.close}>×</button>
      <p className="eyebrow">{t.details}</p>
      <h2><Method value={row.verb} /> {row.route}</h2>
      <p className="muted">{row.summary || "—"}</p>
      <Metric label={t.coverage} value={`${Math.round(row.score)}%`} />
      <div className="detail-grid">
        <section><h3>{t.request}</h3><Mark lang={lang} state={row.request} /></section>
        <section><h3>{t.query}</h3>{row.query.length ? row.query.map((item) =>
          <p className="fact-row" key={item.name}><span>{item.name}</span><Mark lang={lang} state={item.seen} compact /></p>) : <p className="muted">—</p>}</section>
      </div>
      <section><h3>{t.responses}</h3>
        <div className="response-list">{row.statuses.map((item) =>
          <div key={item.label}>
            <code>{item.label}</code>
            <span>{item.calls} {t.cases}</span>
            <span className="response-marks">
              <Mark lang={lang} state={item.seen} />
              {item.body !== "unused" && <Mark lang={lang} state={item.body} caption={t.responseBody} />}
            </span>
          </div>)}
        </div>
      </section>
    </aside>
  </div>;
}

export function App() {
  const report = useMemo(loadReport, []);
  const initialLanguage = localStorage.getItem("acc-language");
  const initialTheme = localStorage.getItem("acc-theme");
  const [lang, setLang] = useState<Lang>(initialLanguage === "ru" ? "ru" : "en");
  const [theme, setTheme] = useState<"light" | "dark">(initialTheme === "dark" ? "dark" : "light");
  const [service, setService] = useState(report.catalog[0]?.key || "");
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState("");
  const [threshold, setThreshold] = useState(80);
  const [coverageFilter, setCoverageFilter] = useState<"all" | "uncovered" | "below" | "above">("all");
  const [sortOrder, setSortOrder] = useState<"default" | "lowest" | "highest">("default");
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<OperationRow>();
  const [copied, setCopied] = useState("");
  const t = I18N[lang];
  const board = report.boards.find((item) => item.key === service) || {
    key: "", title: "", score: 0, hit_count: 0, miss_count: 0, skipped_count: 0, sections: [], operations: [],
  };
  const rows = board.operations || [];
  const active = rows.filter((item) => !item.skipped);
  const skipped = rows.filter((item) => item.skipped);
  const methods = [...new Set(active.map((item) => methodLabel(item.verb)))].sort();
  const matching = active.filter((item) => {
    const text = `${item.route} ${item.summary || ""} ${(item.tags || []).join(" ")}`.toLowerCase();
    return (!method || methodLabel(item.verb) === method) && text.includes(query.trim().toLowerCase());
  });
  const visible = matching
    .filter((item) => coverageFilter === "all"
      || (coverageFilter === "uncovered" ? item.calls === 0
        : coverageFilter === "below" ? item.score < threshold
          : item.score >= threshold))
    .sort((left, right) => {
      if (sortOrder === "lowest") return left.score - right.score;
      if (sortOrder === "highest") return right.score - left.score;
      return 0;
    });
  const groups = groupBySection(visible, board.sections || []);
  const allGroups = groupBySection(active, board.sections || []);
  const changes = compareHistory(active);
  const improved = changes.filter((change) => change.delta > 0);
  const regressed = changes.filter((change) => change.delta < 0);
  const runs = scaleHistory(board.history || [], "runs");
  const latestRun = runs[runs.length - 1];
  const previousRun = runs[runs.length - 2];
  const progressDelta = latestRun && previousRun ? latestRun.score - previousRun.score : undefined;
  const detailScore = Math.max(0, Math.min(100, Number(board.score || 0)));

  useEffect(() => {
    setOpenSections(new Set());
  }, [service]);

  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem("acc-language", lang);
  }, [lang]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("acc-theme", theme);
  }, [theme]);

  function toggleSection(name: string) {
    const key = sectionKey(name);
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function expandAll() {
    setOpenSections(new Set(allGroups.map((group) => sectionKey(group.name))));
  }

  function collapseAll() {
    setOpenSections(new Set());
  }

  async function copyRule(row: OperationRow) {
    if (!row.restore_yaml) return;
    try {
      await navigator.clipboard.writeText(row.restore_yaml);
      setCopied(row.route);
      window.setTimeout(() => setCopied(""), 1600);
    } catch {
      setCopied(`!${row.route}`);
    }
  }

  return <div className="app-shell">
    <header className="masthead">
      <div className="brand-block"><p className="eyebrow">{t.subtitle}</p><h1>{t.product}</h1>
        <p className="generated-meta">{t.generated}: <time>{report.generated_at ? new Date(report.generated_at).toLocaleString(lang) : "—"}</time></p>
      </div>
      <div className="header-controls">
        <button type="button" className="theme-toggle-button" aria-label={theme === "light" ? t.switchToDark : t.switchToLight}
          title={theme === "light" ? t.switchToDark : t.switchToLight} onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
          <ThemeIcon dark={theme === "light"} />
        </button>
        <button type="button" className="language-toggle" aria-label={t.switchLanguage} title={t.switchLanguage}
          onClick={() => setLang(lang === "ru" ? "en" : "ru")}>{lang === "ru" ? "Ru" : "En"}</button>
        <select title={report.catalog.find((item) => item.key === service)?.title || service} value={service} onChange={(event) => setService(event.target.value)}>
          {report.catalog.map((item) => <option key={item.key} value={item.key}>{item.title || item.key}</option>)}
        </select>
      </div>
    </header>

    <main>
      <section className="overview">
        <div className="overview-left">
          <div className="score">
            <div className="score-visual">
              <div className="score-ring">
                <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
                  <circle className="score-ring-track" cx="50" cy="50" r="42" pathLength="100" />
                  <circle className="score-ring-progress" cx="50" cy="50" r="42" pathLength="100"
                    strokeDasharray={`${detailScore} ${100 - detailScore}`} />
                </svg>
                <div className="score-ring-content"><strong>{detailScore.toFixed(1)}%</strong><span>{t.detailCoverage}</span></div>
              </div>
              <div className={`overview-trend ${progressDelta === undefined ? "neutral" : progressDelta > 0 ? "positive" : progressDelta < 0 ? "negative" : "stable"}`}>
                <span aria-hidden="true">{progressDelta === undefined ? "•" : progressDelta >= 0 ? "↑" : "↓"}</span>
                {progressDelta === undefined ? t.progressFirstRun : `${progressDelta > 0 ? "+" : ""}${progressDelta.toFixed(1)}% ${t.progressSinceLast}`}
              </div>
            </div>
          </div>
          <EndpointCoverage board={board} lang={lang} threshold={threshold} />
        </div>
        <ProgressChart points={board.history || []} board={board} lang={lang} />
      </section>

      <section className="workspace">
        <div className="operations panel">
          <div className="section-heading"><div><p className="eyebrow">{t.coverage}</p><h2>{t.endpoints}</h2></div>
            <span className="count">{t.shown}: {visible.length} / {t.total}: {active.length}</span></div>
          <div className="filters">
            <input type="search" value={query} placeholder={t.search} onChange={(event) => setQuery(event.target.value)} />
            <select aria-label={t.allMethods} title={method || t.allMethods} value={method} onChange={(event) => setMethod(event.target.value)}>
              <option value="">{t.allMethods}</option>{methods.map((item) => <option key={item}>{item}</option>)}
            </select>
            <select aria-label={t.coverageFilter}
              title={coverageFilter === "uncovered" ? t.coverageUncovered : coverageFilter === "below" ? `${t.coverageBelowThreshold} (${threshold}%)` : coverageFilter === "above" ? `${t.coverageAboveThreshold} (${threshold}%)` : t.coverageAll}
              value={coverageFilter} onChange={(event) => setCoverageFilter(event.target.value as typeof coverageFilter)}>
              <option value="all">{t.coverageAll}</option>
              <option value="uncovered">{t.coverageUncovered}</option>
              <option value="below">{t.coverageBelowThreshold}</option>
              <option value="above">{t.coverageAboveThreshold}</option>
            </select>
            <select aria-label={t.sortLabel}
              title={sortOrder === "lowest" ? t.sortLowest : sortOrder === "highest" ? t.sortHighest : t.sortDefault}
              value={sortOrder} onChange={(event) => setSortOrder(event.target.value as typeof sortOrder)}>
              <option value="default">{t.sortDefault}</option>
              <option value="lowest">{t.sortLowest}</option>
              <option value="highest">{t.sortHighest}</option>
            </select>
            <div className="section-actions">
              <button type="button" onClick={expandAll}>{t.expandAll}</button>
              <button type="button" onClick={collapseAll}>{t.collapseAll}</button>
            </div>
            <label className="threshold-control"><span>{t.threshold}</span><b>{threshold}%</b><input aria-label={t.threshold} type="range" min="10" max="100" step="1" value={threshold}
              onChange={(event) => setThreshold(Number(event.target.value))} /></label>
          </div>
          <div className="endpoint-list">
            {groups.map((group) => {
              const key = sectionKey(group.name);
              const open = openSections.has(key);
              const coveredCount = group.rows.filter((row) => row.calls > 0).length;
              const endpointCoverage = group.rows.length ? (coveredCount * 100) / group.rows.length : 0;
              const sectionTone = coverageTone(endpointCoverage, threshold);
              const displayName = group.description || group.name || t.untagged;
              const showSlug = Boolean(group.description && group.name && normalizeTagLabel(group.description) !== normalizeTagLabel(group.name));
              return <section className="tag-section" key={key}>
              <button type="button" className="tag-heading" aria-expanded={open} onClick={() => toggleSection(group.name)}>
                <span className="tag-copy">
                  <span className="tag-title">
                    <span className="tag-chevron" aria-hidden="true" />
                    <span className="tag-title-text">
                      <span className="tag-name" title={displayName}>{displayName}</span>
                      {showSlug ? <span className="tag-slug" title={group.name}>{group.name}</span> : null}
                    </span>
                  </span>
                </span>
                <span className={`section-score ${sectionTone}`} title={`${coveredCount} / ${group.rows.length} · ${endpointCoverage.toFixed(0)}% · ${t.threshold}: ${threshold}%`}>
                  <span className="section-score-count">{coveredCount} / {group.rows.length}</span>
                  <span className="section-score-dot" aria-hidden="true">·</span>
                  <span className="coverage-chip">{endpointCoverage.toFixed(0)}%</span>
                </span>
              </button>
              {open && group.rows.map((item) => <button className="endpoint" key={`${group.name}-${item.verb}-${item.route}`} onClick={() => setSelected(item)}>
                <Method value={item.verb} /><span className="endpoint-name"><strong>{item.route}</strong><small>{item.summary || "—"}</small></span>
                <span className={`coverage-chip ${item.score < threshold ? "attention" : ""}`}>{Math.round(item.score)}%</span>
                <span className="mini-track"><i style={{ width: `${item.score}%` }} /></span>
                <span className="case-count">{item.calls} {t.cases}</span>
              </button>)}
              </section>;
            })}
            {!visible.length && <p className="empty">{t.empty}</p>}
          </div>
        </div>
      </section>

      <section className="comparison panel">
        <div className="section-heading"><div><p className="eyebrow">{t.progress}</p><h2>{t.comparisonTitle}</h2><p className="muted comparison-hint">{t.comparisonHint}</p></div>
          <span className="count">{changes.length}</span></div>
        {changes.length ? <div className="comparison-grid">
          <ChangeList title={t.comparisonImproved} changes={improved} tone="positive" empty={t.comparisonNoChanges} moreLabel={t.comparisonMore} onSelect={setSelected} />
          <ChangeList title={t.comparisonRegressed} changes={regressed} tone="negative" empty={t.comparisonNoChanges} moreLabel={t.comparisonMore} onSelect={setSelected} />
        </div> : <p className="empty comparison-empty">{active.some((item) => item.history?.length) ? t.comparisonNoChanges : t.comparisonFirstRun}</p>}
      </section>

      {skipped.length > 0 && <section className="ignored panel">
        <div className="section-heading"><div><p className="eyebrow">{t.ignored}</p><h2>{t.ignoredTitle}</h2></div></div>
        <p className="muted">{t.restore}</p>
        <div className="ignored-grid">{skipped.map((item) => <article key={`${item.verb}-${item.route}`}>
          <h3><Method value={item.verb} /> {item.route}</h3>
          <p>{lang === "ru" ? item.skip_note_ru || item.skip_note : item.skip_note}</p>
          {item.restore_yaml && <><pre>{item.restore_yaml}</pre><button onClick={() => copyRule(item)}>
            {copied === item.route ? t.copied : copied === `!${item.route}` ? t.copyFailed : t.copyYaml}</button></>}
        </article>)}</div>
      </section>}
    </main>
    <footer className="credit">{t.createdBy}</footer>
    {selected && <DetailPanel row={selected} lang={lang} close={() => setSelected(undefined)} />}
  </div>;
}
