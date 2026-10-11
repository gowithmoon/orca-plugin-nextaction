// The recurrence rule (GLOSSARY: 重复规则) as stored in the plugin block
// property `nextaction.recurrence`:
// `{ v: 1, rule: { period: { interval, unit }, basis } }`, or `{ v: 1, rule:
// null }` once the rule is removed (the property is kept, so there is one
// write path, as for the My Day entries in ADR 0020). `interval` is a whole
// number from 1 up, `unit` one of `day` / `week` / `month` / `year` /
// `weekday`, `basis` `schedule` (按日程) or `completion` (按完成). An optional
// `period.placement` (#88) says where in the unit the period falls: for a
// week `{ kind: "daysOfWeek", days: [1–7, …] }` (at least one, Monday 1);
// for a month `{ kind: "dayOfMonth", day: 1–31 }`, `{ kind: "lastDayOfMonth" }`
// or `{ kind: "weekdayOfMonth", ordinal: 1–5 | "last", weekday: 1–7 }`; for a
// year `{ kind: "dayOfYear", month: 1–12, day }` (a day that month can have,
// February 29 included). Days and weekdays have none; a placement out of
// range, or not one the unit can have, reads as unreadable. End conditions
// (`rule.end`) and pausing (`rule.paused`) go inside `rule` in later tickets
// of step 8 (#89, #92); fields this version does not know are not read yet.
// The version number is added and checked by the plugin block property codec.
import {
  type DayOfWeek,
  daysOfWeek,
  type RecurrenceBasis,
  type RecurrencePeriod,
  type RecurrencePlacement,
  type RecurrenceRead,
  type RecurrenceRule,
  type RecurrenceUnit,
  recurrenceBases,
  recurrenceUnits,
  type WeekdayOrdinal,
  weekdayOrdinals,
} from "../../../domain/recurrence/recurrence";
import {
  type BlockWithProperties,
  type PluginPropertyWrite,
  planPluginPropertyWrite,
  pluginPropertyPrefix,
  readPluginProperty,
} from "./plugin-block-property-codec";

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
  const known = unit as RecurrenceUnit;
  if (value.placement === undefined || value.placement === null) {
    return { interval, unit: known } as RecurrencePeriod;
  }
  const placement = parsePlacement(known, value.placement);
  if (typeof placement === "string") return placement;
  return { interval, unit: known, placement } as RecurrencePeriod;
}

const isWholeIn = (value: unknown, min: number, max: number): boolean =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= min &&
  value <= max;

const isDayOfWeek = (value: unknown): value is DayOfWeek =>
  daysOfWeek.includes(value as DayOfWeek);

/** The placement stored for `unit` (#88), or why it cannot be read. */
function parsePlacement(
  unit: RecurrenceUnit,
  value: unknown,
): RecurrencePlacement | string {
  if (!isObject(value)) return "the placement is not an object";
  switch (unit) {
    case "week": {
      const { days } = value;
      if (value.kind !== "daysOfWeek" || !Array.isArray(days)) {
        return "the placement is not one a week can have";
      }
      if (days.length === 0 || !days.every(isDayOfWeek)) {
        return "the days of the week are not at least one of Monday (1) to Sunday (7)";
      }
      // Ascending without repeats, as the domain expects.
      return { kind: "daysOfWeek", days: [...new Set(days)].sort() };
    }
    case "month":
      switch (value.kind) {
        case "dayOfMonth":
          return isWholeIn(value.day, 1, 31)
            ? { kind: "dayOfMonth", day: value.day as number }
            : "the day of the month is not from 1 to 31";
        case "lastDayOfMonth":
          return { kind: "lastDayOfMonth" };
        case "weekdayOfMonth": {
          const { ordinal, weekday } = value;
          if (!weekdayOrdinals.includes(ordinal as WeekdayOrdinal)) {
            return "the ordinal is not 1 to 5 or last";
          }
          if (!isDayOfWeek(weekday)) {
            return "the day of the week is not Monday (1) to Sunday (7)";
          }
          return {
            kind: "weekdayOfMonth",
            ordinal: ordinal as WeekdayOrdinal,
            weekday,
          };
        }
        default:
          return "the placement is not one a month can have";
      }
    case "year": {
      const { month, day } = value;
      if (value.kind !== "dayOfYear") {
        return "the placement is not one a year can have";
      }
      if (!isWholeIn(month, 1, 12)) return "the month is not from 1 to 12";
      // February 29 is a day of the year; it is skipped in common years.
      const longest = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      if (!isWholeIn(day, 1, longest[(month as number) - 1] ?? 0)) {
        return "the day is not one that month has";
      }
      return { kind: "dayOfYear", month: month as number, day: day as number };
    }
    default:
      return "days and weekdays have no placement";
  }
}

/** The period as stored: its placement only when it has one. */
function storedPeriod(period: RecurrencePeriod): Record<string, unknown> {
  return {
    interval: period.interval,
    unit: period.unit,
    ...("placement" in period &&
      period.placement !== undefined && { placement: period.placement }),
  };
}

/** The rule stored, or why it cannot be read. */
function parseRule(value: unknown): RecurrenceRule | string {
  if (!isObject(value)) return "the rule is not an object";
  const period = parsePeriod(value.period);
  if (typeof period === "string") return period;
  if (!recurrenceBases.includes(value.basis as RecurrenceBasis)) {
    return "the basis is not one this plugin knows";
  }
  return { period, basis: value.basis as RecurrenceBasis };
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
      period: storedPeriod(rule.period),
      basis: rule.basis,
    },
  });
}
