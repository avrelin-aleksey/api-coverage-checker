import React from "react";
import { ApiBoard } from "./components/ApiBoard";
import { FilterBar } from "./components/FilterBar";
import { OperationsTable } from "./components/OperationsTable";
import { ScoreChart } from "./components/ScoreChart";
import { useFilter } from "./hooks/useFilter";
import { useReport } from "./hooks/useReport";
import { I18N } from "./i18n";
import type { HistoryPoint } from "./types";

/** Created by Avrelin Aleksei. Copyright 2026 Avrelin Aleksei. */

export function App() {
  const {
    report,
    activeBoard,
    setActiveKey,
    lang,
    toggleLang,
    theme,
    toggleTheme,
  } = useReport();

  const operations = activeBoard?.operations || [];
  const sections = activeBoard?.sections || [];
  const points: HistoryPoint[] = activeBoard?.history || [];

  const {
    search,
    setSearch,
    method,
    setMethod,
    status,
    setStatus,
    selectedTag,
    setSelectedTag,
    availableTags,
    filteredOperations,
  } = useFilter(operations);

  if (!activeBoard) {
    return (
      <div className="empty-app">
        <p>No API report data loaded.</p>
      </div>
    );
  }

  const t = I18N[lang];

  return (
    <div className="app-shell">
      <ApiBoard
        report={report}
        activeBoard={activeBoard}
        onSelectApi={setActiveKey}
        lang={lang}
        points={points}
      />

      <main>
        <div className="overview">
          <div className="overview-left">
            <div className="score">
              <div className="score-visual">
                <div className="score-ring">
                  <svg viewBox="0 0 100 100">
                    <circle className="score-ring-track" cx="50" cy="50" r="40" />
                    <circle
                      className="score-ring-progress"
                      cx="50"
                      cy="50"
                      r="40"
                      strokeDasharray={`${(activeBoard.score * 251.2) / 100} 251.2`}
                    />
                  </svg>
                  <div className="score-ring-content">
                    <strong>{activeBoard.score.toFixed(0)}%</strong>
                    <span>{t.overallScore || "Coverage"}</span>
                  </div>
                </div>
                <div className="score-count">
                  <strong>
                    {activeBoard.hit_count} / {operations.length}
                  </strong>
                  <small>{t.endpointCoverage || "Endpoints Hit"}</small>
                </div>
              </div>
            </div>

            <div className="metrics">
              <div className="metric-line">
                🟢 {t.covered}: {activeBoard.hit_count}
              </div>
              <div className="metric-line">
                🟡 {t.ignored}: {activeBoard.skipped_count}
              </div>
              <div className="metric-line">
                🔴 {t.uncovered}: {activeBoard.miss_count}
              </div>
            </div>
          </div>

          <ScoreChart points={points} board={activeBoard} lang={lang} />
        </div>

        <FilterBar
          search={search}
          onSearchChange={setSearch}
          method={method}
          onMethodChange={setMethod}
          status={status}
          onStatusChange={setStatus}
          selectedTag={selectedTag}
          onTagChange={setSelectedTag}
          availableTags={availableTags}
          lang={lang}
          theme={theme}
          onToggleTheme={toggleTheme}
          onToggleLang={toggleLang}
        />

        <OperationsTable rows={filteredOperations} sections={sections} lang={lang} />
      </main>

      <footer className="credit">
        <p>API Coverage Checker — Created by Avrelin Aleksei. Copyright 2026 Avrelin Aleksei.</p>
      </footer>
    </div>
  );
}

export default App;
