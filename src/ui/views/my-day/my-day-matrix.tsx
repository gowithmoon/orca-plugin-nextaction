// The My Day view's Eisenhower Matrix layout (GLOSSARY: 四象限, 象限, #198):
// all of today's tasks in their quadrants, by their own importance and
// urgency, by score within each, done and skipped ones last and faded.
// Every quadrant shows its title, empty or not, and takes a card dragged
// from another (#199). No schedules and no schedule button. Verified by hand
// in Orca (docs/ARCHITECTURE.md §5).
import type * as React from "react";
import type { MyDayItem } from "../../../application/usecases/read-my-day";
import {
  type Quadrant,
  quadrantOf,
  quadrants,
} from "../../../domain/task/quadrant";
import { t } from "../../../shared/l10n/l10n";
import { quadrantAttribute } from "./quadrant-drag";

/** Each quadrant's title. */
const quadrantTitles: Record<Quadrant, () => string> = {
  importantUrgent: () => t("Important and urgent"),
  importantNotUrgent: () => t("Important, not urgent"),
  urgentNotImportant: () => t("Urgent, not important"),
  notImportantNotUrgent: () => t("Not important, not urgent"),
};

/**
 * Today's tasks by quadrant, each keeping the order of `items`: by score,
 * done and skipped ones last.
 */
function byQuadrant(
  items: readonly MyDayItem[],
): Record<Quadrant, MyDayItem[]> {
  const grouped: Record<Quadrant, MyDayItem[]> = {
    importantUrgent: [],
    importantNotUrgent: [],
    urgentNotImportant: [],
    notImportantNotUrgent: [],
  };
  for (const item of items) grouped[quadrantOf(item.task)].push(item);
  return grouped;
}

/**
 * The four quadrants of `items`, two by two or one above the other by the
 * view's width (my-day-style.ts); `cards` draws each quadrant's cards. The
 * quadrant drag (quadrant-drag.ts) finds the quadrants within `root`.
 */
export function MyDayMatrix(props: {
  items: readonly MyDayItem[];
  cards: (items: readonly MyDayItem[]) => React.ReactNode;
  root: React.RefObject<HTMLDivElement>;
}) {
  const { items, cards, root } = props;
  const grouped = byQuadrant(items);
  return (
    <div className="nextaction-my-day-matrix" ref={root}>
      {quadrants.map((quadrant) => (
        <section
          key={quadrant}
          className="nextaction-my-day-quadrant"
          aria-label={quadrantTitles[quadrant]()}
          {...{ [quadrantAttribute]: quadrant }}
        >
          <div className="nextaction-my-day-section-header">
            <h3 className="nextaction-my-day-section-title">
              {quadrantTitles[quadrant]()}
            </h3>
          </div>
          <div className="nextaction-my-day-section-body">
            {cards(grouped[quadrant])}
          </div>
        </section>
      ))}
    </div>
  );
}
