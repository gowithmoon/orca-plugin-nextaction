// The stats view's selection (GLOSSARY: 统计视图, #137): a cell of the
// completion chart or an item of a distribution, one at a time. It lives as
// long as the view shows; switching the scale, paging and switching the
// distribution's dimension clear it (stats-view.tsx). Pressing the selected
// one again clears it too.
import type { DistributionPick } from "../../../domain/stats/distributions";
import type { StatsSelection } from "../../../domain/stats/stats-selection";
import { compareDays } from "../../../domain/time/calendar-days";
import {
  createMemoryStore,
  type MemoryStore,
} from "../../components/memory-store";

export type StatsSelectionStore = MemoryStore<StatsSelection | undefined> & {
  /** Selects `selection`, or clears it when it is the one selected. */
  toggle(selection: StatsSelection): void;
  /** Nothing selected. */
  clear(): void;
};

/** The selection of a distribution's item, without its count. */
export function itemSelection(item: DistributionPick): StatsSelection {
  // Two branches alike, so each keeps its dimension's value type.
  return item.dimension === "importance"
    ? { kind: "distribution", dimension: item.dimension, value: item.value }
    : { kind: "distribution", dimension: item.dimension, value: item.value };
}

/** Whether two distribution items are the same one. */
function samePick(a: DistributionPick, b: DistributionPick): boolean {
  return a.dimension === b.dimension && a.value === b.value;
}

/** Whether two selections are the same one. */
export function sameSelection(
  a: StatsSelection | undefined,
  b: StatsSelection | undefined,
): boolean {
  if (a === undefined || b === undefined) return a === b;
  if (a.kind === "cell" && b.kind === "cell") {
    return (
      compareDays(a.first, b.first) === 0 && compareDays(a.last, b.last) === 0
    );
  }
  if (a.kind === "distribution" && b.kind === "distribution") {
    return samePick(a, b);
  }
  return false;
}

export function createStatsSelectionStore(): StatsSelectionStore {
  const store = createMemoryStore<StatsSelection | undefined>(
    undefined,
    sameSelection,
  );
  return {
    ...store,
    toggle(selection) {
      store.set(
        sameSelection(store.current(), selection) ? undefined : selection,
      );
    },
    clear: () => store.set(undefined),
  };
}
