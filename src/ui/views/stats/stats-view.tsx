// The stats view (GLOSSARY: 统计视图, #132): this week's completions and
// skips, a bar per logical day, with the week's totals above the chart. It
// reads when the plugin panel opens and again on every task change signal
// (ADR 0007). Later issues add the scales and paging (#135), the
// distributions (#136), a selection (#137) and the header's numbers (#134).
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type {
  ReadStats,
  ReadStatsResult,
  StatsCellRead,
} from "../../../application/usecases/read-stats";
import type { CalendarDate } from "../../../domain/task/task";
import { compareDays } from "../../../domain/time/calendar-days";
import type { ChangeSignalSource } from "../../../shared/change-signal";
import { t } from "../../../shared/l10n/l10n";
import { formatDate, weekday } from "../../components/format";
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

export interface StatsViewDeps extends StatsNowDeps {
  readStats: ReadStats;
  /** The current logical day, for the dates shown and today's cell. */
  today: () => CalendarDate;
  /** Tasks may have changed: the stats are read again. */
  changes: ChangeSignalSource;
}

/** What a cell's bar reads as: its day and its counts. */
function cellDescription(cell: StatsCellRead, today: CalendarDate): string {
  return t("${date}: ${completions} completed, ${skips} skipped", {
    date: formatDate(cell.first, today),
    completions: String(cell.completions),
    skips: String(cell.skips),
  });
}

function StatsContent(props: {
  query: ViewQuery<ReadStatsResult>;
  today: CalendarDate;
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
  const { period, cells, totals } = state.data;
  const empty = totals.completions === 0 && totals.skips === 0;
  return (
    <section className="nextaction-stats-period">
      <div className="nextaction-stats-period-title">
        {t("${first} – ${last}", {
          first: formatDate(period.first, today),
          last: formatDate(period.last, today),
        })}
      </div>
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
        label={t("Completions by day")}
        cellLabel={(cell) => weekday(cell.first)}
        cellDescription={(cell) => cellDescription(cell, today)}
        isToday={(cell) => compareDays(cell.first, today) === 0}
      />
      <div className="nextaction-stats-legend" aria-hidden="true">
        <span className="nextaction-stats-legend-completions">
          {t("Completions")}
        </span>
        <span className="nextaction-stats-legend-skips">{t("Skips")}</span>
      </div>
      {empty && (
        <p className="nextaction-stats-empty" role="status">
          {t("Nothing completed or skipped this week")}
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
  // This week: the anchor is today's logical day, read at every read.
  const query = createViewQuery(
    () => deps.readStats({ scale: "week" }),
    deps.changes,
  );

  function StatsView() {
    return (
      <>
        <ViewHeader title={t("Stats")} />
        <StatsNow query={query} deps={deps} />
        <StatsContent query={query} today={deps.today()} />
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
