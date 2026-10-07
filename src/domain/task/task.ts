// The task model and the rules for interpreting what the notes hold
// (GLOSSARY: Status, Importance, Effort, Start, Due). Pure; no Orca types.

/** Identifies a task. It is the ID of the task's (source) block. */
export type TaskId = number;

export const taskStatuses = [
  "inbox",
  "todo",
  "doing",
  "waiting",
  "someday",
  "done",
] as const;
export type TaskStatus = (typeof taskStatuses)[number];

/** Importance or effort: an integer from 1 to 7. */
export type Rating = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Importance = Rating;
export type Effort = Rating;

/** A calendar date with no time of day and no time zone (ADR 0012). */
export interface CalendarDate {
  readonly year: number;
  /** 1–12 */
  readonly month: number;
  /** 1–31 */
  readonly day: number;
}

/**
 * Something in the notes that could not be taken at face value. The task
 * still reads with a fallback; the original value is kept for the user.
 */
export interface DataAnomaly {
  readonly property: "status";
  /** The value as found in the notes; `null` when it was empty. */
  readonly value: unknown;
}

export interface Task {
  readonly id: TaskId;
  /** The block's own text, without tags or property values. */
  readonly text: string;
  readonly status: TaskStatus;
  readonly importance: Importance;
  readonly effort: Effort;
  readonly start: CalendarDate | null;
  readonly due: CalendarDate | null;
  readonly contexts: readonly string[];
  readonly labels: readonly string[];
  readonly note: string | null;
  readonly anomalies: readonly DataAnomaly[];
}

/** What the notes hold for a task, already translated into domain terms. */
export interface TaskInNotes {
  id: TaskId;
  text: string;
  status: {
    /** The status the note value stands for, if it is one. */
    key: TaskStatus | undefined;
    /** The value as found in the notes; `null` when empty. */
    value: unknown;
  };
  /** A number, or `null` when the notes hold none. */
  importance: number | null;
  effort: number | null;
  start: CalendarDate | null;
  due: CalendarDate | null;
  contexts: readonly string[];
  labels: readonly string[];
  note: string | null;
}

const defaultRating: Rating = 4;

function isRating(value: number | null): value is Rating {
  return value !== null && Number.isInteger(value) && value >= 1 && value <= 7;
}

/**
 * Reads a task from what the notes hold. An empty or unknown status reads as
 * inbox and is recorded as an anomaly; an importance or effort that is empty,
 * not an integer, or outside 1–7 reads as 4. Nothing is written back.
 */
export function taskFromNotes(input: TaskInNotes): Task {
  const anomalies: DataAnomaly[] = [];
  if (input.status.key === undefined) {
    anomalies.push({ property: "status", value: input.status.value });
  }
  return {
    id: input.id,
    text: input.text,
    status: input.status.key ?? "inbox",
    importance: isRating(input.importance) ? input.importance : defaultRating,
    effort: isRating(input.effort) ? input.effort : defaultRating,
    start: input.start,
    due: input.due,
    contexts: [...input.contexts],
    labels: [...input.labels],
    note: input.note,
    anomalies,
  };
}
