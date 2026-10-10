// The all tasks view's collapsed nodes (#67). They live in the plugin
// instance's memory, like the next action view's filter: switching views and
// closing the plugin panel keep them; unloading clears them
// (platform/panel-feature.ts), and they are never written with
// `plugins.setData`. A collapsed task no longer in the tree has no effect.
import type { TaskId } from "../../../domain/task/task";

export interface AllTasksCollapseStore {
  /** The collapsed tasks; a new set after every change. */
  current(): ReadonlySet<TaskId>;
  /** Collapses `id` if expanded, expands it if collapsed. */
  toggle(id: TaskId): void;
  /** Collapses every one of `ids` ("collapse all"). */
  collapse(ids: readonly TaskId[]): void;
  /** Expands every node ("expand all"); also what unloading does. */
  clear(): void;
  /** Calls `listener` on every change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

export function createAllTasksCollapseStore(): AllTasksCollapseStore {
  let collapsed: ReadonlySet<TaskId> = new Set();
  const listeners = new Set<() => void>();
  const set = (next: ReadonlySet<TaskId>) => {
    collapsed = next;
    for (const listener of [...listeners]) listener();
  };
  return {
    current: () => collapsed,
    toggle(id) {
      const next = new Set(collapsed);
      if (!next.delete(id)) next.add(id);
      set(next);
    },
    collapse(ids) {
      if (ids.every((id) => collapsed.has(id))) return;
      set(new Set([...collapsed, ...ids]));
    },
    clear() {
      if (collapsed.size > 0) set(new Set());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
