/** A one-line, human-readable description of a thrown value. */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
