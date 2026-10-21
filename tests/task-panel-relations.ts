// One part of the task panel's relations (read-task-panel-relations), read
// as the panel reads them, for the tests of each part.
import type { StartPreviewDaysSetting } from "../src/application/ports/start-preview-days-setting";
import type { TaskRepository } from "../src/application/ports/task-repository";
import {
  createReadTaskPanelRelations,
  type TaskPanelRelations,
} from "../src/application/usecases/read-task-panel-relations";
import type { TaskId } from "../src/domain/task/task";
import { createFixedClock } from "./fixed-clock";
import { createFixedDayBoundary } from "./fixed-day-boundary";
import { createFixedStartPreviewDays } from "./fixed-start-preview-days";

/** 2026-10-09 10:00 in UTC+8: the logical day 2026-10-09. */
const morning = "2026-10-09T10:00:00+08:00";

export function readTaskPanelPart<K extends keyof TaskPanelRelations>(
  repository: TaskRepository,
  part: K,
  startPreviewDays: StartPreviewDaysSetting = createFixedStartPreviewDays(),
): (id: TaskId) => Promise<TaskPanelRelations[K]> {
  const read = createReadTaskPanelRelations({
    repository,
    clock: createFixedClock(morning),
    dayBoundary: createFixedDayBoundary(),
    startPreviewDays,
  });
  return async (id) => (await read(id))[part];
}
