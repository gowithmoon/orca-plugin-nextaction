// The stats view (GLOSSARY: 统计视图, #132): a period's completions and
// skips, a bar per cell, with the period's totals above the chart; the
// period switches between week, month and year and pages (#135). It
// reads when the plugin panel opens and again on every task change signal
// (ADR 0007). Later issues add the scales and paging (#135), the
// distributions (#136), a selection (#137) and the header's numbers (#134).
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  ReadStats,
  ReadStatsResult,
} from "../../../application/usecases/read-stats";
import type { CalendarDate } from "../../../domain/task/task";
import type { ChangeSignalSource } from "../../../shared/change-signal";
import { t } from "../../../shared/l10n/l10n";
import { TaskListPlaceholder } from "../../components/loading-placeholder";
import { ViewHeader } from "../../components/view-header";
import { FailedNotice, PausedNotice } from "../../components/view-notice";
import {
  createViewQuery,
  useViewQuery,
  type ViewQuery,
} from "../../hooks/use-view-query";
import type { PanelView } from "../../panel/panel-views";
import { CompletionChart } from "./completion-chart";
import { StatsNow, type StatsNowDeps } from "./stats-now";
import { StatsPeriodBar } from "./stats-period-bar";
import {
  cellDescription,
  cellLabel,
  chartLabel,
  emptyText,
  holdsToday,
} from "./stats-period-text";
import type { StatsScaleStore } from "./stats-scale-store";

export interface StatsViewDeps extends StatsNowDeps {
  readStats: ReadStats;
  /** The current logical day, for the dates shown and today's cell. */
  today: () => CalendarDate;
  /** Tasks may have changed: the stats are read again. */
  changes: ChangeSignalSource;
  /** The scale chosen (#135), in the plugin instance's memory. */
  scale: StatsScaleStore;
}

function StatsContent(props: {
  query: ViewQuery<ReadStatsResult>;
  today: CalendarDate;
  scale: StatsScaleStore;
  onPage: (anchor: CalendarDate | undefined) => void;
}) {
  const { query, today } = props;
  const state = useViewQuery(query);

  if (state.kind === "loading") return <TaskListPlaceholder />;
  if (state.kind === "paused") return <PausedNotice />;
  if (state.kind === "failed") {
    return (
      <FailedNotice
        error={state.error}
        message={(reason) =>
          t("Could not read the stats: ${reason}", { reason })
        }
        onRetry={() => query.reset()}
      />
    );
  }
  const { period, cells, totals, paging } = state.data;
  const empty = totals.completions === 0 && totals.skips === 0;
  return (
    <section className="nextaction-stats-period">
      <StatsPeriodBar
        period={period}
        paging={paging}
        today={today}
        onScale={(scale) => props.scale.set(scale)}
        onPage={props.onPage}
      />
      <ul className="nextaction-stats-totals">
        <li>
          <span className="nextaction-stats-total-count">
            {totals.completions}
          </span>
          <span className="nextaction-stats-total-label">
            {t("Completions")}
          </span>
        </li>
        <li>
          <span className="nextaction-stats-total-count">{totals.skips}</span>
          <span className="nextaction-stats-total-label">{t("Skips")}</span>
        </li>
      </ul>
      <CompletionChart
        cells={cells}
        label={chartLabel(period.scale)}
        cellLabel={(cell) => cellLabel(period.scale, cell)}
        cellDescription={(cell) => cellDescription(period.scale, cell, today)}
        isToday={(cell) => holdsToday(cell, today)}
      />
      <div className="nextaction-stats-legend" aria-hidden="true">
        <span className="nextaction-stats-legend-completions">
          {t("Completions")}
        </span>
        <span className="nextaction-stats-legend-skips">{t("Skips")}</span>
      </div>
      {empty && (
        <p className="nextaction-stats-empty" role="status">
          {emptyText(period.scale, paging.current)}
        </p>
      )}
    </section>
  );
}

/**
 * The stats view. It shows no count in the navigation. Its query starts
 * when the plugin panel opens and stops when it closes, so every opening
 * starts from what the notes hold then.
 */
export function createStatsView(deps: StatsViewDeps): PanelView {
  // The period paged to (#135), while the view shows; none is the current
  // period, its anchor today's logical day at every read.
  let anchor: CalendarDate | undefined;
  const query = createViewQuery(
    () => deps.readStats({ scale: deps.scale.current(), anchor }),
    deps.changes,
  );
  // A new scale shows its current period; the store lives as long as the
  // plugin instance.
  deps.scale.subscribe(() => {
    anchor = undefined;
    query.reload();
  });
  const page = (next: CalendarDate | undefined) => {
    anchor = next;
    query.reload();
  };

  function StatsView() {
    // Every opening shows the current period of the scale chosen.
    React.useEffect(
      () => () => {
        anchor = undefined;
      },
      [],
    );
    return (
      <>
        <ViewHeader title={t("Stats")} />
        <StatsNow query={query} deps={deps} />
        <StatsContent
          query={query}
          today={deps.today()}
          scale={deps.scale}
          onPage={page}
        />
      </>
    );
  }

  return {
    id: "stats",
    // After the review view (30).
    order: 40,
    icon: "ti ti-chart-bar",
    label: () => t("Stats"),
    component: StatsView,
  };
}
