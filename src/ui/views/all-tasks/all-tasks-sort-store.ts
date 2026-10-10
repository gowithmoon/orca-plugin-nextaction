// The all tasks view's sort as the user chose it (#68). It lives in the
// plugin instance's memory, like the next action view's filter: switching
// views and closing the plugin panel keep it; unloading puts it back to note
// order (platform/panel-feature.ts), and it is never written with
// `plugins.setData`.
import type { AllTasksSort } from "../../../application/usecases/read-all-tasks";
import { createMemoryStore } from "../../components/memory-store";

export interface AllTasksSortStore {
  current(): AllTasksSort;
  set(sort: AllTasksSort): void;
  /** Back to note order. */
  clear(): void;
  /** Calls `listener` on every change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

export function createAllTasksSortStore(): AllTasksSortStore {
  const store = createMemoryStore<AllTasksSort>("note");
  return { ...store, clear: () => store.set("note") };
}
