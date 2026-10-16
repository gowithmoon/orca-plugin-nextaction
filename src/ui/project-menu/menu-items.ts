// The project menu's item registrations (GLOSSARY: 项目操作菜单; #144). The
// menu renders whatever is registered, in Orca's tag menu of the project tag
// and on the project row of the all tasks view (#147); later issues
// only append registrations (Drop project, #150).
import type { Project } from "../../domain/project/project";
import {
  createMenuItems,
  type MenuGroup,
  type MenuItemBase,
  type MenuItems,
} from "../components/menu-items";

/** One entry of the project menu. */
export interface ProjectMenuItem extends MenuItemBase {
  /** The text shown, already translated. */
  readonly label: (project: Project) => string;
  /** A tabler icon class, e.g. `"ti ti-trash"`. */
  readonly icon?: string;
  readonly dangerous?: boolean;
  /** Marked as the project's current choice (e.g. its project status). */
  readonly isCurrent?: (project: Project) => boolean;
  /**
   * What choosing the item does. The menu closes first; errors are the
   * item's to report.
   */
  readonly run: (project: Project) => Promise<void>;
  /**
   * Asks before `run` (#150): read when the menu shows the item, it gives
   * the question for Orca's `ConfirmBox`, or `null` to run without asking.
   * While it is read, and when reading it fails, the item is disabled; a
   * failure is the item's to report. Absent: never asks.
   */
  readonly confirmation?: (project: Project) => Promise<string | null>;
}

/** Shows a group as one entry that opens its items. */
export interface ProjectMenuSubmenu {
  /** The entry's text, already translated (e.g. naming the current status). */
  readonly label: (project: Project) => string;
  /** A tabler icon class. */
  readonly icon?: (project: Project) => string;
}

/** A non-empty group of the menu, in menu order. */
export type ProjectMenuGroup = MenuGroup<ProjectMenuItem, ProjectMenuSubmenu>;

export type ProjectMenuItems = MenuItems<
  Project,
  ProjectMenuItem,
  ProjectMenuSubmenu
>;

export function createProjectMenuItems(): ProjectMenuItems {
  return createMenuItems("Project menu");
}
