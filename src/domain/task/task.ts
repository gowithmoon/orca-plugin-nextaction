// The task model and the rules for interpreting what the notes hold
// (GLOSSARY: Status, Importance, Urgency, Effort, Start, Due). Pure; no Orca types.

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

/**
 * How several dependencies are met (GLOSSARY: 依赖模式): every one ("all"),
 * or at least one ("any").
 */
export const dependencyModes = ["all", "any"] as const;
export type DependencyMode = (typeof dependencyModes)[number];

/** Importance, urgency or effort: an integer from 1 to 7. */
export type Rating = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Importance = Rating;
export type Urgency = Rating;
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
  /** How soon it needs moving, apart from any due date (GLOSSARY: 紧急度). */
  readonly urgency: Urgency;
  readonly effort: Effort;
  readonly start: CalendarDate | null;
  readonly due: CalendarDate | null;
  readonly contexts: readonly string[];
  readonly labels: readonly string[];
  readonly note: string | null;
  /**
   * Its subtasks are done one after another, in note order (GLOSSARY:
   * 顺序执行). Off unless the notes hold it switched on.
   */
  readonly sequential: boolean;
  /**
   * The tasks this one waits for (GLOSSARY: 依赖), by the IDs of their
   * (source) blocks, in the order the notes hold them. A target that is no
   * longer a task (a stale dependency) is still listed; the task graph tells.
   */
  readonly dependencies: readonly TaskId[];
  /**
   * Whether every dependency must be met or one is enough (GLOSSARY:
   * 依赖模式); "all" unless the notes hold "any".
   */
  readonly dependencyMode: DependencyMode;
  /**
   * How many logical days after its dependencies are met the task is let in
   * (GLOSSARY: 依赖延迟): a whole number of days, 0 for none.
   */
  readonly dependencyDelay: number;
  /** When the block was created; read-only, it orders the inbox. */
  readonly created: Date;
  readonly anomalies: readonly DataAnomaly[];
}

/**
 * What a task's descendants take from it as an ancestor task: its importance
 * and urgency, which the score inherits (GLOSSARY: 评分, ADR 0019).
 */
export type AncestorRatings = Pick<Task, "importance" | "urgency">;

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
  urgency: number | null;
  effort: number | null;
  start: CalendarDate | null;
  due: CalendarDate | null;
  contexts: readonly string[];
  labels: readonly string[];
  note: string | null;
  sequential: boolean;
  dependencies: readonly TaskId[];
  dependencyMode: DependencyMode;
  /** A number, or `null` when the notes hold none. */
  dependencyDelay: number | null;
  created: Date;
}

/** Importance, urgency and effort default to 4 (GLOSSARY). */
export const defaultRating: Rating = 4;

/**
 * The notes hold an empty or unknown status for the task: it reads as inbox,
 * but no status of the plugin is stored yet.
 */
export function hasStatusAnomaly(task: Pick<Task, "anomalies">): boolean {
  return task.anomalies.some((anomaly) => anomaly.property === "status");
}

/**
 * A dependency delay as whole days: one that is empty, negative or not a
 * whole number reads as 0 (#77), so data spoilt by hand never holds a task
 * back.
 */
function delayDays(value: number | null): number {
  return value !== null && Number.isInteger(value) && value > 0 ? value : 0;
}

function isRating(value: number | null): value is Rating {
  return value !== null && Number.isInteger(value) && value >= 1 && value <= 7;
}

/**
 * Reads a task from what the notes hold. An empty or unknown status reads as
 * inbox and is recorded as an anomaly; an importance, urgency or effort that
 * is empty, not an integer, or outside 1–7 reads as 4. Nothing is written back.
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
    urgency: isRating(input.urgency) ? input.urgency : defaultRating,
    effort: isRating(input.effort) ? input.effort : defaultRating,
    start: input.start,
    due: input.due,
    contexts: [...input.contexts],
    labels: [...input.labels],
    note: input.note,
    sequential: input.sequential,
    dependencies: [...input.dependencies],
    dependencyMode: input.dependencyMode,
    dependencyDelay: delayDays(input.dependencyDelay),
    created: input.created,
    anomalies,
  };
}
