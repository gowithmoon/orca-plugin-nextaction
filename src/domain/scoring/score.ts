// The score (GLOSSARY: 评分) that orders next actions, from the due day, the
// effective start, importance and effort (#51 "领域：评分"). Pure; the
// parameters are fixed here and not offered as settings. Days are whole
// logical days.
import type { CalendarDate, Rating, Task } from "../task/task";
import { compareDays, daysBetween } from "../time/calendar-days";

/** What a task's score is computed from. */
export interface ScoreInput {
  readonly task: Pick<Task, "id" | "due" | "importance" | "effort">;
  /** The latest start among the task and its ancestor tasks (ADR 0015). */
  readonly effectiveStart: CalendarDate | null;
}

/** 35 without a due day; 100 on it, up to 20 more overdue; towards 35 ahead. */
function dueScore(due: CalendarDate | null, today: CalendarDate): number {
  if (due === null) return 35;
  const days = daysBetween(today, due);
  if (days <= 0) return 100 + Math.min(20, Math.abs(days) * 0.5);
  return 35 + 65 * Math.exp(-days / 5);
}

/** 100 once started (or without a start); 10 from 14 days ahead; a curve between. */
function startScore(start: CalendarDate | null, today: CalendarDate): number {
  if (start === null) return 100;
  const days = daysBetween(today, start);
  if (days <= 0) return 100;
  if (days >= 14) return 10;
  return 10 + 90 * (1 - days / 14) ** 2;
}

/** Importance 1–7 mapped linearly onto 10–90. */
function importanceScore(importance: Rating): number {
  return 10 + ((importance - 1) / 6) * 80;
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
  return (
    (0.45 * dueScore(input.task.due, today) +
      0.25 * startScore(input.effectiveStart, today) +
      0.3 * importanceScore(input.task.importance)) /
    effortFactor(input.task.effort)
  );
}
