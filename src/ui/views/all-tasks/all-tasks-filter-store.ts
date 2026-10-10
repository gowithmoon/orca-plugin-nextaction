// The all tasks view's filter and search text as the user set them (#69).
// They live in the plugin instance's memory, apart from the next action
// view's filter: switching views and closing the plugin panel keep them;
// unloading clears them (platform/panel-feature.ts), and they are never
// written with `plugins.setData`.
import type { AllTasksFilter } from "../../../application/usecases/read-all-tasks";

export interface AllTasksFilterState {
  /** Every dimension given, nothing chosen in any. */
  readonly filter: Required<AllTasksFilter>;
  /** As typed. */
  readonly search: string;
}

export const noAllTasksFilter: AllTasksFilterState = {
  filter: {
    statuses: [],
    contexts: { values: [], none: false },
    labels: { values: [], none: false },
    importance: [],
  },
  search: "",
};

/** Something is chosen in some dimension, or there are words to search. */
export function isFilteringAllTasks(state: AllTasksFilterState): boolean {
  const { filter } = state;
  return (
    filter.statuses.length > 0 ||
    filter.contexts.values.length > 0 ||
    filter.contexts.none ||
    filter.labels.values.length > 0 ||
    filter.labels.none ||
    filter.importance.length > 0 ||
    state.search.trim() !== ""
  );
}

export interface AllTasksFilterStore {
  current(): AllTasksFilterState;
  set(state: AllTasksFilterState): void;
  /** Back to no filter and no search text. */
  clear(): void;
  /** Calls `listener` on every change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

export function createAllTasksFilterStore(): AllTasksFilterStore {
  let state = noAllTasksFilter;
  const listeners = new Set<() => void>();
  const set = (next: AllTasksFilterState) => {
    if (next === state) return;
    state = next;
    for (const listener of [...listeners]) listener();
  };
  return {
    current: () => state,
    set,
    clear: () => set(noAllTasksFilter),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
