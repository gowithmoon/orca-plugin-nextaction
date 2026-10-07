// Violation sample: infra depends on application outside its ports. Importing
// a port, here and in index form, is allowed and must not be reported.
import type { Clock } from "../application/ports/clock";
import type { Ports } from "../application/ports";
import type { CaptureTask } from "../application/usecases/capture-task";

export type Wiring = [Clock, Ports, CaptureTask];
