// Use case: read the stats (GLOSSARY: 统计视图, 统计周期), for the stats view:
// one read of the task graph gives the period's cells with their
// completions and skips (#132). Later issues add the other scales and
// paging (#135), the distributions (#136), a selection (#137) and the
// header's numbers (#134).
import { countedEntries } from "../../domain/stats/counted-completions";
import {
  type Distributions,
  distributions,
} from "../../domain/stats/distributions";
import { type NowCounts, nowCounts } from "../../domain/stats/now-counts";
import {
  pagedAnchor,
  type StatsPaging,
  statsPaging,
} from "../../domain/stats/stats-paging";
import {
  inCell,
  type StatsPeriod,
  type StatsScale,
  statsPeriod,
} from "../../domain/stats/stats-period";
import {
  type SelectedEntry,
  type StatsSelection,
  selectedEntries,
} from "../../domain/stats/stats-selection";
import type { CalendarDate, Task } from "../../domain/task/task";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { StartPreviewDaysSetting } from "../ports/start-preview-days-setting";
import type { TaskRepository } from "../ports/task-repository";

export interface ReadStatsOptions {
  /** How long the period is. */
  readonly scale: StatsScale;
  /**
   * A logical day within the period to read; today's logical day when
   * absent or later (no period after the current one is read).
   */
  readonly anchor?: CalendarDate;
  /** What is selected below the charts (#137); nothing when absent. */
  readonly selection?: StatsSelection;
}

/** One cell of the period with what it counts. */
export interface StatsCellRead {
  readonly first: CalendarDate;
  readonly last: CalendarDate;
  readonly completions: number;
  readonly skips: number;
}

export interface ReadStatsResult {
  readonly period: Omit<StatsPeriod, "cells">;
  /** The period's cells, the earliest first. */
  readonly cells: readonly StatsCellRead[];
  /** The completions and skips in the whole period. */
  readonly totals: { readonly completions: number; readonly skips: number };
  /** Where the period pages to (#135). */
  readonly paging: StatsPaging;
  /** The header's numbers: how things stand now, whatever the period. */
  readonly now: NowCounts;
  /**
   * The period's completions by their task's contexts, labels and
   * importance as they are now; skips are left out (#136).
   */
  readonly distributions: Distributions;
  /**
   * The selection's completions and skips, the latest first, a recurring
   * task once for each (#137); none without a selection.
   */
  readonly selected: readonly SelectedEntry<Task>[];
}

/** Reads the stats. Errors are thrown as they are. */
export type ReadStats = (options: ReadStatsOptions) => Promise<ReadStatsResult>;

export function createReadStats(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
  startPreviewDays: StartPreviewDaysSetting;
}): ReadStats {
  return async (options) => {
    const today = logicalDay(deps.clock.now(), deps.dayBoundary.current());
    const snapshot = await deps.repository.readTaskGraph();
    const { tasks } = snapshot;
    const { cells, ...period } = statsPeriod(
      options.scale,
      pagedAnchor(options.anchor, today),
    );
    const entries = tasks.flatMap((item) =>
      countedEntries(item.task, item.completionHistory ?? []),
    );
    const cellReads = cells.map((cell) => {
      const within = entries.filter((entry) => inCell(cell, entry.day));
      return {
        ...cell,
        completions: within.filter((entry) => entry.kind === "completion")
          .length,
        skips: within.filter((entry) => entry.kind === "skip").length,
      };
    });
    return {
      period,
      cells: cellReads,
      totals: {
        completions: cellReads.reduce((sum, cell) => sum + cell.completions, 0),
        skips: cellReads.reduce((sum, cell) => sum + cell.skips, 0),
      },
      paging: statsPaging(period, today),
      now: nowCounts(snapshot, {
        today,
        previewDays: deps.startPreviewDays.current(),
      }),
      distributions: distributions(
        tasks.map((item) => ({
          task: item.task,
          entries: countedEntries(
            item.task,
            item.completionHistory ?? [],
          ).filter((entry) => inCell(period, entry.day)),
        })),
      ),
      selected: options.selection
        ? selectedEntries(
            tasks.map((item) => ({
              task: item.task,
              entries: countedEntries(item.task, item.completionHistory ?? []),
            })),
            options.selection,
            period,
          )
        : [],
    };
  };
}
