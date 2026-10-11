// Shared by the use cases that advance a recurring task (GLOSSARY: 安排下一次):
// completing, skipping, resuming and the repair of a task not advanced.

/**
 * A recurrence rule holds something this plugin cannot read (an unknown
 * version, a missing field, a value out of range), the task's own or a done
 * descendant task's, so the task cannot advance: whether and where it, or
 * that descendant, advances is unknown. Nothing was written. `reason` says
 * what could not be read, for the user's notice.
 */
export class RecurrenceUnreadableError extends Error {
  override name = "RecurrenceUnreadableError";

  constructor(readonly reason: string) {
    super(`the recurrence rule cannot be read (${reason})`);
  }
}
