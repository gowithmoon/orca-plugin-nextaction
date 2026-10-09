// The start preview days (#56): how many days ahead an effective start may
// lie for a task to be a next action already. Pure.

/** The most days the setting allows. */
export const maxStartPreviewDays = 14;

/**
 * The start preview days a stored setting value stands for: a whole number
 * from 0 to 14 as it is; anything else (not a whole number, out of range,
 * empty) is 0, so a bad value never breaks the view.
 */
export function startPreviewDaysFrom(value: unknown): number {
  return Number.isInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= maxStartPreviewDays
    ? (value as number)
    : 0;
}
