// Dates for Orca's journals (journal-capture): `get-journal-block` picks the
// journal by the LOCAL date of the time passed, and the repository passes the
// capture time `now` unchanged; `nav.goTo`/`replace("journal", { date })`
// needs the date's UTC midnight as a `Date`. Journal view arguments are made
// here only (docs/ARCHITECTURE.md §4 日记与日期).

/**
 * The `date` of a journal view's arguments as the `Date` navigation needs, or
 * `undefined` when it is not a date. The value is one Orca gave out (a
 * journal panel's `viewArgs.date`, already a UTC midnight); only its type is
 * corrected: a wrong type crashes the whole of Orca (editor-sidetool-panel,
 * round 3).
 */
export function journalViewDate(value: unknown): Date | undefined {
  const date =
    value instanceof Date
      ? value
      : typeof value === "string" || typeof value === "number"
        ? new Date(value)
        : undefined;
  return date && !Number.isNaN(date.getTime()) ? date : undefined;
}
