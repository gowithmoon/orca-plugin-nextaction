// Use case: discard a task's recurrence rule, review plan or reminders that
// this plugin cannot read (an unknown version, or damaged), at the user's
// explicit request in their popup, so they can be set afresh. The one write
// that overwrites unreadable data (docs/ARCHITECTURE.md §4).
import type { TaskId } from "../../domain/task/task";
import type { DiscardableData, TaskRepository } from "../ports/task-repository";

/**
 * Writes the empty value over task `id`'s `data` when it cannot be read, in
 * one undo; readable data, or none, is left as it is. Errors are thrown as
 * they are, for `ui` to report.
 */
export type DiscardUnreadable = (
  id: TaskId,
  data: DiscardableData,
) => Promise<void>;

export function createDiscardUnreadable(deps: {
  repository: TaskRepository;
}): DiscardUnreadable {
  return (id, data) => deps.repository.discardUnreadable(id, data);
}
