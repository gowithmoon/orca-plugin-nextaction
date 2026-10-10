// The task menu's My Day toggle (#82): "Add to My Day" while the task is not in
// today's My Day, "Remove from My Day" while it is. Any task can be added,
// done ones and ones that are not next actions too, without a word. Verified
// by hand in Orca (docs/ARCHITECTURE.md §5).
import type {
  AddToMyDay,
  MyDayChangeResult,
} from "../../application/usecases/add-to-my-day";
import { MyDayUnreadableError } from "../../application/usecases/my-day-unreadable-error";
import type { ReadMyDayStatus } from "../../application/usecases/read-my-day-status";
import type { RemoveFromMyDay } from "../../application/usecases/remove-from-my-day";
import type { TaskId } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { createNotify, type Notify, notifyActionFailure } from "../notify";
import { taskMenuGroups } from "./builtin-items";
import type { TaskMenuItems } from "./menu-items";

/** Changes the task's My Day and says how it went. Never throws. */
async function changeReporting(
  change: (id: TaskId) => Promise<MyDayChangeResult>,
  id: TaskId,
  notify: Notify,
  done: string,
): Promise<void> {
  try {
    // Unchanged (it already stood so, e.g. changed in another menu) says the
    // same: the task is where the user wanted it.
    await change(id);
    notify("success", done);
  } catch (error) {
    if (error instanceof MyDayUnreadableError) {
      notify(
        "error",
        t(
          "Could not change My Day: this task's My Day entries cannot be read and are kept as they are.",
        ),
      );
      return;
    }
    notifyActionFailure(notify, error, (reason) =>
      t("Could not change My Day: ${reason}", { reason }),
    );
  }
}

export function registerMyDayMenuItem(
  items: TaskMenuItems,
  deps: {
    readMyDayStatus: ReadMyDayStatus;
    addToMyDay: AddToMyDay;
    removeFromMyDay: RemoveFromMyDay;
    pluginName: string;
  },
): void {
  const notify = createNotify(deps.pluginName);
  const add = (id: TaskId) =>
    changeReporting(deps.addToMyDay, id, notify, t("Added to My Day"));
  const remove = (id: TaskId) =>
    changeReporting(deps.removeFromMyDay, id, notify, t("Removed from My Day"));

  items.register({
    id: "myDay",
    group: taskMenuGroups.myDay,
    order: 0,
    async resolve(task) {
      try {
        const status = await deps.readMyDayStatus(task.id);
        if (status.kind === "in-today") {
          return {
            label: t("Remove from My Day"),
            icon: "ti ti-sun-off",
            run: () => remove(task.id),
          };
        }
        // Unreadable entries show "Add": choosing it says why nothing changes.
        return {
          label: t("Add to My Day"),
          icon: "ti ti-sun",
          run: () => add(task.id),
        };
      } catch (error) {
        notifyActionFailure(notify, error, (reason) =>
          t("Could not read My Day: ${reason}", { reason }),
        );
        return null;
      }
    },
  });
}
