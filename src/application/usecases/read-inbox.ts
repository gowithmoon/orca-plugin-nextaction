// Use case: read the inbox (GLOSSARY: 收集箱), for the inbox view.
import { analyzeTaskGraph } from "../../domain/blocking/task-graph";
import type { Project } from "../../domain/project/project";
import type { Task, TaskId } from "../../domain/task/task";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { StartPreviewDaysSetting } from "../ports/start-preview-days-setting";
import type { TaskRepository } from "../ports/task-repository";

export interface ReadInboxOptions {
  /**
   * A task kept in the list after it left the inbox (the one being edited,
   * #35 "离开收集箱"), in its place in capture order.
   */
  readonly keep?: TaskId;
}

/** A task in the inbox. */
export interface InboxItem {
  readonly task: Task;
  /**
   * The project it belongs to (GLOSSARY: 所属项目), shown on its card
   * whenever it has one; `null` for none.
   */
  readonly project: Project | null;
}

/**
 * The tasks in the inbox, in the order they were captured: the earliest
 * created first, the lower ID first when created at the same moment. Errors
 * are thrown as they are.
 */
export type ReadInbox = (options?: ReadInboxOptions) => Promise<InboxItem[]>;

function byCapture(a: InboxItem, b: InboxItem): number {
  return (
    a.task.created.getTime() - b.task.created.getTime() || a.task.id - b.task.id
  );
}

export function createReadInbox(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
  startPreviewDays: StartPreviewDaysSetting;
}): ReadInbox {
  return async (options = {}) => {
    // Every task is read and filtered here: a task whose status is empty or
    // unknown reads as inbox (inbox-anomalous-status). The graph works out
    // the project each belongs to (GLOSSARY: 所属项目).
    const snapshot = await deps.repository.readTaskGraph();
    const graph = analyzeTaskGraph(snapshot, {
      today: logicalDay(deps.clock.now(), deps.dayBoundary.current()),
      previewDays: deps.startPreviewDays.current(),
    });
    return snapshot.tasks
      .filter(({ task }) => task.status === "inbox" || task.id === options.keep)
      .map(({ task }) => ({
        task,
        project: graph.entry(task.id)?.project ?? null,
      }))
      .sort(byCapture);
  };
}
