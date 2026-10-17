// The project board's state (#166), in the plugin instance's memory apart
// from the tree's: its sort (by score by default, kept apart from the
// tree's) and its done column (open by default, collapsible to a narrow
// strip; earlier done cards shown or not). Unloading clears them through `clear`
// (platform/panel-feature.ts); never written with `plugins.setData`. With
// them the board's collapsed cards (#167), and its grouping, its columns'
// "Done N" and its opened finished columns (#171).
import type { BoardGrouping } from "../../../application/usecases/read-project-board";
import type { TaskId } from "../../../domain/task/task";
import {
  createIdSetStore,
  type IdSetStore,
} from "../../components/id-set-store";
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
  /**
   * How the board groups its columns (GLOSSARY: 分列方式, #171), one choice
   * for every project; by status by default, never a setting.
   */
  readonly grouping: BoardGroupingStore;
  /**
   * By project root task (#171): the columns whose "Done N" is open, by
   * their project root task, `"other"` for "Other"; collapsed by default.
   */
  readonly doneOpen: IdSetStore<TaskId | "other">;
  /**
   * By project root task (#171): the finished columns opened from their
   * narrow strip, by their project root task.
   */
  readonly finishedOpen: IdSetStore<TaskId>;
  /** Clears them all. */
  clear(): void;
}

export interface BoardGroupingStore {
  current(): BoardGrouping;
  set(grouping: BoardGrouping): void;
  subscribe(listener: () => void): () => void;
}

/** The expanded cards' tasks (#167). */
export type ExpandedCardsStore = IdSetStore<TaskId>;

export function createProjectBoardStores(): ProjectBoardStores {
  const sort = createAllTasksSortStore("score");
  // Open by default: the board shows what was done at full width.
  const doneColumn = createDoneSectionStore({
    expanded: true,
    showEarlier: false,
  });
  const expanded = createIdSetStore<TaskId>();
  const grouping = createMemoryStore<BoardGrouping>("status");
  const doneOpen = createIdSetStore<TaskId | "other">();
  const finishedOpen = createIdSetStore<TaskId>();
  return {
    sort,
    doneColumn,
    expanded,
    grouping,
    doneOpen,
    finishedOpen,
    clear: () => {
      sort.clear();
      doneColumn.clear();
      expanded.clear();
      grouping.set("status");
      doneOpen.clear();
      finishedOpen.clear();
    },
  };
}
