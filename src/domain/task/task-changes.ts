import type {
  CalendarDate,
  DependencyMode,
  Effort,
  Importance,
  TaskId,
  TaskStatus,
  Urgency,
} from "./task";

/**
 * The task properties to write and their new values. Only the properties
 * present are written; `null` clears a property, as does an empty list.
 */
export interface TaskChanges {
  readonly status?: TaskStatus;
  readonly importance?: Importance;
  readonly urgency?: Urgency;
  readonly effort?: Effort;
  readonly start?: CalendarDate | null;
  readonly due?: CalendarDate | null;
  readonly contexts?: readonly string[];
  readonly labels?: readonly string[];
  readonly note?: string | null;
  readonly sequential?: boolean;
  /**
   * The tasks this one waits for (GLOSSARY: 依赖): the whole list, replacing
   * what the notes hold; an empty list removes every dependency.
   */
  readonly dependencies?: readonly TaskId[];
  /** Whether every dependency must be met or one is enough (GLOSSARY: 依赖模式). */
  readonly dependencyMode?: DependencyMode;
  /**
   * How many logical days after the dependencies are met the task is let in
   * (GLOSSARY: 依赖延迟); `null` clears it, which reads as 0.
   */
  readonly dependencyDelay?: number | null;
}
