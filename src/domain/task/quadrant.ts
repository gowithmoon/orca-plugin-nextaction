// The quadrants of the My Day view's quadrant layout (GLOSSARY: 四象限,
// #198): a task falls in one by its own importance and urgency, not by the
// values its score inherits up the parent chain; 5 and above is high. Pure.
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

/** Importance or urgency from this value up is high. */
const high: Rating = 5;

/** A rating as the quadrants read it: unreadable or outside 1–7 is 4. */
function readRating(value: number | null): number {
  return isRating(value) ? value : defaultRating;
}

/**
 * The quadrant a task with this importance and urgency, its own, falls in.
 * A value that is empty, not an integer or outside 1–7 reads as 4, so a task
 * never rated falls in "not important, not urgent".
 */
export function quadrantOf(ratings: {
  readonly importance: number | null;
  readonly urgency: number | null;
}): Quadrant {
  const important = readRating(ratings.importance) >= high;
  const urgent = readRating(ratings.urgency) >= high;
  if (important) return urgent ? "importantUrgent" : "importantNotUrgent";
  return urgent ? "urgentNotImportant" : "notImportantNotUrgent";
}

/** The importance and urgency a move to another quadrant writes. */
export interface QuadrantChanges {
  readonly importance?: Rating;
  readonly urgency?: Rating;
}

/** A high value lowered across the threshold becomes this. */
const low: Rating = 4;

/**
 * What moving a task with this importance and urgency, its own, to quadrant
 * `target` writes: only the value that crosses the threshold, raised to 5 or
 * lowered to 4; the one already on the target's side is left out, so a move
 * to the task's own quadrant writes nothing. Values are judged as
 * `quadrantOf` reads them: unreadable or outside 1–7 is 4.
 */
export function quadrantChanges(
  ratings: {
    readonly importance: number | null;
    readonly urgency: number | null;
  },
  target: Quadrant,
): QuadrantChanges {
  const important = readRating(ratings.importance) >= high;
  const urgent = readRating(ratings.urgency) >= high;
  const toImportant =
    target === "importantUrgent" || target === "importantNotUrgent";
  const toUrgent =
    target === "importantUrgent" || target === "urgentNotImportant";
  return {
    ...(important !== toImportant && { importance: toImportant ? high : low }),
    ...(urgent !== toUrgent && { urgency: toUrgent ? high : low }),
  };
}
