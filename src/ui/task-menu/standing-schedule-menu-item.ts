// The task menu's "Always schedule at this time" (GLOSSARY: 常设排期, #247):
// on a timeline card only, for a recurring task scheduled today, it makes
// today's times its standing schedule; "Change standing schedule to this
// time" when it has one at other times. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import { MyDayUnreadableError } from "../../application/usecases/my-day-unreadable-error";
import { StandingScheduleRefusedError } from "../../application/usecases/set-standing-schedule";
import {
  NotScheduledTodayError,
  type ReadStandingScheduleOffer,
  type SetStandingScheduleFromToday,
} from "../../application/usecases/standing-schedule-from-today";
import type { TaskId } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { formatStandingSchedule } from "../components/format";
import { createNotify, type Notify, notifyActionFailure } from "../notify";
import { taskMenuGroups } from "./builtin-items";
import type { TaskMenuItems } from "./menu-items";

/** Sets it and says how it went. Never throws. */
async function setReporting(
  setFromToday: SetStandingScheduleFromToday,
  id: TaskId,
  notify: Notify,
): Promise<void> {
  try {
    const schedule = await setFromToday(id);
    notify(
      "success",
      t("Standing schedule: ${times}", {
        times: formatStandingSchedule(schedule),
      }),
    );
  } catch (error) {
    // The notes changed since the menu was shown.
    if (error instanceof NotScheduledTodayError) {
      notify("warn", t("Not set: this task is not scheduled today."));
    } else if (
      error instanceof StandingScheduleRefusedError &&
      error.reason === "not-recurring"
    ) {
      notify("warn", t("Not set: this task does not repeat."));
    } else if (error instanceof MyDayUnreadableError) {
      notify(
        "error",
        t("Not set: this task's My Day entries cannot be read (${reason}).", {
          reason: error.reason,
        }),
      );
    } else {
      notifyActionFailure(notify, error, (reason) =>
        t("Could not set the standing schedule: ${reason}", { reason }),
      );
    }
  }
}

export function registerStandingScheduleMenuItem(
  items: TaskMenuItems,
  deps: {
    readStandingScheduleOffer: ReadStandingScheduleOffer;
    setStandingScheduleFromToday: SetStandingScheduleFromToday;
    pluginName: string;
  },
): void {
  const notify = createNotify(deps.pluginName);
  items.register({
    id: "standingSchedule",
    group: taskMenuGroups.myDay,
    order: 1,
    async resolve(task, place) {
      // "This time" is the card's: elsewhere there is none to point at.
      if (!place?.timeline) return null;
      try {
        const offer = await deps.readStandingScheduleOffer(task.id);
        if (!offer) return null;
        return {
          label: offer.replacing
            ? t("Change standing schedule to this time")
            : t("Always schedule at this time"),
          icon: "ti ti-pin",
          run: () =>
            setReporting(deps.setStandingScheduleFromToday, task.id, notify),
        };
      } catch (error) {
        notifyActionFailure(notify, error, (reason) =>
          t("Could not read the standing schedule: ${reason}", { reason }),
        );
        return null;
      }
    },
  });
}
