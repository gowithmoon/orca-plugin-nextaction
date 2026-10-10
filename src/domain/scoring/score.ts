// The score (GLOSSARY: 评分) that orders next actions, from the due day, the
// effective start, importance, urgency and effort (#76, #73 "领域：评分").
// Pure; the parameters are fixed here and not offered as settings. Days are
// whole logical days.
import type { AncestorRatings, CalendarDate, Rating, Task } from "../task/task";
import { compareDays, daysBetween } from "../time/calendar-days";

/** What a task's score is computed from. */
export interface ScoreInput {
  readonly task: Pick<
    Task,
    "id" | "due" | "start" | "importance" | "urgency" | "effort"
  >;
  /** The latest start among the task and its ancestor tasks (ADR 0015). */
  readonly effectiveStart: CalendarDate | null;
  /**
   * The importance and urgency of each ancestor task, nearest first, whatever
   * its status (ADR 0019); empty for a task without one.
   */
  readonly ancestorRatings: readonly AncestorRatings[];
}

/**
 * 35 without a due day; towards 35 ahead; 100 on it; overdue d days, 100 +
 * 0.5 × d², with no cap.
 */
function dueScore(due: CalendarDate | null, today: CalendarDate): number {
  if (due === null) return 35;
  const days = daysBetween(today, due);
  if (days <= 0) return 100 + 0.5 * days ** 2;
  return 35 + 65 * Math.exp(-days / 5);
}

/**
 * Within the preview (the effective start ahead): 10 from 14 days ahead, a
 * curve up towards 100 nearer, no ageing. Once started, or without any
 * start: 100, plus one point a day since the task's own start, at most 30;
 * no ageing without an own start.
 */
function startScore(
  effectiveStart: CalendarDate | null,
  ownStart: CalendarDate | null,
  today: CalendarDate,
): number {
  const ahead =
    effectiveStart === null ? 0 : daysBetween(today, effectiveStart);
  if (ahead >= 14) return 10;
  if (ahead > 0) return 10 + 90 * (1 - ahead / 14) ** 2;
  const age = ownStart === null ? 0 : daysBetween(ownStart, today);
  return 100 + Math.min(30, Math.max(0, age));
}

/**
 * Importance or urgency 1–7 mapped linearly onto 10–90, then scaled by each
 * ancestor task's factor 1 + 0.05 × (its value − 4), held within 0–100
 * (ADR 0019).
 */
function ratingScore(rating: Rating, ancestors: readonly Rating[]): number {
  const own = 10 + ((rating - 1) / 6) * 80;
  const scaled = ancestors.reduce(
    (product, ancestor) => product * (1 + 0.05 * (ancestor - 4)),
    own,
  );
  return Math.min(100, Math.max(0, scaled));
}

/** Effort 4 is neutral; each step up or down moves the divisor by 0.05. */
function effortFactor(effort: Rating): number {
  return 1 + 0.05 * (effort - 4);
}

/**
 * The items in next-action order, highest score first. A new array; the
 * items are those given.
 */
export function rankByScore<T extends ScoreInput>(
  items: readonly T[],
  today: CalendarDate,
): T[] {
  const scored = items.map((item) => ({ item, score: score(item, today) }));
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      byDueDay(a.item.task.due, b.item.task.due) ||
      b.item.task.importance - a.item.task.importance ||
      b.item.task.urgency - a.item.task.urgency ||
      a.item.task.id - b.item.task.id,
  );
  return scored.map((entry) => entry.item);
}

/** The earlier due day first; no due day last. */
function byDueDay(a: CalendarDate | null, b: CalendarDate | null): number {
  if (a === null || b === null)
    return (a === null ? 1 : 0) - (b === null ? 1 : 0);
  return compareDays(a, b);
}

/** The task's score: higher comes first among next actions. */
export function score(input: ScoreInput, today: CalendarDate): number {
  const ancestors = input.ancestorRatings;
  return (
    (0.35 * dueScore(input.task.due, today) +
      0.2 * startScore(input.effectiveStart, input.task.start, today) +
      0.25 *
        ratingScore(
          input.task.importance,
          ancestors.map((ancestor) => ancestor.importance),
        ) +
      0.2 *
        ratingScore(
          input.task.urgency,
          ancestors.map((ancestor) => ancestor.urgency),
        )) /
    effortFactor(input.task.effort)
  );
}
