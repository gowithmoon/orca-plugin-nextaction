// ReminderNotifier as the renderer's web `Notification` (ADR 0022). It needs
// no permission request in Orca; a click on a notice still on screen fires
// `onclick`, one in the system notification centre does not, and then
// nothing happens (docs/spikes/native-reminder.md, step 10 spikes 2–5).
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type { ReminderNotifier } from "../../application/ports/reminder-notifier";
import type { TaskId } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";

/**
 * Notices titled "Orca Note task reminder", the task's name as the body. On
 * a click, Orca is brought to the front when it lacks focus
 * (`core.global.toggleWindow` would hide it otherwise, untested), then
 * `locate` shows the task's block.
 */
export function createWebReminderNotifier(
  locate: (taskId: TaskId) => void,
): ReminderNotifier {
  return {
    notify({ taskId, text }) {
      let notice: Notification;
      try {
        notice = new Notification(t("Orca Note task reminder"), {
          body: text,
        });
      } catch (error) {
        // The port does not throw: the other notices still go out, and the
        // checkpoint still moves, so this one is not shown twice.
        console.error("[nextaction] could not show a reminder", error);
        return;
      }
      notice.onclick = () => {
        void (async () => {
          try {
            if (!document.hasFocus()) {
              await orca.commands.invokeCommand("core.global.toggleWindow");
            }
            locate(taskId);
          } catch (error) {
            // A click has no ui to tell; the user still has the task.
            console.error(
              "[nextaction] could not open the reminded task",
              error,
            );
          }
        })();
      };
    },
  };
}
