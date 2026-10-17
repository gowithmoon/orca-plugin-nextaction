// A set of IDs in the plugin instance's memory, each on or off: the
// collapsed or opened rows, cards and columns of the project board and the
// gantt chart. Never written with `plugins.setData`.
import { createMemoryStore } from "./memory-store";

/** A set of IDs in memory, each on or off; a new set after every change. */
export interface IdSetStore<Id> {
  current(): ReadonlySet<Id>;
  /** Turns the ID on if off, off if on. */
  toggle(id: Id): void;
  /** Sets every one of `ids` on or off. */
  setAll(ids: readonly Id[], on: boolean): void;
  subscribe(listener: () => void): () => void;
}

export function createIdSetStore<Id>(): IdSetStore<Id> & { clear(): void } {
  const store = createMemoryStore<ReadonlySet<Id>>(new Set());
  return {
    current: store.current,
    toggle(id) {
      const next = new Set(store.current());
      if (!next.delete(id)) next.add(id);
      store.set(next);
    },
    setAll(ids, on) {
      const current = store.current();
      if (ids.every((id) => current.has(id) === on)) return;
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      store.set(next);
    },
    clear() {
      if (store.current().size > 0) store.set(new Set());
    },
    subscribe: store.subscribe,
  };
}
