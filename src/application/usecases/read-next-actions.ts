// Use case: read the next actions (GLOSSARY: 下一步行动), for the next action
// view, highest score first (#53).
import { analyzeTaskGraph } from "../../domain/blocking/task-graph";
import { rankByScore } from "../../domain/scoring/score";
import type { Importance, Task, TaskId } from "../../domain/task/task";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { StartPreviewDaysSetting } from "../ports/start-preview-days-setting";
import type { TaskRepository } from "../ports/task-repository";

/**
 * What one multi-value dimension (contexts, labels) lets through: a task
 * holding any of `values`, or, with `none`, a task holding no value at all.
 */
export interface ValuesChoice {
  readonly values: readonly string[];
  readonly none: boolean;
}

/**
 * The next action view's filter (#55). Within a dimension any choice is
 * enough ("or"); every dimension given must let the task through ("and").
 */
export interface NextActionFilter {
  readonly contexts?: ValuesChoice;
  readonly labels?: ValuesChoice;
  /** The importance levels let through. */
  readonly importance?: readonly Importance[];
}

function choiceLets(
  choice: ValuesChoice | undefined,
  held: readonly string[],
): boolean {
  // Nothing chosen: the dimension does not filter.
  if (!choice || (choice.values.length === 0 && !choice.none)) return true;
  if (choice.none && held.length === 0) return true;
  return choice.values.some((value) => held.includes(value));
}

function filterLets(filter: NextActionFilter, task: Task): boolean {
  return (
    choiceLets(filter.contexts, task.contexts) &&
    choiceLets(filter.labels, task.labels) &&
    (!filter.importance ||
      filter.importance.length === 0 ||
      filter.importance.includes(task.importance))
  );
}

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
      })),
      total: graph.nextActions.length,
    };
  };
}
