// Shared by the use cases that write a task's review plan: setting it and
// marking the task reviewed.

/**
 * The task's review plan holds something this plugin cannot read (an unknown
 * version, a value out of range), so it cannot be changed: writing would
 * overwrite it. Nothing was written. `reason` says what could not be read,
 * for the user's notice.
 */
export class ReviewUnreadableError extends Error {
  override name = "ReviewUnreadableError";

  constructor(readonly reason: string) {
    super(`the review plan cannot be read (${reason})`);
  }
}
