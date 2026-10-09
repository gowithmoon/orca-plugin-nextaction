// The next action view's filter as the user set it (#55). It lives in the
// plugin instance's memory: switching views and closing the plugin panel keep
// it; unloading clears it (platform/panel-feature.ts), and it is never written
// with `plugins.setData`.
import type { NextActionFilter } from "../../../application/usecases/read-next-actions";

/** Every dimension given, nothing chosen in any. */
export type FullNextActionFilter = Required<NextActionFilter>;

export const noFilter: FullNextActionFilter = {
  contexts: { values: [], none: false },
  labels: { values: [], none: false },
  importance: [],
};

export interface NextActionFilterStore {
  current(): FullNextActionFilter;
  set(filter: FullNextActionFilter): void;
  /** Back to no filter. */
  clear(): void;
  /** Calls `listener` on every change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

export function createNextActionFilterStore(): NextActionFilterStore {
  let filter = noFilter;
  const listeners = new Set<() => void>();
  const set = (next: FullNextActionFilter) => {
    if (next === filter) return;
    filter = next;
    for (const listener of [...listeners]) listener();
  };
  return {
    current: () => filter,
    set,
    clear: () => set(noFilter),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
