// The project model (GLOSSARY: 项目, 项目状态, 目标; ADR 0025). A project is
// not a task: it has its own project status and constrains the tasks that
// belong to it. Pure; no Orca types.
import type { CalendarDate, Rating } from "../task/task";

/** Identifies a project. It is the ID of the project's (source) block. */
export type ProjectId = number;

/** The project statuses, in option order (GLOSSARY: 项目状态). */
export const projectStatuses = [
  "planning",
  "active",
  "paused",
  "someday",
  "done",
] as const;
export type ProjectStatus = (typeof projectStatuses)[number];

/**
 * The order of the project list's groups (GLOSSARY: 项目视图): the projects
 * moving on first, the done ones last.
 */
export const projectListOrder: readonly ProjectStatus[] = [
  "active",
  "planning",
  "paused",
  "someday",
  "done",
];

/** A new project, and one whose status is empty or unknown, is planning. */
export const defaultProjectStatus: ProjectStatus = "planning";

export interface Project {
  readonly id: ProjectId;
  /** The block's own text; a page's is its alias. */
  readonly text: string;
  readonly status: ProjectStatus;
  /** What counts as done (GLOSSARY: 目标); only recorded. */
  readonly goal: string | null;
  readonly start: CalendarDate | null;
  readonly due: CalendarDate | null;
  /** Inherited by the score of its tasks, as an ancestor task's (ADR 0019). */
  readonly importance: Rating;
  readonly urgency: Rating;
  /** When the block was created. */
  readonly created: Date;
}

/**
 * The project properties the project panel writes and their new values
 * (GLOSSARY: 项目属性面板), the project status apart. Only those present
 * are written; `null` clears one.
 */
export interface ProjectChanges {
  readonly goal?: string | null;
  readonly start?: CalendarDate | null;
  readonly due?: CalendarDate | null;
  readonly importance?: Rating;
  readonly urgency?: Rating;
}

/**
 * Only an active project lets its tasks be next actions (GLOSSARY: 下一步行
 * 动, 项目状态).
 */
export function projectAllowsNextAction(status: ProjectStatus): boolean {
  return status === "active";
}
