/**
 * The moment reminders were last checked up to (GLOSSARY: 错过的提醒). Not
 * task data: discardable (ADR 0001), so anything that cannot be read is no
 * moment, and checking starts from now without catching up.
 */
export interface ReminderCheckpointStore {
  /** The moment, or `null` when there is none or it cannot be read. */
  read(): Promise<Date | null>;
  /** Records `at`. Errors are thrown as they are. */
  write(at: Date): Promise<void>;
}
