// The stats view's header numbers (GLOSSARY: 统计视图): how things stand
// now, whatever period is being looked at (#134). Pure; `today` is the
// current logical day, computed by the caller.
import type { TaskGraph, TaskGraphSnapshot } from "../blocking/task-graph";
import { isOverdue } from "../task/overdue";
import type { CalendarDate, TaskStatus } from "../task/task";

export interface NowCounts {
  /** The next actions (GLOSSARY: 下一步行动), as the next action view counts them. */
  readonly nextActions: number;
  /** The tasks in doing (GLOSSARY: 进行中), by their status alone. */
  readonly doing: number;
  /** The tasks in waiting (GLOSSARY: 等待中), by their status alone. */
  readonly waiting: number;
  /**
   * The overdue tasks (GLOSSARY: 截止日期), as the review's overdue step
   * counts them.
   */
  readonly overdue: number;
}

/** The counts of `snapshot`, analyzed as `graph` on the logical day `today`. */
export function nowCounts(
  snapshot: TaskGraphSnapshot,
  graph: TaskGraph,
  today: CalendarDate,
): NowCounts {
  const inStatus = (status: TaskStatus) =>
    snapshot.tasks.filter((item) => item.task.status === status).length;
  return {
    nextActions: graph.nextActions.length,
    doing: inStatus("doing"),
    waiting: inStatus("waiting"),
    overdue: snapshot.tasks.filter((item) => isOverdue(item.task, today))
      .length,
  };
}
