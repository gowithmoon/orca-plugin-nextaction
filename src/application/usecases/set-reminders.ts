// Use case: set, change or clear a task's reminders from the task panel
// (GLOSSARY: 提醒). A newly added moment must be later than now; reminders
// the task already had stay though they have passed.
import {
  planSetReminders,
  type Reminders,
  remindersIn,
} from "../../domain/reminder/reminder";
import type { TaskId } from "../../domain/task/task";
import type { Clock } from "../ports/clock";
import type { TaskRepository } from "../ports/task-repository";
import { RemindersUnreadableError } from "./reminders-unreadable-error";

/**
 * A newly added reminder is not later than now. Nothing was written. `past`
 * lists those moments, for the user's notice.
 */
export class PastReminderError extends Error {
  override name = "PastReminderError";

  constructor(readonly past: Reminders) {
    super("a reminder cannot be set in the past");
  }
}

/**
 * Writes `reminders` as task `id`'s reminders in one undo. Throws
 * `PastReminderError` when a newly added one is not later than now, and
 * `RemindersUnreadableError` when its reminders cannot be read, writing
 * nothing either way; other errors are thrown as they are, for `ui` to
 * report.
 */
export type SetReminders = (id: TaskId, reminders: Reminders) => Promise<void>;

export function createSetReminders(deps: {
  repository: TaskRepository;
  clock: Clock;
}): SetReminders {
  return async (id, reminders) => {
    const task = await deps.repository.getTask(id);
    const current = task?.reminders ?? { kind: "none" };
    if (current.kind === "unreadable") {
      throw new RemindersUnreadableError(current.reason);
    }
    const plan = planSetReminders(
      remindersIn(current),
      reminders,
      deps.clock.now(),
    );
    if (plan.kind === "refused") throw new PastReminderError(plan.past);
    // A block that is no longer a task fails in the write, writing nothing.
    await deps.repository.updateTask(id, { reminders: plan.reminders });
  };
}
