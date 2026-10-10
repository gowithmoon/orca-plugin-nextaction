// The timeline's geometry (GLOSSARY: 时间轴, #84): moments and pixels along
// today's range, from the day boundary to the next one. Layout only, pure,
// shared with dragging (#85), which turns a pointer's pixel back into a
// moment and leaves the snapping to the domain (`normalizeSchedule`). Not
// test-driven (#81 Testing Decisions); verified by hand in Orca.
import type { LogicalDayRange } from "../../../domain/time/logical-day";

/** Pixels per hour; no zoom (#81). */
export const hourHeightPx = 48;

const minuteMs = 60_000;
const hourMs = 60 * minuteMs;
const pxPerMs = hourHeightPx / hourMs;

/** The timeline's full height: the whole logical day (23 or 25 hours across a clock change). */
export function timelineHeight(range: LogicalDayRange): number {
  return (range.end.getTime() - range.start.getTime()) * pxPerMs;
}

/** Where `at` lies, in pixels from the top of the timeline. */
export function yAt(range: LogicalDayRange, at: Date): number {
  return (at.getTime() - range.start.getTime()) * pxPerMs;
}

/**
 * The moment at `y` pixels from the top, kept within the range; not snapped
 * (the domain snaps when scheduling).
 */
export function momentAtY(range: LogicalDayRange, y: number): Date {
  const at = range.start.getTime() + y / pxPerMs;
  return new Date(
    Math.min(Math.max(at, range.start.getTime()), range.end.getTime()),
  );
}

/** A schedule's box along the timeline, in pixels. */
export function scheduleBox(
  range: LogicalDayRange,
  schedule: { readonly start: Date; readonly end: Date },
): { top: number; height: number } {
  const top = yAt(range, schedule.start);
  return { top, height: yAt(range, schedule.end) - top };
}

/** A whole hour on the clock within the range, where its tick goes. */
export interface HourTick {
  readonly at: Date;
  readonly y: number;
}

/**
 * The whole hours of the local clock within the range, the start included
 * when it is one, the end not: a 5:30 day boundary starts the ticks at 6:00.
 */
export function hourTicks(range: LogicalDayRange): HourTick[] {
  const first = new Date(range.start);
  if (first.getMinutes() !== 0 || first.getSeconds() !== 0) {
    first.setHours(first.getHours() + 1, 0, 0, 0);
  }
  const ticks: HourTick[] = [];
  for (let at = first.getTime(); at < range.end.getTime(); at += hourMs) {
    ticks.push({ at: new Date(at), y: yAt(range, new Date(at)) });
  }
  return ticks;
}
