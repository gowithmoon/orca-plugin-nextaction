// A task's reminders (GLOSSARY: 提醒) as stored in the plugin block property
// `nextaction.reminders`: `{ v: 1, reminders: ["<ISO 8601, UTC>", …] }`,
// absolute moments, ascending, each once. No reminders are written as an
// empty list, the property kept (one write path, as for the review plan).
// Orca reads the ISO strings back as `Date`s (#72 acceptance); both are taken.
// The version number is added and checked by the plugin block property codec.
import {
  normalizeReminders,
  type ReminderRead,
  type Reminders,
} from "../../../domain/reminder/reminder";
import {
  type BlockWithProperties,
  type PluginPropertyWrite,
  planPluginPropertyWrite,
  pluginPropertyPrefix,
  readPluginProperty,
} from "./plugin-block-property-codec";
import { parseTime } from "./stored-values";

/** The plugin block property key (without the `nextaction.` prefix). */
const key = "reminders";

/** What a block's reminders read as. */
export type StoredReminders =
  | { kind: "none" }
  | { kind: "list"; reminders: Reminders }
  /**
   * Something is stored that this plugin cannot read (an unknown version, or
   * a value not in the format above). `raw` is the value as found; it must
   * not be overwritten.
   */
  | { kind: "unreadable"; raw: unknown; reason: string };

/**
 * Reads a block's reminders. Absent reads as none; an unknown version, a
 * list missing, or a moment that is not one, reads as unreadable.
 */
export function readReminders(block: BlockWithProperties): StoredReminders {
  const read = readPluginProperty(block, key);
  if (read.kind === "absent") return { kind: "none" };
  if (read.kind === "unreadable") return read;
  const unreadable = (reason: string): StoredReminders => ({
    kind: "unreadable",
    raw: block.properties.find((p) => p.name === pluginPropertyPrefix + key)
      ?.value,
    reason,
  });
  const { reminders } = read.data;
  if (!Array.isArray(reminders)) {
    return unreadable("the reminders are not a list");
  }
  const moments: Date[] = [];
  for (const value of reminders) {
    const moment = parseTime(value);
    if (!moment) return unreadable("a reminder is not a moment");
    moments.push(moment);
  }
  // Ascending, each once, as the domain expects, however it was stored.
  return { kind: "list", reminders: normalizeReminders(moments) };
}

/**
 * Plans writing `reminders` to a block, replacing what it holds, ascending
 * and each once; none writes an empty list, the property kept. A value this
 * plugin cannot read, of an unknown version or damaged, is never overwritten.
 */
export function planRemindersWrite(
  block: BlockWithProperties,
  reminders: Reminders,
): PluginPropertyWrite {
  const current = readReminders(block);
  if (current.kind === "unreadable") {
    return { kind: "refused", raw: current.raw, reason: current.reason };
  }
  return planPluginPropertyWrite(block, key, {
    reminders: normalizeReminders(reminders).map((moment) =>
      moment.toISOString(),
    ),
  });
}

/**
 * A block's reminders as a task carries them: what `readReminders` found,
 * without the raw value. An unreadable value is kept as it is and reported
 * when it is to be written, not on every read.
 */
export function remindersOf(block: BlockWithProperties): ReminderRead {
  const read = readReminders(block);
  return read.kind === "unreadable"
    ? { kind: "unreadable", reason: read.reason }
    : read;
}
