// The task menu's "Skip this occurrence" (#91): shown only for a recurring
// task that can be skipped (its rule not paused, not done, not on its last
// occurrence), right after the status group. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import {
  type CanSkipOccurrence,
  NotSkippableError,
  type NotSkippableReason,
  type SkipOccurrence,
} from "../../application/usecases/skip-occurrence";
import { t } from "../../shared/l10n/l10n";
import { formatDate } from "../components/format";
import { createNotify, notifyAdvanceFailure } from "../notify";
import { taskMenuGroups } from "./builtin-items";
import type { TaskMenuItems } from "./menu-items";

/** Why skipping was refused: the notes changed since the menu was shown. */
function refusedText(reason: NotSkippableReason): string {
  switch (reason) {
    case "not-recurring":
      return t("Not skipped: this task does not repeat.");
    case "paused":
      return t("Not skipped: its recurrence is paused.");
    case "done":
      return t("Not skipped: the task is done.");
    case "last":
      return t(
        "Not skipped: this is the last time. To stop repeating, remove the rule.",
      );
  }
}

export function registerSkipMenuItem(
  items: TaskMenuItems,
  deps: {
    canSkipOccurrence: CanSkipOccurrence;
    skipOccurrence: SkipOccurrence;
    pluginName: string;
  },
): void {
  const notify = createNotify(deps.pluginName);
  items.register({
    id: "skipOccurrence",
    group: taskMenuGroups.skip,
    order: 0,
    label: () => t("Skip this time"),
    icon: "ti ti-player-skip-forward",
    isShownFor: deps.canSkipOccurrence,
    async run(task) {
      try {
        const result = await deps.skipOccurrence(task.id);
        // The status icon shows todo either way: say where it went.
        notify(
          "success",
          t("Skipped, next: ${date}", {
            date: formatDate(result.next, result.skippedOn),
          }),
        );
      } catch (error) {
        if (error instanceof NotSkippableError) {
          notify("warn", refusedText(error.reason));
          return;
        }
        notifyAdvanceFailure(notify, error, {
          recurrenceUnreadable: (reason) =>
            t(
              "Could not skip: its recurrence rule cannot be read (${reason}) and is kept as it is.",
              { reason },
            ),
          historyUnreadable: () =>
            t(
              "Could not skip: its completion history cannot be read and is kept as it is.",
            ),
          failed: (reason) => t("Could not skip: ${reason}", { reason }),
        });
      }
    },
  });
}
