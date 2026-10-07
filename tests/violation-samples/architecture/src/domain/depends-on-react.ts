// Violation sample: domain depends on React, application and platform.
import "react";
import type { CaptureTask } from "../application/usecases/capture-task";
import { settingsDefinition } from "../platform/settings";

export type Input = [CaptureTask, typeof settingsDefinition];
