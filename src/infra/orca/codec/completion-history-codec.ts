// The completion history (GLOSSARY: 完成历史) as stored in the plugin block
// property `nextaction.completions`: `{ v: 1, entries: [{ at, day }] }`, `at`
// the completion time as a UTC ISO string, `day` its logical day as
// `YYYY-MM-DD`, oldest first; `at` reads back from Orca as a `Date`. The
// version number is added and checked by the plugin block property codec.
import type {
  CompletionEntry,
  CompletionHistory,
} from "../../../domain/task/completion-history";
import type { CalendarDate } from "../../../domain/task/task";
import {
  type BlockWithProperties,
  type PluginPropertyWrite,
  planPluginPropertyWrite,
  pluginPropertyPrefix,
  readPluginProperty,
} from "./plugin-block-property-codec";

/** The plugin block property key (without the `nextaction.` prefix). */
const key = "completions";

/** What a block's completion history reads as. */
export type StoredCompletionHistory =
  | { kind: "readable"; history: CompletionHistory }
  /**
   * Something is stored that this plugin cannot read (an unknown version, or
   * damaged). `raw` is the value as found; it must not be overwritten.
   */
  | { kind: "unreadable"; raw: unknown; reason: string };

const dayPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A `YYYY-MM-DD` string naming a day that exists, or `undefined`. */
export function parseDay(value: unknown): CalendarDate | undefined {
  if (typeof value !== "string") return undefined;
  const match = dayPattern.exec(value);
  if (!match) return undefined;
  const [year, month, day] = match.slice(1).map(Number) as [
    number,
    number,
    number,
  ];
  // UTC arithmetic only checks the date exists; no time zone is involved.
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return undefined;
  }
  return { year, month, day };
}

/**
 * A time, or `undefined`. Written as an ISO string, it reads back from Orca
 * as a `Date` (#72 acceptance, as for date properties in
 * plugin-panel-writes); both are taken.
 */
export function parseTime(value: unknown): Date | undefined {
  if (!(typeof value === "string" || value instanceof Date)) return undefined;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? undefined : at;
}

function parseEntry(value: unknown): CompletionEntry | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { at, day } = value as Record<string, unknown>;
  const time = parseTime(at);
  const logicalDay = parseDay(day);
  return time && logicalDay ? { at: time, day: logicalDay } : undefined;
}

/**
 * Reads a block's completion history. Absent reads as no completions; an
 * unknown version, or entries not in the format above, read as unreadable.
 */
export function readCompletionHistory(
  block: BlockWithProperties,
): StoredCompletionHistory {
  const read = readPluginProperty(block, key);
  if (read.kind === "absent") return { kind: "readable", history: [] };
  if (read.kind === "unreadable") return read;
  const unreadable = (reason: string): StoredCompletionHistory => ({
    kind: "unreadable",
    raw: block.properties.find((p) => p.name === pluginPropertyPrefix + key)
      ?.value,
    reason,
  });
  const entries = read.data.entries;
  if (!Array.isArray(entries)) return unreadable("entries is not a list");
  const history: CompletionEntry[] = [];
  for (const [index, value] of entries.entries()) {
    const entry = parseEntry(value);
    if (!entry) return unreadable(`entry ${index} is not a completion`);
    history.push(entry);
  }
  return { kind: "readable", history };
}

const pad = (value: number, width: number) =>
  String(value).padStart(width, "0");

export const formatDay = (day: CalendarDate) =>
  `${pad(day.year, 4)}-${pad(day.month, 2)}-${pad(day.day, 2)}`;

/**
 * Plans writing `history` to a block, replacing what it holds. A value this
 * plugin cannot read is never overwritten.
 */
export function planCompletionHistoryWrite(
  block: BlockWithProperties,
  history: CompletionHistory,
): PluginPropertyWrite {
  return planPluginPropertyWrite(block, key, {
    entries: history.map((entry) => ({
      at: entry.at.toISOString(),
      day: formatDay(entry.day),
    })),
  });
}
