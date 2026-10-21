import type { Project } from "../../domain/project/project";
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
import {
  readTodaysTaskGraph,
  type TaskGraphReading,
} from "./todays-task-graph";

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
   * The period's completions by their task's contexts, tags and
   * importance as they are now; skips are left out (#136).
   */
  readonly distributions: Distributions;
  /**
   * The selection's completions and skips, the latest first, a recurring
   * task once for each (#137); none without a selection.
   */
  readonly selected: readonly SelectedRead[];
}

/** A selected completion or skip, with what its task's card shows. */
export interface SelectedRead extends SelectedEntry<Task> {
  /**
   * The project its task belongs to (GLOSSARY: 所属项目), shown on its card
   * whenever it has one; `null` for none.
   */
  readonly project: Project | null;
}

/** Reads the stats. Errors are thrown as they are. */
export type ReadStats = (options: ReadStatsOptions) => Promise<ReadStatsResult>;

export function createReadStats(deps: TaskGraphReading): ReadStats {
  return async (options) => {
    const { snapshot, graph, today } = await readTodaysTaskGraph(deps);
    const { tasks } = snapshot;
    /** The entries with the project each one's task belongs to. */
    const withProjects = (
      selected: readonly SelectedEntry<Task>[],
    ): SelectedRead[] => {
      return selected.map((entry) => ({
        ...entry,
        project: graph.entry(entry.task.id)?.project ?? null,
      }));
    };
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
      now: nowCounts(snapshot, graph, today),
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
        ? withProjects(
            selectedEntries(
              tasks.map((item) => ({
                task: item.task,
                entries: countedEntries(
                  item.task,
                  item.completionHistory ?? [],
                ),
              })),
              options.selection,
              period,
            ),
          )
        : [],
    };
  };
}
