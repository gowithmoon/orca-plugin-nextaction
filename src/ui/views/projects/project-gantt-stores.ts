// The project gantt chart's state (#186), in the plugin instance's memory
// apart from the tree's and the board's: which tasks are expanded (by task,
// collapsed by default, so only the project root tasks show), and whether
// the unplaced tasks' section is collapsed (#177; open by default). The
// scale (#179) joins it later. Unloading clears it through `clear`
// (platform/panel-feature.ts); never written with `plugins.setData`.
import type { TaskId } from "../../../domain/task/task";
import {
  createMemoryStore,
  type MemoryStore,
} from "../../components/memory-store";
import { createIdSetStore, type IdSetStore } from "./project-board-stores";

export interface ProjectGanttStores {
  /** The tasks whose subtasks show in the task tree; collapsed by default. */
  readonly expanded: IdSetStore<TaskId>;
  /** The unplaced tasks' section is collapsed; open by default (#177). */
  readonly unplacedCollapsed: MemoryStore<boolean>;
  /** Clears them all. */
  clear(): void;
}

export function createProjectGanttStores(): ProjectGanttStores {
  const expanded = createIdSetStore<TaskId>();
  const unplacedCollapsed = createMemoryStore(false);
  return {
    expanded,
    unplacedCollapsed,
    clear: () => {
      expanded.clear();
      unplacedCollapsed.set(false);
    },
  };
}
