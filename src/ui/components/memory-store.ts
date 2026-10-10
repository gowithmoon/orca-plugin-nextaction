// A value kept in the plugin instance's memory that views follow: the shape
// every view store shares (filters, sort, collapsed nodes, the done
// section). Lives as long as the plugin instance; never written with
// `plugins.setData`.

export interface MemoryStore<T> {
  current(): T;
  /** Replaces the value; one the same as the current one changes nothing. */
  set(next: T): void;
  /** Calls `listener` on every change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

/** A store starting at `initial`; `same` says when a value changes nothing. */
export function createMemoryStore<T>(
  initial: T,
  same: (a: T, b: T) => boolean = Object.is,
): MemoryStore<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    current: () => value,
    set(next) {
      if (same(next, value)) return;
      value = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
