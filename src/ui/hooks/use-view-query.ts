// What a view shows from one use case read: loading, the data, the failure,
// or that task features are paused. One query is shared by everything that
// shows the same data (the view and its count in the navigation). It reads
// when its first watcher arrives and again on every task change signal
// (ADR 0007), keeping what is shown until the new read ends. Verified by hand
// in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { ChangeSignalSource } from "../../shared/change-signal";
import { createLatestRead, type ReadOutcome } from "./latest-read";

export type ViewQueryState<T> = { readonly kind: "loading" } | ReadOutcome<T>;

export interface ViewQuery<T> {
  current(): ViewQueryState<T>;
  /**
   * Calls `listener` on every change; returns the unsubscribe function. The
   * first subscriber starts the query (a read from scratch, then a read on
   * every change signal); when the last one leaves it stops and forgets what
   * it read, so the next opening starts from what the notes hold then.
   */
  subscribe(listener: () => void): () => void;
  /** Reads from scratch: shows loading until the read ends. */
  reset(): void;
  /**
   * Reads again while started (e.g. its read's input changed), keeping what
   * is shown until the read ends. Does nothing while stopped: the next start
   * reads anyway.
   */
  reload(): void;
}

/**
 * A query over `read`, read again on every signal of `changes`. Only the
 * latest read's outcome is kept.
 */
export function createViewQuery<T>(
  read: () => Promise<T>,
  changes: ChangeSignalSource,
): ViewQuery<T> {
  let state: ViewQueryState<T> = { kind: "loading" };
  let stopChanges: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const set = (next: ViewQueryState<T>) => {
    state = next;
    for (const listener of [...listeners]) listener();
  };
  const reads = createLatestRead(read, set);
  /** Reads again, keeping what is shown until the read ends. */
  const load = () => reads.run();
  const reset = () => {
    set({ kind: "loading" });
    load();
  };

  return {
    current: () => state,
    subscribe(listener) {
      listeners.add(listener);
      if (!stopChanges) {
        stopChanges = changes.subscribe(load);
        reset();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0 || !stopChanges) return;
        stopChanges();
        stopChanges = undefined;
        // A read still under way is ignored; nothing stale shows next time.
        reads.cancel();
        state = { kind: "loading" };
      };
    },
    reset,
    reload() {
      if (stopChanges) load();
    },
  };
}

/** The query's current state, following its changes. */
export function useViewQuery<T>(query: ViewQuery<T>): ViewQueryState<T> {
  const [state, setState] = React.useState(query.current);
  React.useEffect(() => {
    const unsubscribe = query.subscribe(() => setState(query.current()));
    // It may have changed between render and subscribing.
    setState(query.current());
    return unsubscribe;
  }, [query]);
  return state;
}
