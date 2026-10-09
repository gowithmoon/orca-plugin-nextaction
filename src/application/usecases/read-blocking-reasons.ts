// Use case: read why a task is blocked (GLOSSARY: 阻塞), for the task panel's
// blocking reasons row (#54): the reasons the task graph gives, and the text
// of every task they name, so the panel can show and link them.
import {
  analyzeTaskGraph,
  type BlockingReason,
} from "../../domain/blocking/task-graph";
import type { TaskId } from "../../domain/task/task";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { TaskRepository } from "../ports/task-repository";

/** A task a reason names: the one it comes from, or one it waits for. */
export interface RelatedTask {
  readonly id: TaskId;
  /** As the notes hold it; may be empty. */
  readonly text: string;
}

export interface BlockingReasonsRead {
  /** Empty when nothing blocks the task, or it is not a task. */
  readonly reasons: readonly BlockingReason[];
  /** Every task the reasons name (sources and waited-for tasks), by ID. */
  readonly tasks: ReadonlyMap<TaskId, RelatedTask>;
}

/** Reads why task `id` is blocked. Errors are thrown as they are. */
export type ReadBlockingReasons = (id: TaskId) => Promise<BlockingReasonsRead>;

export function createReadBlockingReasons(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
}): ReadBlockingReasons {
  return async (id) => {
    const graph = analyzeTaskGraph(await deps.repository.readTaskGraph(), {
      today: logicalDay(deps.clock.now(), deps.dayBoundary.current()),
      // Starts do not block, so how far ahead they are let in is irrelevant.
      previewDays: 0,
    });
    const reasons = graph.entry(id)?.blockedBy ?? [];
    const tasks = new Map<TaskId, RelatedTask>();
    for (const reason of reasons) {
      for (const related of [reason.source, ...reason.waitingFor]) {
        const entry = graph.entry(related);
        if (entry) tasks.set(related, { id: related, text: entry.task.text });
      }
    }
    return { reasons, tasks };
  };
}
