// The review plan (GLOSSARY: 回顾周期, 指定回顾日, 标记已回顾) as stored in the
// plugin block property `nextaction.review`: `{ v: 1, interval?: { every,
// unit }, lastReviewed?: "YYYY-MM-DD", reviewOn?: "YYYY-MM-DD" }`. `every` is
// a whole number from 1 up, `unit` one of `day` / `week` / `month`; the days
// are logical days. Each field is optional; a plan with none of them is
// written as `{ v: 1 }`, the property kept (one write path, as for the
// recurrence rule). The version number is added and checked by the plugin
// block property codec.
import {
  type ReviewInterval,
  type ReviewPlan,
  type ReviewUnit,
  reviewUnits,
} from "../../../domain/review/review";
import type { CalendarDate } from "../../../domain/task/task";
import {
  type BlockWithProperties,
  type PluginPropertyWrite,
  planPluginPropertyWrite,
  pluginPropertyPrefix,
  readPluginProperty,
} from "./plugin-block-property-codec";
import { formatDay, parseDay } from "./stored-values";

/** The plugin block property key (without the `nextaction.` prefix). */
const key = "review";

/** What a block's review plan reads as. */
export type StoredReview =
  | { kind: "none" }
  | { kind: "plan"; plan: ReviewPlan }
  /**
   * Something is stored that this plugin cannot read (an unknown version, or
   * a value out of range). `raw` is the value as found; it must not be
   * overwritten.
   */
  | { kind: "unreadable"; raw: unknown; reason: string };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The review interval stored, or why it cannot be read. */
function parseInterval(value: unknown): ReviewInterval | string {
  if (!isObject(value)) return "the review interval is not an object";
  const { every, unit } = value;
  if (typeof every !== "number" || !Number.isInteger(every) || every < 1) {
    return "the review interval is not a whole number from 1 up";
  }
  if (!reviewUnits.includes(unit as ReviewUnit)) {
    return "the review interval's unit is not one this plugin knows";
  }
  return { every, unit: unit as ReviewUnit };
}

/** A stored day, `null` when absent, or why it cannot be read. */
function parseOptionalDay(
  value: unknown,
  name: string,
): CalendarDate | null | string {
  if (value === undefined) return null;
  return parseDay(value) ?? `the ${name} is not a day as YYYY-MM-DD`;
}

/**
 * Reads a block's review plan. Absent reads as none; an unknown version, or
 * a field out of range or not in the format above, reads as unreadable.
 */
export function readReview(block: BlockWithProperties): StoredReview {
  const read = readPluginProperty(block, key);
  if (read.kind === "absent") return { kind: "none" };
  if (read.kind === "unreadable") return read;
  const unreadable = (reason: string): StoredReview => ({
    kind: "unreadable",
    raw: block.properties.find((p) => p.name === pluginPropertyPrefix + key)
      ?.value,
    reason,
  });
  const { data } = read;
  const interval =
    data.interval === undefined ? null : parseInterval(data.interval);
  if (typeof interval === "string") return unreadable(interval);
  const lastReviewed = parseOptionalDay(data.lastReviewed, "last reviewed day");
  if (typeof lastReviewed === "string") return unreadable(lastReviewed);
  const reviewOn = parseOptionalDay(data.reviewOn, "review-on day");
  if (typeof reviewOn === "string") return unreadable(reviewOn);
  return { kind: "plan", plan: { interval, lastReviewed, reviewOn } };
}

/**
 * Plans writing `plan` to a block, replacing what it holds; a plan with no
 * fields writes `{ v: 1 }`, the property kept. A value this plugin cannot
 * read, of an unknown version or damaged, is never overwritten.
 */
export function planReviewWrite(
  block: BlockWithProperties,
  plan: ReviewPlan,
): PluginPropertyWrite {
  const current = readReview(block);
  if (current.kind === "unreadable") {
    return { kind: "refused", raw: current.raw, reason: current.reason };
  }
  return planPluginPropertyWrite(block, key, {
    ...(plan.interval && {
      interval: { every: plan.interval.every, unit: plan.interval.unit },
    }),
    ...(plan.lastReviewed && { lastReviewed: formatDay(plan.lastReviewed) }),
    ...(plan.reviewOn && { reviewOn: formatDay(plan.reviewOn) }),
  });
}
