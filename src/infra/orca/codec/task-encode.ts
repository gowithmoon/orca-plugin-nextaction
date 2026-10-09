// TaskChanges → the values written to the task block's reference to the task
// tag (tag-operations: `setRefData` takes `{ name, value, type? }` items).

import type { CalendarDate } from "../../../domain/task/task";
import type { TaskChanges } from "../../../domain/task/task-changes";
import { PropType } from "../prop-type";
import {
  type NoteLanguage,
  type PropertyKey,
  propertyName,
  statusName,
} from "./names";

/** What encoding needs to know about the task tag. */
export interface TaskWriteContext {
  /** The language of the names on the tag (ADR 0009). */
  language: NoteLanguage;
  /** Plugin properties whose definition conflicts; writing them fails (#19). */
  invalidated: readonly PropertyKey[];
}

/** One item of the tag reference's data, as `setRefData` takes it. */
export interface RefDataItem {
  name: string;
  type?: number;
  value: unknown;
}

/**
 * A write touched properties whose definition on the task tag conflicts with
 * the plugin's (#19). Nothing of that write is applied.
 */
export class InvalidatedPropertyError extends Error {
  override name = "InvalidatedPropertyError";
  constructor(readonly properties: readonly PropertyKey[]) {
    super(`cannot write invalidated properties: ${properties.join(", ")}`);
  }
}

/**
 * Encodes the properties present in `changes`, and only those. Throws
 * `InvalidatedPropertyError`, encoding nothing, when any of them is
 * invalidated.
 */
export function encodeTaskChanges(
  changes: TaskChanges,
  tag: TaskWriteContext,
): RefDataItem[] {
  const refused = tag.invalidated.filter(
    (key) => changes[changeFieldOf[key]] !== undefined,
  );
  if (refused.length > 0) throw new InvalidatedPropertyError(refused);
  const items: RefDataItem[] = [];
  if (changes.status !== undefined) {
    items.push({
      name: propertyName("status", tag.language),
      value: statusName(changes.status, tag.language),
    });
  }
  if (changes.importance !== undefined) {
    items.push({
      name: propertyName("importance", tag.language),
      value: changes.importance,
    });
  }
  if (changes.effort !== undefined) {
    items.push({
      name: propertyName("effort", tag.language),
      value: changes.effort,
    });
  }
  if (changes.start !== undefined) {
    items.push(dateItem(propertyName("start", tag.language), changes.start));
  }
  if (changes.due !== undefined) {
    items.push(dateItem(propertyName("due", tag.language), changes.due));
  }
  if (changes.contexts !== undefined) {
    items.push({
      name: propertyName("context", tag.language),
      value: choicesValue(changes.contexts),
    });
  }
  if (changes.labels !== undefined) {
    items.push({
      name: propertyName("label", tag.language),
      value: choicesValue(changes.labels),
    });
  }
  if (changes.note !== undefined) {
    items.push({
      name: propertyName("note", tag.language),
      value: changes.note,
    });
  }
  if (changes.sequential !== undefined) {
    // Always with `type: 4`: without it insertTag tags nothing and says
    // nothing (next-action-hierarchy-boolean-deps).
    items.push({
      name: propertyName("sequential", tag.language),
      type: PropType.Boolean,
      value: changes.sequential,
    });
  }
  return items;
}

/** A date, or `null` to clear it as tag-operations step 06 did. */
function dateItem(name: string, date: CalendarDate | null): RefDataItem {
  return date === null
    ? { name, value: null }
    : // The type is passed with dates as the spikes did.
      { name, type: PropType.DateTime, value: localMidnight(date) };
}

/** The `TaskChanges` field each property is written from. */
const changeFieldOf: Record<PropertyKey, keyof TaskChanges> = {
  status: "status",
  importance: "importance",
  effort: "effort",
  start: "start",
  due: "due",
  context: "contexts",
  label: "labels",
  note: "note",
  sequential: "sequential",
};

/**
 * Multiple choice values are arrays of option names (tag-operations step 02).
 * An empty list clears the value with `null`, the only clearing measured
 * (step 06); what `[]` does to a multiple choice value is not measured.
 */
function choicesValue(names: readonly string[]): string[] | null {
  return names.length > 0 ? [...names] : null;
}

/**
 * Orca keeps the time of day the plugin writes (date-subtype, block D), so a
 * date goes in as local midnight of that day (ADR 0012).
 */
function localMidnight(date: CalendarDate): Date {
  return new Date(date.year, date.month - 1, date.day);
}
