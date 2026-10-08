// The completion history as stored in the plugin block property
// `nextaction.completions` (GLOSSARY: 完成历史):
// `{ v: 1, entries: [{ at, day }] }`, `at` the completion time as a UTC ISO
// string, `day` its logical day as `YYYY-MM-DD`, oldest first. The version
// number is added and checked by the plugin block property codec in infra;
// this codec handles what is inside it.
import type {
  CompletionEntry,
  CompletionHistory,
} from "../../domain/task/completion-history";
import type { CalendarDate } from "../../domain/task/task";
import type { PluginBlockPropertyRead } from "../ports/task-repository";

/** The plugin block property key (without the `nextaction.` prefix). */
export const completionHistoryKey = "completions";

/** What a task's completion history reads as. */
export type CompletionHistoryRead =
  | { kind: "readable"; history: CompletionHistory }
  /** Something is stored that this plugin cannot read; it must be kept. */
  | { kind: "unreadable"; reason: string };

const pad = (value: number, width: number) =>
  String(value).padStart(width, "0");

const formatDay = (day: CalendarDate) =>
  `${pad(day.year, 4)}-${pad(day.month, 2)}-${pad(day.day, 2)}`;

const dayPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A `YYYY-MM-DD` string naming a day that exists, or `undefined`. */
function parseDay(value: unknown): CalendarDate | undefined {
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

/** An ISO time string, or `undefined`. */
function parseTime(value: unknown): Date | undefined {
  if (typeof value !== "string") return undefined;
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

/** The data to store for `history` (the version number is added in infra). */
export function encodeCompletionHistory(
  history: CompletionHistory,
): Record<string, unknown> {
  return {
    entries: history.map((entry) => ({
      at: entry.at.toISOString(),
      day: formatDay(entry.day),
    })),
  };
}

/**
 * Reads the completion history from its plugin block property. Absent reads
 * as no completions; an unknown version, or entries not in the format above,
 * read as unreadable.
 */
export function decodeCompletionHistory(
  read: PluginBlockPropertyRead,
): CompletionHistoryRead {
  if (read.kind === "absent") return { kind: "readable", history: [] };
  if (read.kind === "unreadable") {
    return { kind: "unreadable", reason: read.reason };
  }
  const entries = read.data.entries;
  if (!Array.isArray(entries)) {
    return { kind: "unreadable", reason: "entries is not a list" };
  }
  const history: CompletionEntry[] = [];
  for (const [index, value] of entries.entries()) {
    const entry = parseEntry(value);
    if (!entry) {
      return {
        kind: "unreadable",
        reason: `entry ${index} is not a completion`,
      };
    }
    history.push(entry);
  }
  return { kind: "readable", history };
}
