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
import type { StatsSelection } from "../../../domain/stats/stats-selection";
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
import { CompletionDistribution } from "./completion-distribution";
import { StatsNow, type StatsNowDeps } from "./stats-now";
import { StatsPeriodBar } from "./stats-period-bar";
import {
  cellDescription,
  cellLabel,
  chartLabel,
  emptyText,
  holdsToday,
  noCompletionText,
} from "./stats-period-text";
import type { StatsScaleStore } from "./stats-scale-store";
import {
  StatsSelectionList,
  type StatsSelectionListDeps,
} from "./stats-selection-list";
import {
  createStatsSelectionStore,
  itemSelection,
  type StatsSelectionStore,
  sameSelection,
} from "./stats-selection-store";

export interface StatsViewDeps extends StatsNowDeps, StatsSelectionListDeps {
  readStats: ReadStats;
  /** The current logical day, for the dates shown and today's cell. */
  today: () => CalendarDate;
  /** Tasks may have changed: the stats are read again. */
  changes: ChangeSignalSource;
  /** The scale chosen (#135), in the plugin instance's memory. */
  scale: StatsScaleStore;
}

/**
 * A read with the selection it was read for (#137): until the read for a
 * new selection ends, its list shows loading, not the last selection's.
 */
type StatsRead = ReadStatsResult & {
  readonly readFor: StatsSelection | undefined;
};

/** A cell's days, as its selection holds them. */
function cellDays(cell: {
  readonly first: CalendarDate;
  readonly last: CalendarDate;
}) {
  return { first: cell.first, last: cell.last };
}

function StatsContent(props: {
  query: ViewQuery<StatsRead>;
  today: CalendarDate;
  scale: StatsScaleStore;
  onPage: (anchor: CalendarDate | undefined) => void;
  selection: StatsSelectionStore;
  /** Selects, or clears the selection when it is the one selected (#137). */
  onSelect: (selection: StatsSelection) => void;
  /** Clears the selection (#137). */
  onClearSelection: () => void;
  listDeps: StatsSelectionListDeps;
}) {
  const { query, today } = props;
  const state = useViewQuery(query);
  // Followed at once, so a press shows before the list is read again.
  const selected = React.useSyncExternalStore(
    props.selection.subscribe,
    props.selection.current,
  );
  // Likewise the scale: its buttons follow a press before the read ends.
  const chosen = React.useSyncExternalStore(
    props.scale.subscribe,
    props.scale.current,
  );

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
        chosen={chosen}
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
        isSelected={(cell) =>
          sameSelection(selected, { kind: "cell", ...cellDays(cell) })
        }
        onSelect={(cell) => props.onSelect({ kind: "cell", ...cellDays(cell) })}
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
      <CompletionDistribution
        distributions={state.data.distributions}
        emptyMessage={
          empty
            ? emptyText(period.scale, paging.current)
            : totals.completions === 0
              ? noCompletionText(period.scale, paging.current)
              : null
        }
        isSelected={(item) => sameSelection(selected, itemSelection(item))}
        onSelect={(item) => props.onSelect(itemSelection(item))}
        onDimension={props.onClearSelection}
      />
      {selected !== undefined &&
      !sameSelection(selected, state.data.readFor) ? (
        <TaskListPlaceholder />
      ) : (
        <StatsSelectionList
          entries={state.data.selected}
          selected={selected !== undefined}
          today={today}
          deps={props.listDeps}
        />
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
  // What is selected below the charts (#137), while the view shows.
  const selection = createStatsSelectionStore();
  const query = createViewQuery(async (): Promise<StatsRead> => {
    const readFor = selection.current();
    const read = await deps.readStats({
      scale: deps.scale.current(),
      anchor,
      selection: readFor,
    });
    return { ...read, readFor };
  }, deps.changes);
  selection.subscribe(() => query.reload());
  // Another scale is another period: nothing in it is selected.
  deps.scale.subscribe(() => selection.clear());
  // A new scale shows its current period; the store lives as long as the
  // plugin instance.
  deps.scale.subscribe(() => {
    anchor = undefined;
    query.reload();
  });
  const page = (next: CalendarDate | undefined) => {
    anchor = next;
    // Another period: nothing in it is selected (#137).
    selection.clear();
    query.reload();
  };

  function StatsView() {
    // Every opening shows the current period of the scale chosen.
    React.useEffect(
      () => () => {
        anchor = undefined;
        selection.clear();
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
          selection={selection}
          onSelect={selection.toggle}
          onClearSelection={selection.clear}
          listDeps={deps}
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
