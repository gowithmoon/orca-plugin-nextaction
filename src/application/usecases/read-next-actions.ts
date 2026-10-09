// Use case: read the next actions (GLOSSARY: 下一步行动), for the next action
// view, highest score first (#53).
import { analyzeTaskGraph } from "../../domain/blocking/task-graph";
import { rankByScore } from "../../domain/scoring/score";
import type { Task, TaskId } from "../../domain/task/task";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { StartPreviewDaysSetting } from "../ports/start-preview-days-setting";
import type { TaskRepository } from "../ports/task-repository";

export interface ReadNextActionsOptions {
  /**
   * A task kept in the list after it stopped being a next action (the one
   * being edited, as in the inbox view), in its place by score.
   */
  readonly keep?: TaskId;
}

/** A task in the list. */
export interface NextActionItem {
  readonly task: Task;
  /** `false` only for the task kept by `keep` after it left. */
  readonly nextAction: boolean;
}

export interface NextActionsRead {
  /** Highest score first. */
  readonly items: readonly NextActionItem[];
  /** How many next actions there are; a kept task is not counted. */
  readonly total: number;
}

/** Reads the next actions. Errors are thrown as they are. */
export type ReadNextActions = (
  options?: ReadNextActionsOptions,
) => Promise<NextActionsRead>;

export function createReadNextActions(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
  startPreviewDays: StartPreviewDaysSetting;
}): ReadNextActions {
  return async (options = {}) => {
    const today = logicalDay(deps.clock.now(), deps.dayBoundary.current());
    const graph = analyzeTaskGraph(await deps.repository.readTaskGraph(), {
      today,
      previewDays: deps.startPreviewDays.current(),
    });
    const shown = [...graph.nextActions];
    // Only a task still in the snapshot: a block that is no longer a task
    // is not listed.
    const kept =
      options.keep === undefined ? undefined : graph.entry(options.keep);
    if (kept && !kept.nextAction) shown.push(kept);
    const ranked = rankByScore(shown, today);
    return {
      items: ranked.map((entry) => ({
        task: entry.task,
        nextAction: entry.nextAction,
      })),
      total: graph.nextActions.length,
    };
  };
}
