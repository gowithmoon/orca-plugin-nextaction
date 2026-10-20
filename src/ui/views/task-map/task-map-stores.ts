// The task map's state (#213, #217), in the plugin instance's memory: the pan
// and zoom, the project filter and the two toggles, so switching away and
// back keeps them; and the task an endpoint marker asked to be located,
// until the map shows it; the collapsed boxes and the selected task (#218),
// the collapse state kept as the all tasks view keeps its own, under its own
// keys. Unloading clears it through `clear` (platform/panel-feature.ts);
// never written with `plugins.setData`.
import type { TaskMapInput } from "../../../application/usecases/read-task-map";
import type { TaskId } from "../../../domain/task/task";
import {
  createIdSetStore,
  type IdSetStore,
} from "../../components/id-set-store";
import {
  createMemoryStore,
  type MemoryStore,
} from "../../components/memory-store";
import { noTaskMapFilter } from "./task-map-filter";

/** Where the canvas looks: the world's offset on screen, and its scale. */
export interface CanvasView {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/**
 * A box on the map that collapses: a parent task's (`task:<id>`) or a
 * project's (`project:<id>`), keyed apart as a block may be both (ADR 0025).
 */
export type TaskMapBoxKey = string;

export interface TaskMapStores {
  /** `null` until the map is first fitted to the window (on first entry). */
  readonly view: MemoryStore<CanvasView | null>;
  /**
   * The project filter and the two toggles (#217): every area, done tasks
   * and tasks with no relation hidden by default.
   */
  readonly filter: MemoryStore<TaskMapInput>;
  /** The task to center the canvas on once the map shows it. */
  readonly locate: MemoryStore<TaskId | null>;
  /** The boxes collapsed; none at first (all expanded). */
  readonly collapsed: IdSetStore<TaskMapBoxKey>;
  /** The task whose chain is highlighted, `null` for none. */
  readonly selected: MemoryStore<TaskId | null>;
  /** Clears them all. */
  clear(): void;
}

export function createTaskMapStores(): TaskMapStores {
  const view = createMemoryStore<CanvasView | null>(null);
  const filter = createMemoryStore<TaskMapInput>(noTaskMapFilter);
  const locate = createMemoryStore<TaskId | null>(null);
  const collapsed = createIdSetStore<TaskMapBoxKey>();
  const selected = createMemoryStore<TaskId | null>(null);
  return {
    view,
    filter,
    locate,
    collapsed,
    selected,
    clear: () => {
      view.set(null);
      filter.set(noTaskMapFilter);
      locate.set(null);
      collapsed.clear();
      selected.set(null);
    },
  };
}
