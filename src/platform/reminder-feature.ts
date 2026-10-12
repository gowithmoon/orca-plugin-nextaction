// Reminder timing (#108, ADR 0022): checks reminders once the plugin has
// loaded (catching up missed ones), then sets one `setTimeout` for the next
// wake-up, never a `setInterval` (throttled while hidden, step 10 spike 2).
// Orca behaviour, verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type { TaskRepository } from "../application/ports/task-repository";
import type { TaskTagNamesSource } from "../application/ports/task-tag-names";
import { createCheckReminders } from "../application/usecases/check-reminders";
import type { TaskId } from "../domain/task/task";
import { createPluginDataReminderCheckpoint } from "../infra/orca/reminder-checkpoint-store";
import { createWebReminderNotifier } from "../infra/orca/web-reminder-notifier";
import { systemClock } from "../infra/system-clock";
import type { ChangeSignalSource } from "../shared/change-signal";
import type { FeatureModule } from "./bootstrap";

/**
 * The longest wait between checks: it catches edits the hooks never hear
 * (sync, ADR 0007), and stays far below `setTimeout`'s limit.
 */
const maxWaitMs = 60 * 60 * 1000;

export function createReminderFeature(deps: {
  repository: TaskRepository;
  /** The task change signal (ADR 0007): a check runs on every signal. */
  changes: ChangeSignalSource;
  /** `current()` is `undefined` while task features are paused. */
  names: TaskTagNamesSource;
  /** Shows the task's block in the notes, as "open in notes" does. */
  openInNotes: (taskId: TaskId) => void;
}): FeatureModule {
  return (context) => {
    const { pluginName, registry } = context;
    let loaded = true;
    const checkReminders = createCheckReminders({
      repository: deps.repository,
      clock: systemClock,
      checkpoint: createPluginDataReminderCheckpoint(() =>
        loaded ? pluginName : undefined,
      ),
      notifier: createWebReminderNotifier(deps.openInNotes),
    });

    let cancelTimer: (() => void) | undefined;
    let running = false;
    /** A check was asked for while one ran: run again once it is done. */
    let again = false;
    const stopped = () => !loaded || context.releasing();

    const wait = (next: Date | null) => {
      cancelTimer?.();
      const untilNext =
        next === null
          ? maxWaitMs
          : next.getTime() - systemClock.now().getTime();
      cancelTimer = registry.timeout(
        () => {
          cancelTimer = undefined;
          void check();
        },
        Math.max(0, Math.min(untilNext, maxWaitMs)),
      );
    };

    /** One check at a time; a failure is logged and the next one retries. */
    const check = async () => {
      if (running) {
        again = true;
        return;
      }
      running = true;
      let next: Date | null = null;
      try {
        // Paused task features: no check, only the longest wait.
        if (deps.names.current() !== undefined) next = await checkReminders();
      } catch (error) {
        console.error(`[${pluginName}] could not check reminders`, error);
      } finally {
        running = false;
      }
      if (stopped()) return;
      if (again) {
        again = false;
        void check();
        return;
      }
      wait(next);
    };

    // Released before the timer it may still be about to set.
    registry.add(`${pluginName}.reminders`, () => {
      loaded = false;
      cancelTimer?.();
    });
    const unsubscribeChanges = deps.changes.subscribe(() => void check());
    registry.add(`${pluginName}.reminderChanges`, unsubscribeChanges);
    // Task features ready again (e.g. after a new task tag name).
    const unsubscribeNames = deps.names.subscribe(() => void check());
    registry.add(`${pluginName}.reminderReadiness`, unsubscribeNames);
    void check();
  };
}
