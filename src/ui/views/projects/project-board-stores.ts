// The project board's state (#166), in the plugin instance's memory apart
// from the tree's: its sort (by score by default, kept apart from the
// tree's) and its done column (collapsed to a narrow strip by default;
// earlier done cards shown or not). Unloading clears them through `clear`
// (platform/panel-feature.ts); never written with `plugins.setData`. Later
// steps add the board's collapsed cards (#167).
import type { TaskId } from "../../../domain/task/task";
import { createMemoryStore } from "../../components/memory-store";
import {
  type AllTasksSortStore,
  createAllTasksSortStore,
} from "../all-tasks/all-tasks-sort-store";
import {
  createDoneSectionStore,
  type DoneSectionStore,
} from "../all-tasks/done-section-store";

export interface ProjectBoardStores {
  readonly sort: AllTasksSortStore;
  /** `expanded`: the done column is open; `showEarlier`: so are earlier cards. */
  readonly doneColumn: DoneSectionStore;
  /** The cards whose subtasks are expanded (#167); collapsed by default. */
  readonly expanded: ExpandedCardsStore;
  /** Clears them all. */
  clear(): void;
}

export interface ExpandedCardsStore {
  /** The expanded cards' tasks; a new set after every change. */
  current(): ReadonlySet<TaskId>;
  /** Expands the card if collapsed, collapses it if expanded. */
  toggle(id: TaskId): void;
  /** Sets every one of `ids` expanded or not ("expand all", "collapse all"). */
  setAll(ids: readonly TaskId[], expanded: boolean): void;
  subscribe(listener: () => void): () => void;
}

function createExpandedCardsStore(): ExpandedCardsStore & { clear(): void } {
  const store = createMemoryStore<ReadonlySet<TaskId>>(new Set());
  return {
    current: store.current,
    toggle(id) {
      const next = new Set(store.current());
      if (!next.delete(id)) next.add(id);
      store.set(next);
    },
    setAll(ids, expanded) {
      const current = store.current();
      if (ids.every((id) => current.has(id) === expanded)) return;
      const next = new Set(current);
      for (const id of ids) {
        if (expanded) next.add(id);
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

export function createProjectBoardStores(): ProjectBoardStores {
  const sort = createAllTasksSortStore("score");
  const doneColumn = createDoneSectionStore();
  const expanded = createExpandedCardsStore();
  return {
    sort,
    doneColumn,
    expanded,
    clear: () => {
      sort.clear();
      doneColumn.clear();
      expanded.clear();
    },
  };
}
