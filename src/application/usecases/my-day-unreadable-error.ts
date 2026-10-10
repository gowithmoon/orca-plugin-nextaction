// Shared by the My Day use cases that write a task's entries.

/**
 * The task's My Day entries hold something this plugin cannot read (an
 * unknown version, or damaged), so they cannot be changed: writing would
 * overwrite them. Nothing was written.
 */
export class MyDayUnreadableError extends Error {
  override name = "MyDayUnreadableError";
}
