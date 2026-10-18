// Use case: write the tasks the user confirmed in the "Extract tasks"
// window (GLOSSARY: 提取任务, #204), in one undo.
import type { CalendarDate } from "../../domain/task/task";
import type { Clock } from "../ports/clock";
import type {
  NewTasksPlacement,
  TaskRepository,
} from "../ports/task-repository";

/**
 * Where the new tasks go (#201 提取任务): right after the last selected
 * block, at its level; as the last child blocks of the last selected block;
 * or at the end of today's journal.
 */
export type ExtractPlacement = "below" | "children" | "journal";

/** One task the user confirmed: its name and dates as edited. */
export interface ConfirmedExtractedTask {
  readonly title: string;
  readonly start: CalendarDate | null;
  readonly due: CalendarDate | null;
}

/** What writing did. `empty`: no name was left, nothing written. */
export type CreateExtractedTasksResult =
  | { kind: "created"; count: number }
  | { kind: "empty" };

/**
 * Creates the confirmed tasks as inbox tasks, each with its name as plain
 * text and the dates the user confirmed, in their order at `placement`
 * relative to the last of `selected` (blocks in note order), all in one
 * undo. Names are trimmed; blank ones are skipped. Fails, writing nothing,
 * when the block is gone or the write fails.
 */
export type CreateExtractedTasks = (
  selected: readonly number[],
  placement: ExtractPlacement,
  tasks: readonly ConfirmedExtractedTask[],
) => Promise<CreateExtractedTasksResult>;

export function createCreateExtractedTasks(deps: {
  repository: TaskRepository;
  clock: Clock;
}): CreateExtractedTasks {
  return async (selected, placement, tasks) => {
    const named = tasks
      .map((task) => ({ ...task, title: task.title.trim() }))
      .filter((task) => task.title !== "");
    if (named.length === 0) return { kind: "empty" };
    const last = selected.at(-1);
    let where: NewTasksPlacement;
    if (placement === "journal") {
      where = { kind: "journal", now: deps.clock.now() };
    } else {
      if (last === undefined) throw new Error("no block is selected");
      where = {
        kind: placement === "below" ? "after" : "lastChild",
        blockId: last,
      };
    }
    const ids = await deps.repository.createTasks(
      where,
      named.map((task) => ({
        text: task.title,
        status: "inbox",
        initial: {
          ...(task.start && { start: task.start }),
          ...(task.due && { due: task.due }),
        },
      })),
    );
    return { kind: "created", count: ids.length };
  };
}
