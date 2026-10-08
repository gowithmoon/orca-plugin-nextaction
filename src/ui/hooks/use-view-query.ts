// What a view shows from one use case read: loading, the data or the
// failure. One query is shared by everything that shows the same data (the
// view and its count in the navigation). #37 reads on mount only; #38 adds
// automatic refresh on top of `load`. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";

export type ViewQueryState<T> =
  | { readonly kind: "loading" }
  | { readonly kind: "loaded"; readonly data: T }
  | { readonly kind: "failed"; readonly error: unknown };

export interface ViewQuery<T> {
  current(): ViewQueryState<T>;
  /** Calls `listener` on every change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Reads from scratch: shows loading until the read ends. */
  reset(): void;
  /** Reads again, keeping what is shown until the read ends. */
  load(): void;
}

/** A query over `read`. Only the latest read's outcome is kept. */
export function createViewQuery<T>(read: () => Promise<T>): ViewQuery<T> {
  let state: ViewQueryState<T> = { kind: "loading" };
  let latest = 0;
  const listeners = new Set<() => void>();
  const set = (next: ViewQueryState<T>) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const load = () => {
    latest += 1;
    const mine = latest;
    read().then(
      (data) => {
        if (mine === latest) set({ kind: "loaded", data });
      },
      (error: unknown) => {
        if (mine === latest) set({ kind: "failed", error });
      },
    );
  };

  return {
    current: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset() {
      set({ kind: "loading" });
      load();
    },
    load,
  };
}

/** The query's current state, following its changes. */
export function useViewQuery<T>(query: ViewQuery<T>): ViewQueryState<T> {
  const [state, setState] = React.useState(query.current);
  React.useEffect(() => {
    // It may have changed between render and subscribing.
    setState(query.current());
    return query.subscribe(() => setState(query.current()));
  }, [query]);
  return state;
}
