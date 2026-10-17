// The project gantt chart's state (#186), in the plugin instance's memory
// apart from the tree's and the board's: which tasks are expanded (by task,
// collapsed by default, so only the project root tasks show). The scale
// (#179) and the unplaced tasks' section (#177) join it later. Unloading
// clears it through `clear` (platform/panel-feature.ts); never written with
// `plugins.setData`.
import type { TaskId } from "../../../domain/task/task";
import { createIdSetStore, type IdSetStore } from "./project-board-stores";

export interface ProjectGanttStores {
  /** The tasks whose subtasks show in the task tree; collapsed by default. */
  readonly expanded: IdSetStore<TaskId>;
  /** Clears them all. */
  clear(): void;
}

export function createProjectGanttStores(): ProjectGanttStores {
  const expanded = createIdSetStore<TaskId>();
  return {
    expanded,
    clear: () => {
      expanded.clear();
    },
  };
}
