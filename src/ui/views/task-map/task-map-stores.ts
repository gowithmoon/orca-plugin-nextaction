// The task map's state (#213, #217), in the plugin instance's memory: the pan
// and zoom, the project filter and the two toggles, so switching away and
// back keeps them; and the task an endpoint marker asked to be located,
// until the map shows it; the collapsed boxes and the selected task (#218),
// the collapse state kept as the all tasks view keeps its own, under its own
// keys; the boxes expanded for the time being to show a task located
// (#221), apart from the collapse state, which they leave as it is.
// Unloading clears it through `clear` (platform/panel-feature.ts);
// never written with `plugins.setData`.
import type { TaskMapInput } from "../../../application/usecases/read-task-map";
import type { ProjectId } from "../../../domain/project/project";
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
 * A box on the map: a parent task's (`task:<id>`) or a project's
 * (`project:<id>`), the two that collapse, keyed apart as a block may be both
 * (ADR 0025); or the no-project area's. Built only by `boxKey`.
 */
export type TaskMapBoxKey =
  | `task:${TaskId}`
  | `project:${ProjectId}`
  | "no-project";

/** The key of a task's box, a project's, or the no-project area's. */
export function boxKey(
  kind: "task" | "project",
  id: TaskId | ProjectId,
): TaskMapBoxKey;
export function boxKey(kind: "no-project"): TaskMapBoxKey;
export function boxKey(
  kind: "task" | "project" | "no-project",
  id?: number,
): TaskMapBoxKey {
  return kind === "no-project" ? kind : `${kind}:${id as number}`;
}

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
  /**
   * Collapsed boxes shown expanded for now, to show a task located (#221):
   * `collapsed` is left as it is; replaced by the next locate, emptied when
   * the view is left or every box is folded or unfolded.
   */
  readonly expanded: MemoryStore<ReadonlySet<TaskMapBoxKey>>;
  /** The task whose chain is highlighted, `null` for none. */
  readonly selected: MemoryStore<TaskId | null>;
  /** Clears them all. */
  clear(): void;
}

/** No box. */
export const noBoxes: ReadonlySet<TaskMapBoxKey> = new Set();

export function createTaskMapStores(): TaskMapStores {
  const view = createMemoryStore<CanvasView | null>(null);
  const filter = createMemoryStore<TaskMapInput>(noTaskMapFilter);
  const locate = createMemoryStore<TaskId | null>(null);
  const collapsed = createIdSetStore<TaskMapBoxKey>();
  const expanded = createMemoryStore<ReadonlySet<TaskMapBoxKey>>(noBoxes);
  const selected = createMemoryStore<TaskId | null>(null);
  return {
    view,
    filter,
    locate,
    collapsed,
    expanded,
    selected,
    clear: () => {
      view.set(null);
      filter.set(noTaskMapFilter);
      locate.set(null);
      collapsed.clear();
      expanded.set(noBoxes);
      selected.set(null);
    },
  };
}
