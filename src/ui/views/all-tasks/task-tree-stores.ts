// The four stores of a task tree's state (the all tasks view's, #65, and the
// project details', #157): collapsed nodes, sort, filter and search text, and
// the done section. They live in the plugin instance's memory; unloading
// clears them through `clear` (platform/panel-feature.ts).
import {
  type AllTasksCollapseStore,
  createAllTasksCollapseStore,
} from "./all-tasks-collapse-store";
import {
  type AllTasksFilterStore,
  createAllTasksFilterStore,
} from "./all-tasks-filter-store";
import {
  type AllTasksSortStore,
  createAllTasksSortStore,
} from "./all-tasks-sort-store";
import {
  createDoneSectionStore,
  type DoneSectionStore,
} from "./done-section-store";

export interface TaskTreeStores {
  readonly collapse: AllTasksCollapseStore;
  readonly sort: AllTasksSortStore;
  readonly filter: AllTasksFilterStore;
  readonly doneSection: DoneSectionStore;
  /** Clears all four. */
  clear(): void;
}

export function createTaskTreeStores(): TaskTreeStores {
  const collapse = createAllTasksCollapseStore();
  const sort = createAllTasksSortStore();
  const filter = createAllTasksFilterStore();
  const doneSection = createDoneSectionStore();
  return {
    collapse,
    sort,
    filter,
    doneSection,
    clear: () => {
      collapse.clear();
      sort.clear();
      filter.clear();
      doneSection.clear();
    },
  };
}
