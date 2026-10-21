import type { Project } from "../../domain/project/project";
import type { Task, TaskId } from "../../domain/task/task";
import {
  readTodaysTaskGraph,
  type TaskGraphReading,
} from "./todays-task-graph";

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

export function createReadInbox(deps: TaskGraphReading): ReadInbox {
  return async (options = {}) => {
    // Every task is read and filtered here: a task whose status is empty or
    // unknown reads as inbox (inbox-anomalous-status). The graph works out
    // the project each belongs to (GLOSSARY: 所属项目).
    const { snapshot, graph } = await readTodaysTaskGraph(deps);
    return snapshot.tasks
      .filter(({ task }) => task.status === "inbox" || task.id === options.keep)
      .map(({ task }) => ({
        task,
        project: graph.entry(task.id)?.project ?? null,
      }))
      .sort(byCapture);
  };
}
