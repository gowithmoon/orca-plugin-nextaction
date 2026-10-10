// The completion history (GLOSSARY: 完成历史) as stored in the plugin block
// property `nextaction.completions`: `{ v: 1, entries: [{ at, day }] }`, `at`
// the completion time as a UTC ISO string, `day` its logical day as
// `YYYY-MM-DD`, oldest first; `at` reads back from Orca as a `Date`. The
// version number is added and checked by the plugin block property codec.
import type {
  CompletionEntry,
  CompletionHistory,
} from "../../../domain/task/completion-history";
import {
  type BlockWithProperties,
  type PluginPropertyWrite,
  planPluginPropertyWrite,
  pluginPropertyPrefix,
  readPluginProperty,
} from "./plugin-block-property-codec";
import { formatDay, parseDay, parseTime } from "./stored-values";

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
