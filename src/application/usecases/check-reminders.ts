// Use case: check reminders (GLOSSARY: 提醒, 错过的提醒). Every reminder due
// since the last check is notified, one notice each; missed reminders and
// those on time come this one way.
import { dueReminders, nextWakeUp } from "../../domain/reminder/reminder";
import type { Clock } from "../ports/clock";
import type { ReminderCheckpointStore } from "../ports/reminder-checkpoint";
import type { ReminderNotifier } from "../ports/reminder-notifier";
import type { TaskRepository } from "../ports/task-repository";

/**
 * Notifies every reminder due after the checkpoint up to now, in order of
 * moment, records now as the checkpoint, and returns when reminders next need
 * checking (`null` when none is to come). Without a checkpoint it starts from
 * now and catches nothing up. Errors are thrown as they are; a failed check
 * moves no checkpoint, so the next one tries again.
 */
export type CheckReminders = () => Promise<Date | null>;

export function createCheckReminders(deps: {
  repository: TaskRepository;
  clock: Clock;
  checkpoint: ReminderCheckpointStore;
  notifier: ReminderNotifier;
}): CheckReminders {
  return async () => {
    const now = deps.clock.now();
    // No checkpoint (lost, or never kept): nothing before now is caught up.
    const since = (await deps.checkpoint.read()) ?? now;
    // One read: done tasks are read too, and skipped by the domain.
    const tasks = await deps.repository.queryTasks({});
    const text = new Map(tasks.map((task) => [task.id, task.text]));
    for (const due of dueReminders(tasks, since, now)) {
      deps.notifier.notify({
        taskId: due.taskId,
        text: text.get(due.taskId) ?? "",
      });
    }
    await deps.checkpoint.write(now);
    return nextWakeUp(tasks, now);
  };
}
