// The project board's state (#166), in the plugin instance's memory apart
// from the tree's: its sort (by score by default, kept apart from the
// tree's) and its done column (collapsed to a narrow strip by default;
// earlier done cards shown or not). Unloading clears them through `clear`
// (platform/panel-feature.ts); never written with `plugins.setData`. Later
// steps add the board's collapsed cards (#167).
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
  /** Clears both. */
  clear(): void;
}

export function createProjectBoardStores(): ProjectBoardStores {
  const sort = createAllTasksSortStore("score");
  const doneColumn = createDoneSectionStore();
  return {
    sort,
    doneColumn,
    clear: () => {
      sort.clear();
      doneColumn.clear();
    },
  };
}
