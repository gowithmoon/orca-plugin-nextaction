// The project menu's item registrations (GLOSSARY: 项目操作菜单; #144). The
// menu renders whatever is registered, in Orca's tag menu of the project tag
// and, later, on the project row of the all tasks view (#147); later issues
// only append registrations (Drop project, #150).
import type { Project } from "../../domain/project/project";

/** One entry of the project menu. */
export interface ProjectMenuItem {
  /** Stable identifier, unique within the menu. */
  readonly id: string;
  /** Items of one group sit together, lowest group first. */
  readonly group: number;
  /** Position within the group, lowest first. */
  readonly order: number;
  /** Whether the item shows for this project; shown when absent. */
  readonly isShownFor?: (project: Project) => boolean;
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
}

/** Shows a group as one entry that opens its items. */
export interface ProjectMenuSubmenu {
  /** The entry's text, already translated (e.g. naming the current status). */
  readonly label: (project: Project) => string;
  /** A tabler icon class. */
  readonly icon?: (project: Project) => string;
}

/** A non-empty group of the menu, in menu order. */
export interface ProjectMenuGroup {
  readonly group: number;
  /** Present when the group shows as a submenu. */
  readonly submenu?: ProjectMenuSubmenu;
  readonly items: readonly ProjectMenuItem[];
}

export interface ProjectMenuItems {
  /** Adds an item. Throws when its identifier is already registered. */
  register(item: ProjectMenuItem): void;
  /** Shows `group` as a submenu. Throws when the group already has one. */
  registerSubmenu(group: number, submenu: ProjectMenuSubmenu): void;
  /** The items shown for `project`, as non-empty groups in menu order. */
  arrange(project: Project): ProjectMenuGroup[];
}

export function createProjectMenuItems(): ProjectMenuItems {
  const items: ProjectMenuItem[] = [];
  const submenus = new Map<number, ProjectMenuSubmenu>();
  return {
    register(item) {
      if (items.some((existing) => existing.id === item.id)) {
        throw new Error(`Project menu item "${item.id}" is already registered`);
      }
      items.push(item);
    },
    registerSubmenu(group, submenu) {
      if (submenus.has(group)) {
        throw new Error(`Project menu group ${group} already has a submenu`);
      }
      submenus.set(group, submenu);
    },
    arrange(project) {
      const shown = items
        .filter((item) => item.isShownFor?.(project) ?? true)
        .sort((a, b) => a.group - b.group || a.order - b.order);
      const groups: { group: number; items: ProjectMenuItem[] }[] = [];
      for (const item of shown) {
        const last = groups.at(-1);
        if (last?.group === item.group) last.items.push(item);
        else groups.push({ group: item.group, items: [item] });
      }
      return groups.map((entry) => {
        const submenu = submenus.get(entry.group);
        return submenu ? { ...entry, submenu } : entry;
      });
    },
  };
}
