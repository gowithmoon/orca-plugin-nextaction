// The all tasks view's collapsed nodes (#67). They live in the plugin
// instance's memory, like the next action view's filter: switching views and
// closing the plugin panel keep them; unloading clears them
// (platform/panel-feature.ts), and they are never written with
// `plugins.setData`. A collapsed task no longer in the tree has no effect.
import type { TaskId } from "../../../domain/task/task";
import { createMemoryStore } from "../../components/memory-store";

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
  const store = createMemoryStore<ReadonlySet<TaskId>>(new Set());
  return {
    current: store.current,
    toggle(id) {
      const next = new Set(store.current());
      if (!next.delete(id)) next.add(id);
      store.set(next);
    },
    collapse(ids) {
      const collapsed = store.current();
      if (ids.every((id) => collapsed.has(id))) return;
      store.set(new Set([...collapsed, ...ids]));
    },
    clear() {
      if (store.current().size > 0) store.set(new Set());
    },
    subscribe: store.subscribe,
  };
}
