// Shared by the use cases that write a task's reminders.

/**
 * The task's reminders hold something this plugin cannot read (an unknown
 * version, a damaged value), so they cannot be changed: writing would
 * overwrite them. Nothing was written. `reason` says what could not be read,
 * for the user's notice.
 */
export class RemindersUnreadableError extends Error {
  override name = "RemindersUnreadableError";

  constructor(readonly reason: string) {
    super(`the reminders cannot be read (${reason})`);
  }
}
