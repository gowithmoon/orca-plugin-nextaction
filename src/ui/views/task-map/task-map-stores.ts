// The task map's state (#213), in the plugin instance's memory: the pan and
// zoom, so switching away and back keeps them. Unloading clears it through
// `clear` (platform/panel-feature.ts); never written with `plugins.setData`.
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

export interface TaskMapStores {
  /** `null` until the map is first fitted to the window (on first entry). */
  readonly view: MemoryStore<CanvasView | null>;
  /** Clears them all. */
  clear(): void;
}

export function createTaskMapStores(): TaskMapStores {
  const view = createMemoryStore<CanvasView | null>(null);
  return {
    view,
    clear: () => view.set(null),
  };
}
