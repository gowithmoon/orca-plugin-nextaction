// Use case: set, change or remove a task's recurrence rule from the
// recurrence rule popup (GLOSSARY: 重复规则). The task's dates are not
// touched: when this occurrence is done stays the user's choice.
import type { RecurrenceRule } from "../../domain/recurrence/recurrence";
import type { TaskId } from "../../domain/task/task";
import type { TaskRepository } from "../ports/task-repository";

/**
 * Writes `rule` as task `id`'s recurrence rule in one undo; `null` removes
 * it. Errors are thrown as they are, for `ui` to report.
 */
export type SetRecurrence = (
  id: TaskId,
  rule: RecurrenceRule | null,
) => Promise<void>;

export function createSetRecurrence(deps: {
  repository: TaskRepository;
}): SetRecurrence {
  return (id, rule) => deps.repository.writeRecurrence(id, rule);
}
