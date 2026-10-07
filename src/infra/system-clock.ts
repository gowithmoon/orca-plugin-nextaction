import type { Clock } from "../application/ports/clock";

/** Reads the time from the system. */
export const systemClock: Clock = {
  now: () => new Date(),
};
