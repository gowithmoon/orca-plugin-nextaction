// The all tasks view's sort as the user chose it (#68). It lives in the
// plugin instance's memory, like the next action view's filter: switching
// views and closing the plugin panel keep it; unloading puts it back to note
// order (platform/panel-feature.ts), and it is never written with
// `plugins.setData`.
import type { AllTasksSort } from "../../../application/usecases/read-all-tasks";

export interface AllTasksSortStore {
  current(): AllTasksSort;
  set(sort: AllTasksSort): void;
  /** Back to note order. */
  clear(): void;
  /** Calls `listener` on every change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

export function createAllTasksSortStore(): AllTasksSortStore {
  let sort: AllTasksSort = "note";
  const listeners = new Set<() => void>();
  const set = (next: AllTasksSort) => {
    if (next === sort) return;
    sort = next;
    for (const listener of [...listeners]) listener();
  };
  return {
    current: () => sort,
    set,
    clear: () => set("note"),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
