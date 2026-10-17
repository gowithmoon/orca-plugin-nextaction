// The project gantt chart's state (#186), in the plugin instance's memory
// apart from the tree's and the board's: which tasks are expanded (by task,
// collapsed by default, so only the project root tasks show), whether the
// unplaced tasks' section is collapsed (#177; open by default), and the time
// scale (#179, the week scale by default, one choice for every project).
// Unloading clears it through `clear` (platform/panel-feature.ts); never
// written with `plugins.setData`.
import type { TaskId } from "../../../domain/task/task";
import {
  createIdSetStore,
  type IdSetStore,
} from "../../components/id-set-store";
import {
  createMemoryStore,
  type MemoryStore,
} from "../../components/memory-store";
import type { GanttScale } from "./gantt-axis";

export interface ProjectGanttStores {
  /** The tasks whose subtasks show in the task tree; collapsed by default. */
  readonly expanded: IdSetStore<TaskId>;
  /** The unplaced tasks' section is collapsed; open by default (#177). */
  readonly unplacedCollapsed: MemoryStore<boolean>;
  /** The time scale (#179); the week scale by default, never a setting. */
  readonly scale: MemoryStore<GanttScale>;
  /** Clears them all. */
  clear(): void;
}

export function createProjectGanttStores(): ProjectGanttStores {
  const expanded = createIdSetStore<TaskId>();
  const unplacedCollapsed = createMemoryStore(false);
  const scale = createMemoryStore<GanttScale>("week");
  return {
    expanded,
    unplacedCollapsed,
    scale,
    clear: () => {
      expanded.clear();
      unplacedCollapsed.set(false);
      scale.set("week");
    },
  };
}
