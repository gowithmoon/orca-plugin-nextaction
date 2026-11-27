// The standing schedule (GLOSSARY: 常设排期; ADR 0029) as stored in the plugin
// block property `nextaction.standingschedule`:
// `{ v: 1, schedule: { start: "HH:MM", end: "HH:MM" } }`, local times of day
// (not moments, so daylight saving time does not move it), or `{ v: 1,
// schedule: null }` once it is cleared (the property is kept, one write path,
// as for the recurrence rule). Whether the times hold on a logical day is
// the domain's to tell, not the codec's: one crossing the day boundary after
// the user moved it reads as it is (ADR 0029). Fields this version does not
// know are not read, so a later field (the day it was removed from My Day,
// #245) fits within v1 (ADR 0008). The version number is added and checked
// by the plugin block property codec.
import type {
  StandingSchedule,
  StandingScheduleRead,
} from "../../../domain/task/standing-schedule";
import type { TimeOfDay } from "../../../domain/time/time-of-day";
import {
  type BlockWithProperties,
  type PluginPropertyDiscard,
  type PluginPropertyWrite,
  planPluginPropertyDiscard,
  planPluginPropertyWrite,
  pluginPropertyPrefix,
  readPluginProperty,
} from "./plugin-block-property-codec";

/** The plugin block property key (without the `nextaction.` prefix). */
const key = "standingschedule";

/** What a block's standing schedule reads as. */
export type StoredStandingSchedule =
  | { kind: "none" }
  | { kind: "schedule"; schedule: StandingSchedule }
  /**
   * Something is stored that this plugin cannot read (an unknown version, or
   * a value not in the format above). `raw` is the value as found; it must
   * not be overwritten.
   */
  | { kind: "unreadable"; raw: unknown; reason: string };

const timePattern = /^(\d{2}):(\d{2})$/;

/** An `HH:MM` string naming a time of day, or `undefined`. */
function parseTimeOfDay(value: unknown): TimeOfDay | undefined {
  if (typeof value !== "string") return undefined;
  const match = timePattern.exec(value);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? { hours, minutes } : undefined;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** `time` as `HH:MM`, as `parseTimeOfDay` reads it. */
const formatTimeOfDay = (time: TimeOfDay) =>
  `${pad(time.hours)}:${pad(time.minutes)}`;

/**
 * Reads a block's standing schedule. Absent, or cleared, reads as none; an
 * unknown version, a missing field or a time that is not one reads as
 * unreadable.
 */
export function readStandingSchedule(
  block: BlockWithProperties,
): StoredStandingSchedule {
  const read = readPluginProperty(block, key);
  if (read.kind === "absent") return { kind: "none" };
  if (read.kind === "unreadable") return read;
  const unreadable = (reason: string): StoredStandingSchedule => ({
    kind: "unreadable",
    raw: block.properties.find((p) => p.name === pluginPropertyPrefix + key)
      ?.value,
    reason,
  });
  if (!("schedule" in read.data)) {
    return unreadable("there is no schedule field");
  }
  const { schedule } = read.data;
  if (schedule === null) return { kind: "none" };
  if (typeof schedule !== "object" || Array.isArray(schedule)) {
    return unreadable("the schedule is not an object");
  }
  const fields = schedule as Record<string, unknown>;
  const start = parseTimeOfDay(fields.start);
  const end = parseTimeOfDay(fields.end);
  if (!start || !end) return unreadable("a time is not a time of day");
  return { kind: "schedule", schedule: { start, end } };
}

/**
 * Plans writing `schedule` to a block, replacing what it holds; `null` (the
 * schedule cleared) writes no schedule, the property kept. A value this
 * plugin cannot read, of an unknown version or damaged, is never
 * overwritten.
 */
export function planStandingScheduleWrite(
  block: BlockWithProperties,
  schedule: StandingSchedule | null,
): PluginPropertyWrite {
  const current = readStandingSchedule(block);
  if (current.kind === "unreadable") {
    return { kind: "refused", raw: current.raw, reason: current.reason };
  }
  return planPluginPropertyWrite(block, key, {
    schedule: schedule && {
      start: formatTimeOfDay(schedule.start),
      end: formatTimeOfDay(schedule.end),
    },
  });
}

/**
 * Plans discarding a standing schedule this plugin cannot read, writing no
 * schedule over it; a readable one, or none, is left as it is.
 */
export function planStandingScheduleDiscard(
  block: BlockWithProperties,
): PluginPropertyDiscard {
  return planPluginPropertyDiscard(
    readStandingSchedule(block).kind === "unreadable",
    key,
    { schedule: null },
  );
}

/**
 * A block's standing schedule as a task carries it: what
 * `readStandingSchedule` found, without the raw value. An unreadable one is
 * kept as it is and reported when it is to be written, not on every read.
 */
export function standingScheduleOf(
  block: BlockWithProperties,
): StandingScheduleRead {
  const read = readStandingSchedule(block);
  return read.kind === "unreadable"
    ? { kind: "unreadable", reason: read.reason }
    : read;
}
