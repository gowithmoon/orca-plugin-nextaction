// The My Day entries (GLOSSARY: 我的一天记录; ADR 0020) as stored in the plugin
// block property `nextaction.myday`: `{ v: 1, entries: [{ day, start?, end? }] }`,
// `day` the logical day as `YYYY-MM-DD` (as in the completion history),
// `start` and `end` the schedule as UTC ISO strings, oldest first; times read
// back from Orca as `Date`s (#72 acceptance), and both are taken. The version
// number is added and checked by the plugin block property codec.
import type {
  MyDayEntries,
  MyDayEntry,
  MyDaySchedule,
} from "../../../domain/task/my-day";
import { compareDays } from "../../../domain/time/calendar-days";
import { formatDay, parseDay, parseTime } from "./completion-history-codec";
import {
  type BlockWithProperties,
  type PluginPropertyWrite,
  planPluginPropertyWrite,
  pluginPropertyPrefix,
  readPluginProperty,
} from "./plugin-block-property-codec";

/** The plugin block property key (without the `nextaction.` prefix). */
const key = "myday";

/** What a block's My Day entries read as. */
export type StoredMyDay =
  | { kind: "readable"; entries: MyDayEntries }
  /**
   * Something is stored that this plugin cannot read (an unknown version, or
   * damaged). `raw` is the value as found; it must not be overwritten.
   */
  | { kind: "unreadable"; raw: unknown; reason: string };

/**
 * The schedule of a stored entry, or `undefined` for none: only one of the
 * two times, a time that is not one, or an end not after the start read as
 * unscheduled, not as damage (#81 数据).
 */
function parseSchedule(
  start: unknown,
  end: unknown,
): MyDaySchedule | undefined {
  const from = parseTime(start);
  const to = parseTime(end);
  return from && to && to.getTime() > from.getTime()
    ? { start: from, end: to }
    : undefined;
}

function parseEntry(value: unknown): MyDayEntry | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { day, start, end } = value as Record<string, unknown>;
  const logicalDay = parseDay(day);
  if (!logicalDay) return undefined;
  const schedule = parseSchedule(start, end);
  return schedule ? { day: logicalDay, schedule } : { day: logicalDay };
}

/**
 * Reads a block's My Day entries. Absent reads as none; an unknown version,
 * or entries not in the format above, read as unreadable. A logical day
 * found twice reads as its last entry, in the place of the first.
 */
export function readMyDay(block: BlockWithProperties): StoredMyDay {
  const read = readPluginProperty(block, key);
  if (read.kind === "absent") return { kind: "readable", entries: [] };
  if (read.kind === "unreadable") return read;
  const unreadable = (reason: string): StoredMyDay => ({
    kind: "unreadable",
    raw: block.properties.find((p) => p.name === pluginPropertyPrefix + key)
      ?.value,
    reason,
  });
  const stored = read.data.entries;
  if (!Array.isArray(stored)) return unreadable("entries is not a list");
  const entries: MyDayEntry[] = [];
  for (const [index, value] of stored.entries()) {
    const entry = parseEntry(value);
    if (!entry) return unreadable(`entry ${index} is not a My Day entry`);
    const same = entries.findIndex(
      (earlier) => compareDays(earlier.day, entry.day) === 0,
    );
    if (same >= 0) entries[same] = entry;
    else entries.push(entry);
  }
  return { kind: "readable", entries };
}

/**
 * Plans writing `entries` to a block, replacing what it holds; no entries
 * write an empty list, the property kept. A value this plugin cannot read,
 * of an unknown version or damaged, is never overwritten.
 */
export function planMyDayWrite(
  block: BlockWithProperties,
  entries: MyDayEntries,
): PluginPropertyWrite {
  const current = readMyDay(block);
  if (current.kind === "unreadable") {
    return { kind: "refused", raw: current.raw, reason: current.reason };
  }
  return planPluginPropertyWrite(block, key, {
    entries: entries.map((entry) => ({
      day: formatDay(entry.day),
      ...(entry.schedule && {
        start: entry.schedule.start.toISOString(),
        end: entry.schedule.end.toISOString(),
      }),
    })),
  });
}
