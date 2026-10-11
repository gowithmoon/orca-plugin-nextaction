// The task menu's "Mark reviewed" (GLOSSARY: 标记已回顾, #103): shown only for
// a task that can be marked (not done, with a review interval or a review-on
// day). Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type {
  CanMarkReviewed,
  MarkReviewed,
} from "../../application/usecases/mark-reviewed";
import { t } from "../../shared/l10n/l10n";
import { createNotify, notifyMarkReviewedFailure } from "../notify";
import { taskMenuGroups } from "./builtin-items";
import type { TaskMenuItems } from "./menu-items";

export function registerMarkReviewedMenuItem(
  items: TaskMenuItems,
  deps: {
    canMarkReviewed: CanMarkReviewed;
    markReviewed: MarkReviewed;
    pluginName: string;
  },
): void {
  const notify = createNotify(deps.pluginName);
  items.register({
    id: "markReviewed",
    group: taskMenuGroups.review,
    order: 0,
    label: () => t("Mark reviewed"),
    icon: "ti ti-checks",
    isShownFor: deps.canMarkReviewed,
    async run(task) {
      try {
        await deps.markReviewed(task.id);
        notify("success", t("Marked reviewed"));
      } catch (error) {
        notifyMarkReviewedFailure(notify, error);
      }
    },
  });
}
