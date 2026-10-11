// The recurrence rule (GLOSSARY: 重复规则) as stored in the plugin block
// property `nextaction.recurrence`:
// `{ v: 1, rule: { period: { interval, unit }, basis } }`, or `{ v: 1, rule:
// null }` once the rule is removed (the property is kept, so there is one
// write path, as for the My Day entries in ADR 0020). `interval` is a whole
// number from 1 up, `unit` one of `day` / `week` / `month` / `year`, `basis`
// `schedule` (按日程) or `completion` (按完成). The optional end condition
// (`rule.end`, #89) is `{ until: "YYYY-MM-DD" }` (the last logical day) or
// `{ count: { total, remaining } }` (whole numbers from 1 up, `remaining`
// no more than `total`; setting "N times" writes N for both). Placements
// (`period.placement`) and pausing (`rule.paused`) go inside `rule` in later
// tickets of step 8 (#88, #92); fields this version does not know are not
// read yet. The version
// number is added and checked by the plugin block property codec.
import {
  type RecurrenceBasis,
  type RecurrenceEnd,
  type RecurrencePeriod,
  type RecurrenceRead,
  type RecurrenceRule,
  type RecurrenceUnit,
  recurrenceBases,
  recurrenceUnits,
} from "../../../domain/recurrence/recurrence";
import {
  type BlockWithProperties,
  type PluginPropertyWrite,
  planPluginPropertyWrite,
  pluginPropertyPrefix,
  readPluginProperty,
} from "./plugin-block-property-codec";
import { formatDay, parseDay } from "./stored-values";

/** The plugin block property key (without the `nextaction.` prefix). */
const key = "recurrence";

/** What a block's recurrence rule reads as. */
export type StoredRecurrence =
  /** No rule: absent, or removed. The task is not a recurring task. */
  | { kind: "none" }
  | { kind: "rule"; rule: RecurrenceRule }
  /**
   * Something is stored that this plugin cannot read (an unknown version, a
   * missing field, or a value out of range). `raw` is the value as found; it
   * must not be overwritten.
   */
  | { kind: "unreadable"; raw: unknown; reason: string };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parsePeriod(value: unknown): RecurrencePeriod | string {
  if (!isObject(value)) return "the period is not an object";
  const { interval, unit } = value;
  if (
    typeof interval !== "number" ||
    !Number.isInteger(interval) ||
    interval < 1
  ) {
    return "the interval is not a whole number from 1 up";
  }
  if (!recurrenceUnits.includes(unit as RecurrenceUnit)) {
    return "the unit is not one this plugin knows";
  }
  return { interval, unit: unit as RecurrenceUnit };
}

const isWholeFromOne = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1;

/** The end condition stored (`rule.end`), or why it cannot be read. */
function parseEnd(value: unknown): RecurrenceEnd | string {
  if (!isObject(value)) return "the end condition is not an object";
  if ("until" in value) {
    const day = parseDay(value.until);
    return day ? { kind: "until", day } : "the end day is not a day";
  }
  if ("count" in value) {
    const count = value.count;
    if (!isObject(count)) return "the end count is not an object";
    const { total, remaining } = count;
    if (!isWholeFromOne(total) || !isWholeFromOne(remaining)) {
      return "the end count is not a whole number from 1 up";
    }
    if (remaining > total) {
      return "more occurrences remain than the end count";
    }
    return { kind: "count", total, remaining };
  }
  return "the end condition is not one this plugin knows";
}

/** The rule stored, or why it cannot be read. */
function parseRule(value: unknown): RecurrenceRule | string {
  if (!isObject(value)) return "the rule is not an object";
  const period = parsePeriod(value.period);
  if (typeof period === "string") return period;
  if (!recurrenceBases.includes(value.basis as RecurrenceBasis)) {
    return "the basis is not one this plugin knows";
  }
  const basis = value.basis as RecurrenceBasis;
  if (value.end === undefined) return { period, basis };
  const end = parseEnd(value.end);
  if (typeof end === "string") return end;
  return { period, basis, end };
}

/** `end` as stored in `rule.end`. */
function encodeEnd(end: RecurrenceEnd) {
  return end.kind === "until"
    ? { until: formatDay(end.day) }
    : { count: { total: end.total, remaining: end.remaining } };
}

/**
 * Reads a block's recurrence rule. Absent, or no rule, reads as none; an
 * unknown version, a missing field or a value out of range reads as
 * unreadable.
 */
export function readRecurrence(block: BlockWithProperties): StoredRecurrence {
  const read = readPluginProperty(block, key);
  if (read.kind === "absent") return { kind: "none" };
  if (read.kind === "unreadable") return read;
  const unreadable = (reason: string): StoredRecurrence => ({
    kind: "unreadable",
    raw: block.properties.find((p) => p.name === pluginPropertyPrefix + key)
      ?.value,
    reason,
  });
  if (!("rule" in read.data)) return unreadable("there is no rule field");
  if (read.data.rule === null) return { kind: "none" };
  const rule = parseRule(read.data.rule);
  return typeof rule === "string" ? unreadable(rule) : { kind: "rule", rule };
}

/**
 * A block's recurrence rule as a task carries it: what `readRecurrence`
 * found, without the raw value. An unreadable one is kept as it is and
 * reported when it is to be written, not on every read.
 */
export function recurrenceOf(block: BlockWithProperties): RecurrenceRead {
  const read = readRecurrence(block);
  return read.kind === "unreadable"
    ? { kind: "unreadable", reason: read.reason }
    : read;
}

/**
 * Plans writing `rule` to a block, replacing what it holds; `null` (the rule
 * removed) writes no rule, the property kept. A value this plugin cannot
 * read, of an unknown version or damaged, is never overwritten.
 */
export function planRecurrenceWrite(
  block: BlockWithProperties,
  rule: RecurrenceRule | null,
): PluginPropertyWrite {
  const current = readRecurrence(block);
  if (current.kind === "unreadable") {
    return { kind: "refused", raw: current.raw, reason: current.reason };
  }
  return planPluginPropertyWrite(block, key, {
    rule: rule && {
      period: { interval: rule.period.interval, unit: rule.period.unit },
      basis: rule.basis,
      ...(rule.end && { end: encodeEnd(rule.end) }),
    },
  });
}
