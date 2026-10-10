// Use case: read why a task is not a next action (GLOSSARY: 下一步行动), for
// the task panel's row of that name (#54, #78): the blocking the task graph
// gives (GLOSSARY: 阻塞) together with what else keeps the task out, and the
// text of every task they name, so the panel can show and link them.
import {
  analyzeTaskGraph,
  type BlockingReason,
  type TaskGraphEntry,
} from "../../domain/blocking/task-graph";
import type { CalendarDate, TaskId } from "../../domain/task/task";
import { addDays, compareDays } from "../../domain/time/calendar-days";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { StartPreviewDaysSetting } from "../ports/start-preview-days-setting";
import type { TaskRepository } from "../ports/task-repository";

/**
 * Why a task to do or in progress is not a next action (#78), one entry per
 * cause: a blocking reason from the task graph, or one of these, which are
 * not blocking (the all tasks view does not mark a task blocked for them).
 * None of these waits for a task (`waitingFor` is empty).
 *
 * - `doneAncestor`: `source` is the nearest done ancestor task.
 * - `parked` (搁置子树): `source` is the nearest ancestor task that is
 *   waiting or someday.
 * - `notStarted` (开始日期): the effective start lies beyond today plus the
 *   start preview days; `source` is the task whose start it is (the task
 *   itself or an ancestor task), `startsOn` that start.
 */
export type NotNextActionReason =
  | BlockingReason
  | (OtherReasonBase & { readonly kind: "doneAncestor" | "parked" })
  | (OtherReasonBase & {
      readonly kind: "notStarted";
      readonly startsOn: CalendarDate;
    });

interface OtherReasonBase {
  readonly source: TaskId;
  readonly waitingFor: readonly TaskId[];
}

/** The order reasons are listed in, whichever link they come from (#78). */
const reasonOrder: readonly NotNextActionReason["kind"][] = [
  "doneAncestor",
  "parked",
  "subtasks",
  "dependencies",
  "dependencyDelay",
  "sequential",
  "cycle",
  "notStarted",
];

/**
 * Why `entry` is not a next action; empty when it is one. `startsBy` is the
 * last effective start that still lets a task in: today plus the start
 * preview days, as the task graph judges it.
 */
function reasonsOf(
  entry: TaskGraphEntry,
  startsBy: CalendarDate,
): NotNextActionReason[] {
  // Any other status already says why on the task panel (#78).
  const status = entry.task.status;
  if (entry.nextAction || (status !== "todo" && status !== "doing")) return [];
  const reasons: NotNextActionReason[] = [...entry.blockedBy];
  if (entry.doneAncestor !== null) {
    reasons.push({
      kind: "doneAncestor",
      source: entry.doneAncestor,
      waitingFor: [],
    });
  }
  // A task to do or in progress does not park itself: this is an ancestor.
  if (entry.parkedBy !== null) {
    reasons.push({ kind: "parked", source: entry.parkedBy, waitingFor: [] });
  }
  if (
    entry.effectiveStart !== null &&
    entry.effectiveStartFrom !== null &&
    compareDays(entry.effectiveStart, startsBy) > 0
  ) {
    reasons.push({
      kind: "notStarted",
      source: entry.effectiveStartFrom,
      waitingFor: [],
      startsOn: entry.effectiveStart,
    });
  }
  // A stable sort: reasons of one kind keep the graph's order, nearest first.
  return reasons.sort(
    (a, b) => reasonOrder.indexOf(a.kind) - reasonOrder.indexOf(b.kind),
  );
}

/**
 * A task a reason names: the one it comes from, one it waits for, or the one
 * a dependency delay counts from.
 */
export interface RelatedTask {
  readonly id: TaskId;
  /** As the notes hold it; may be empty. */
  readonly text: string;
}

export interface BlockingReasonsRead {
  /**
   * In the order of `reasonOrder`. Empty when the task is a next action, is
   * neither to do nor in progress, or is not a task.
   */
  readonly reasons: readonly NotNextActionReason[];
  /**
   * Every task the reasons name (sources, waited-for tasks and the tasks a
   * dependency delay counts from), by ID.
   */
  readonly tasks: ReadonlyMap<TaskId, RelatedTask>;
  /**
   * The task's own dependencies (GLOSSARY: 依赖), in the order the notes
   * hold them; empty when it has none or is not a task.
   */
  readonly dependencies: readonly DependencyRead[];
}

/** One of the task's own dependencies, for the task panel's list (#57). */
export interface DependencyRead {
  readonly id: TaskId;
  /** The target task's text; `null` for a stale dependency. */
  readonly text: string | null;
  /**
   * A stale dependency (GLOSSARY: 失效依赖): its target is no longer a
   * task. It counts as met; it is cleared on the next dependency edit.
   */
  readonly stale: boolean;
}

/**
 * Reads why task `id` is not a next action. Errors are thrown as they are.
 */
export type ReadBlockingReasons = (id: TaskId) => Promise<BlockingReasonsRead>;

export function createReadBlockingReasons(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
  startPreviewDays: StartPreviewDaysSetting;
}): ReadBlockingReasons {
  return async (id) => {
    const today = logicalDay(deps.clock.now(), deps.dayBoundary.current());
    const previewDays = deps.startPreviewDays.current();
    const graph = analyzeTaskGraph(await deps.repository.readTaskGraph(), {
      today,
      previewDays,
    });
    const entry = graph.entry(id);
    const reasons = entry ? reasonsOf(entry, addDays(today, previewDays)) : [];
    const tasks = new Map<TaskId, RelatedTask>();
    for (const reason of reasons) {
      const named = [reason.source, ...reason.waitingFor];
      // A dependency delay names the dependency it counts from (#77).
      if (reason.kind === "dependencyDelay") named.push(reason.countedFrom);
      for (const related of named) {
        const entry = graph.entry(related);
        if (entry) tasks.set(related, { id: related, text: entry.task.text });
      }
    }
    // A target not among the snapshot's tasks is stale, as the task graph
    // judges it; nothing is written (ADR 0016).
    const dependencies = (graph.entry(id)?.task.dependencies ?? []).map(
      (target): DependencyRead => {
        const entry = graph.entry(target);
        return entry
          ? { id: target, text: entry.task.text, stale: false }
          : { id: target, text: null, stale: true };
      },
    );
    return { reasons, tasks, dependencies };
  };
}
