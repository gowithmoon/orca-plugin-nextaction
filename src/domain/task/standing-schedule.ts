// The standing schedule (GLOSSARY: 常设排期; ADR 0029): where a recurring
// task sits in My Day on each day it is to be done, by time of day. Pure:
// the logical day and the day boundary are passed in.
import type { TimeOfDay } from "../time/time-of-day";

/**
 * A start and an end time of day, on 15-minute steps, the end after the
 * start within one logical day. Times of day, not moments, so neither
 * daylight saving time nor a change of time zone moves it (ADR 0029).
 */
export interface StandingSchedule {
  readonly start: TimeOfDay;
  readonly end: TimeOfDay;
}

/**
 * What a task's standing schedule reads as. `unreadable`: something is
 * stored that this plugin cannot read (an unknown version, or damaged); it
 * is kept as it is and cannot be written.
 */
export type StandingScheduleRead =
  | { readonly kind: "none" }
  | { readonly kind: "schedule"; readonly schedule: StandingSchedule }
  | { readonly kind: "unreadable"; readonly reason: string };

/** No standing schedule: what a task reads as without one. */
export const noStandingSchedule: StandingScheduleRead = { kind: "none" };
