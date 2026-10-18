// The quadrants of the My Day view's Eisenhower Matrix layout (GLOSSARY:
// 四象限, 象限, #198): a task falls in one by its own importance and urgency,
// not by the values its score inherits up the parent chain; 5 and above is
// high. Pure.
import { defaultRating, isRating, type Rating } from "./task";

/**
 * The four quadrants in the order the layout lays them out: top left, top
 * right, bottom left, bottom right; and, narrow, from top to bottom.
 */
export const quadrants = [
  "importantUrgent",
  "importantNotUrgent",
  "urgentNotImportant",
  "notImportantNotUrgent",
] as const;
export type Quadrant = (typeof quadrants)[number];

/**
 * A task's own importance and urgency as the quadrants read them: either may
 * be empty or unreadable.
 */
export interface QuadrantRatings {
  readonly importance: number | null;
  readonly urgency: number | null;
}

/** Which side of the threshold each quadrant holds importance and urgency on. */
const quadrantSides: Record<
  Quadrant,
  { readonly important: boolean; readonly urgent: boolean }
> = {
  importantUrgent: { important: true, urgent: true },
  importantNotUrgent: { important: true, urgent: false },
  urgentNotImportant: { important: false, urgent: true },
  notImportantNotUrgent: { important: false, urgent: false },
};

/** Importance or urgency from this value up is high. */
const high: Rating = 5;
/** A high value lowered across the threshold becomes this. */
const low: Rating = 4;

/**
 * Whether an importance or urgency is high. A value that is empty, not an
 * integer or outside 1–7 reads as 4: low.
 */
function isHigh(value: number | null): boolean {
  return (isRating(value) ? value : defaultRating) >= high;
}

/**
 * The quadrant a task with this importance and urgency, its own, falls in.
 * A value that is empty, not an integer or outside 1–7 reads as 4, so a task
 * never rated falls in "not important, not urgent".
 */
export function quadrantOf(ratings: QuadrantRatings): Quadrant {
  const important = isHigh(ratings.importance);
  const urgent = isHigh(ratings.urgency);
  return (
    quadrants.find(
      (quadrant) =>
        quadrantSides[quadrant].important === important &&
        quadrantSides[quadrant].urgent === urgent,
    ) ?? "notImportantNotUrgent"
  );
}

/** The importance and urgency a move to another quadrant writes. */
export interface QuadrantChanges {
  readonly importance?: Rating;
  readonly urgency?: Rating;
}

/**
 * What moving a task with this importance and urgency, its own, to quadrant
 * `target` writes: only the value that crosses the threshold, raised to 5 or
 * lowered to 4; the one already on the target's side is left out, so a move
 * to the task's own quadrant writes nothing. Values are judged as
 * `quadrantOf` reads them: unreadable or outside 1–7 is 4.
 */
export function quadrantChanges(
  ratings: QuadrantRatings,
  target: Quadrant,
): QuadrantChanges {
  const { important, urgent } = quadrantSides[target];
  return {
    ...(isHigh(ratings.importance) !== important && {
      importance: important ? high : low,
    }),
    ...(isHigh(ratings.urgency) !== urgent && {
      urgency: urgent ? high : low,
    }),
  };
}
