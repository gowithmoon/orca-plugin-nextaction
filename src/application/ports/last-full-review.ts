/**
 * When the last full review (GLOSSARY: 完整回顾) was completed. Not task
 * data: discardable (ADR 0001), so anything that cannot be read is no
 * moment, as if no full review had been completed yet.
 */
export interface LastFullReviewStore {
  /** The moment, or `null` when there is none or it cannot be read. */
  read(): Promise<Date | null>;
  /** Records `at`. Errors are thrown as they are. */
  write(at: Date): Promise<void>;
}
