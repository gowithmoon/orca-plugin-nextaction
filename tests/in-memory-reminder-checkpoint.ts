// A ReminderCheckpointStore for tests: it holds the moment in memory.
import type { ReminderCheckpointStore } from "../src/application/ports/reminder-checkpoint";

export interface InMemoryReminderCheckpoint extends ReminderCheckpointStore {
  /** The moment held now, without going through `read`. */
  current(): Date | null;
}

export function createInMemoryReminderCheckpoint(
  at: Date | string | null = null,
): InMemoryReminderCheckpoint {
  let held = at === null ? null : new Date(at);
  return {
    // A copy, so a caller mutating the Date cannot move the moment.
    read: async () => (held === null ? null : new Date(held)),
    async write(next) {
      held = new Date(next);
    },
    current: () => (held === null ? null : new Date(held)),
  };
}
