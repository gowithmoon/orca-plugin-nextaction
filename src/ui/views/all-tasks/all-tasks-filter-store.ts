// The all tasks view's filter and search text as the user set them (#69).
// They live in the plugin instance's memory, apart from the next action
// view's filter: switching views and closing the plugin panel keep them;
// unloading clears them (platform/panel-feature.ts), and they are never
// written with `plugins.setData`.
import type { AllTasksFilter } from "../../../application/usecases/read-all-tasks";
import { filterChoosesAny } from "../../../domain/task/task-filter";
import { createMemoryStore } from "../../components/memory-store";

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
  return (
    state.filter.statuses.length > 0 ||
    filterChoosesAny(state.filter) ||
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
  const store = createMemoryStore(noAllTasksFilter);
  return { ...store, clear: () => store.set(noAllTasksFilter) };
}
