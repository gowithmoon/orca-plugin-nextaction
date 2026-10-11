// Shared by the use cases that write a task's completion history (GLOSSARY:
// 完成历史): completing, skipping and resuming.
import type { TaskId } from "../../domain/task/task";

/**
 * The task's completion history holds something this plugin cannot read (an
 * unknown version, or damaged), so it cannot be changed: writing would
 * overwrite it. Nothing was written.
 */
export class CompletionHistoryUnreadableError extends Error {
  override name = "CompletionHistoryUnreadableError";

  constructor(id: TaskId, reason: string) {
    super(`the completion history of task ${id} cannot be read (${reason})`);
  }
}
