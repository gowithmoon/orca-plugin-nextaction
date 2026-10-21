import type { Project } from "../../domain/project/project";
import { rankByScore } from "../../domain/scoring/score";
import type { Task, TaskId } from "../../domain/task/task";
import { filterLets, type TaskFilter } from "../../domain/task/task-filter";
import {
  readTodaysTaskGraph,
  type TaskGraphReading,
} from "./todays-task-graph";

/** The next action view's filter (#55); the rules are shared (task-filter). */
export type NextActionFilter = TaskFilter;

export interface ReadNextActionsOptions {
  /**
   * A task kept in the list after it stopped being a next action (the one
   * being edited, as in the inbox view), in its place by score.
   */
  readonly keep?: TaskId;
  /** Only the next actions it lets through are listed; none: every one. */
  readonly filter?: NextActionFilter;
}

/** A task in the list. */
export interface NextActionItem {
  readonly task: Task;
  /** `false` only for the task kept by `keep` after it left. */
  readonly nextAction: boolean;
  /**
   * Listed only because of `keep`: it is no longer a next action, or the
   * filter no longer lets it through.
   */
  readonly kept: boolean;
  /**
   * The text of its parent task (GLOSSARY: 父任务), as the notes hold it;
   * `null` when it has none.
   */
  readonly parentText: string | null;
  /**
   * The project it belongs to (GLOSSARY: 所属项目), shown on its card
   * whenever it has one: the list does not say it; `null` for none.
   */
  readonly project: Project | null;
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

export function createReadNextActions(deps: TaskGraphReading): ReadNextActions {
  return async (options = {}) => {
    const { graph, today } = await readTodaysTaskGraph(deps);
    const filter = options.filter ?? {};
    const shown = graph.nextActions.filter((entry) =>
      filterLets(filter, entry.task),
    );
    // Only a task still in the snapshot: a block that is no longer a task
    // is not listed.
    const kept =
      options.keep === undefined ? undefined : graph.entry(options.keep);
    const keptAlone = kept !== undefined && !shown.includes(kept);
    if (kept && keptAlone) shown.push(kept);
    const ranked = rankByScore(shown, today);
    return {
      items: ranked.map((entry) => ({
        task: entry.task,
        nextAction: entry.nextAction,
        kept: keptAlone && entry === kept,
        parentText:
          entry.parentId === null
            ? null
            : (graph.entry(entry.parentId)?.task.text ?? null),
        project: entry.project,
      })),
      total: graph.nextActions.length,
    };
  };
}
