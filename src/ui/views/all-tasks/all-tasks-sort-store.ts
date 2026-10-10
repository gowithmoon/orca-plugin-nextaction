// The all tasks view's sort as the user chose it (#68): the sort and its
// direction. It lives in the plugin instance's memory, like the next action
// view's filter: switching views and closing the plugin panel keep it;
// unloading puts it back to note order, ascending (platform/panel-feature.ts),
// and it is never written with `plugins.setData`.
import type {
  AllTasksSort,
  SortDirection,
} from "../../../application/usecases/read-all-tasks";
import { createMemoryStore } from "../../components/memory-store";

export interface AllTasksSortState {
  readonly sort: AllTasksSort;
  /** Kept while the sort changes; note order has none to show. */
  readonly direction: SortDirection;
}

export interface AllTasksSortStore {
  current(): AllTasksSortState;
  set(state: AllTasksSortState): void;
  /** Back to note order, ascending. */
  clear(): void;
  /** Calls `listener` on every change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

const initial: AllTasksSortState = { sort: "note", direction: "ascending" };

export function createAllTasksSortStore(): AllTasksSortStore {
  const store = createMemoryStore<AllTasksSortState>(
    initial,
    (a, b) => a.sort === b.sort && a.direction === b.direction,
  );
  return { ...store, clear: () => store.set(initial) };
}
