// The all tasks view's done section (GLOSSARY: 已完成区, #66) as the user left
// it: expanded or not, and whether it shows earlier items. It lives in the
// plugin instance's memory: switching views and closing the plugin panel keep
// it; unloading clears it (platform/panel-feature.ts), and it is never written
// with `plugins.setData`.

export interface DoneSectionState {
  /** Expanded; collapsed by default, rendering nothing of its items. */
  readonly expanded: boolean;
  /** Every item, not only those of the last 30 logical days. */
  readonly showEarlier: boolean;
}

const initial: DoneSectionState = { expanded: false, showEarlier: false };

export interface DoneSectionStore {
  current(): DoneSectionState;
  set(state: DoneSectionState): void;
  /** Back to collapsed, recent items only. */
  clear(): void;
  /** Calls `listener` on every change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

export function createDoneSectionStore(): DoneSectionStore {
  let state = initial;
  const listeners = new Set<() => void>();
  const set = (next: DoneSectionState) => {
    if (
      next.expanded === state.expanded &&
      next.showEarlier === state.showEarlier
    ) {
      return;
    }
    state = next;
    for (const listener of [...listeners]) listener();
  };
  return {
    current: () => state,
    set,
    clear: () => set(initial),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
