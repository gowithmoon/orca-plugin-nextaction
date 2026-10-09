import type { CalendarDate, Effort, Importance, TaskStatus } from "./task";

/**
 * The task properties to write and their new values. Only the properties
 * present are written; `null` clears a property, as does an empty list.
 */
export interface TaskChanges {
  readonly status?: TaskStatus;
  readonly importance?: Importance;
  readonly effort?: Effort;
  readonly start?: CalendarDate | null;
  readonly due?: CalendarDate | null;
  readonly contexts?: readonly string[];
  readonly labels?: readonly string[];
  readonly note?: string | null;
  readonly sequential?: boolean;
}
