// The task map's state (#213), in the plugin instance's memory: the pan and
// zoom, so switching away and back keeps them; the collapsed boxes and the
// selected task (#218). Unloading clears it through `clear`
// (platform/panel-feature.ts); never written with `plugins.setData`, the
// collapse state kept as the all tasks view keeps its own, under its own keys.
import type { TaskId } from "../../../domain/task/task";
import {
  createIdSetStore,
  type IdSetStore,
} from "../../components/id-set-store";
import {
  createMemoryStore,
  type MemoryStore,
} from "../../components/memory-store";

/** Where the canvas looks: the world's offset on screen, and its scale. */
export interface CanvasView {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/**
 * A box on the map that collapses: a parent task's (`task:<id>`), a
 * project's (`project:<id>`), the no-project area (`no-project`). Tasks and
 * projects keyed apart, as a block may be both (ADR 0025).
 */
export type TaskMapBoxKey = string;

export interface TaskMapStores {
  /** `null` until the map is first fitted to the window (on first entry). */
  readonly view: MemoryStore<CanvasView | null>;
  /** The boxes collapsed; none at first (all expanded). */
  readonly collapsed: IdSetStore<TaskMapBoxKey>;
  /** The task whose chain is highlighted, `null` for none. */
  readonly selected: MemoryStore<TaskId | null>;
  /** Clears them all. */
  clear(): void;
}

export function createTaskMapStores(): TaskMapStores {
  const view = createMemoryStore<CanvasView | null>(null);
  const collapsed = createIdSetStore<TaskMapBoxKey>();
  const selected = createMemoryStore<TaskId | null>(null);
  return {
    view,
    collapsed,
    selected,
    clear: () => {
      view.set(null);
      collapsed.clear();
      selected.set(null);
    },
  };
}
