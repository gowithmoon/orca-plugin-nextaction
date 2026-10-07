// Violation sample: domain depends on infra.
import { systemClock } from "../infra/system-clock";

export const clock = systemClock;
