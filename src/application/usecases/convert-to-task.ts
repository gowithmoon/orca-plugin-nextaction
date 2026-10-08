// Use case: convert a block to a task (GLOSSARY: 转为任务).
import type {
  ConvertToTaskResult,
  TaskRepository,
} from "../ports/task-repository";

/**
 * Converts the block `id` into an inbox task and returns what happened: it
 * was converted, it already was a task (nothing written), or it cannot be
 * converted (nothing written, with the reason). Errors are thrown as they
 * are, for `ui` to report.
 */
export type ConvertToTask = (id: number) => Promise<ConvertToTaskResult>;

export function createConvertToTask(deps: {
  repository: TaskRepository;
}): ConvertToTask {
  return (id) => deps.repository.convertToTask(id);
}
