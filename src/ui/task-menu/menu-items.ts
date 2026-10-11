// The task menu's item registrations (GLOSSARY: 任务操作菜单). The menu
// renders whatever is registered; later steps only append registrations.
import type { Task, TaskId } from "../../domain/task/task";

/**
 * The plugin panel a task menu was opened in (a right-click on a card).
 * Absent in Orca's own menus.
 */
export interface TaskMenuPlace {
  /** Selects the task there: the side pane or the popup shows it, by tier. */
  readonly selectTask: (taskId: TaskId) => void;
}

/** What every entry of the task menu has. */
interface TaskMenuItemBase {
  /** Stable identifier, unique within the menu. */
  readonly id: string;
  /** Items of one group sit together, lowest group first. */
  readonly group: number;
  /** Position within the group, lowest first. */
  readonly order: number;
  /** Whether the item shows for this task; shown when absent. */
  readonly isShownFor?: (task: Task) => boolean;
}

/** What a resolved item shows and does. */
export interface ResolvedTaskMenuEntry {
  /** The text shown, already translated. */
  readonly label: string;
  /** A tabler icon class. */
  readonly icon?: string;
  /** As `StaticTaskMenuItem.run`. */
  readonly run: (place?: TaskMenuPlace) => Promise<void>;
}

/**
 * An entry whose text depends on more than the task, e.g. whether it is in
 * today's My Day: worked out each time the menu opens. It does not show until
 * resolved.
 */
export interface ResolvedTaskMenuItem extends TaskMenuItemBase {
  /**
   * What the item shows and does for `task`; `null` hides it. Never rejects:
   * errors are the item's to report.
   */
  readonly resolve: (task: Task) => Promise<ResolvedTaskMenuEntry | null>;
}

/** One entry of the task menu. */
export type TaskMenuItem = StaticTaskMenuItem | ResolvedTaskMenuItem;

/** An entry whose text follows from the task alone. */
export interface StaticTaskMenuItem extends TaskMenuItemBase {
  /** The text shown, already translated. */
  readonly label: (task: Task) => string;
  /** A tabler icon class, e.g. `"ti ti-trash"`. */
  readonly icon?: string;
  readonly dangerous?: boolean;
  /** Marked as the task's current choice (e.g. its status). */
  readonly isCurrent?: (task: Task) => boolean;
  /**
   * What choosing the item does; `place` is the plugin panel the menu was
   * opened in, absent in Orca's own menus. The menu closes first; errors are
   * the item's to report.
   */
  readonly run: (task: Task, place?: TaskMenuPlace) => Promise<void>;
}

/** Shows a group as one entry that opens its items, instead of the items themselves. */
export interface TaskMenuSubmenu {
  /** The entry's text, already translated (e.g. naming the current status). */
  readonly label: (task: Task) => string;
  /** A tabler icon class. */
  readonly icon?: (task: Task) => string;
}

/** A non-empty group of the menu, in menu order. */
export interface TaskMenuGroup {
  readonly group: number;
  /** Present when the group shows as a submenu. */
  readonly submenu?: TaskMenuSubmenu;
  readonly items: readonly TaskMenuItem[];
}

export interface TaskMenuItems {
  /** Adds an item. Throws when its identifier is already registered. */
  register(item: TaskMenuItem): void;
  /** Shows `group` as a submenu. Throws when the group already has one. */
  registerSubmenu(group: number, submenu: TaskMenuSubmenu): void;
  /** The items shown for `task`, as non-empty groups in menu order. */
  arrange(task: Task): TaskMenuGroup[];
}

export function createTaskMenuItems(): TaskMenuItems {
  const items: TaskMenuItem[] = [];
  const submenus = new Map<number, TaskMenuSubmenu>();
  return {
    register(item) {
      if (items.some((existing) => existing.id === item.id)) {
        throw new Error(`Task menu item "${item.id}" is already registered`);
      }
      items.push(item);
    },
    registerSubmenu(group, submenu) {
      if (submenus.has(group)) {
        throw new Error(`Task menu group ${group} already has a submenu`);
      }
      submenus.set(group, submenu);
    },
    arrange(task) {
      const shown = items
        .filter((item) => item.isShownFor?.(task) ?? true)
        .sort((a, b) => a.group - b.group || a.order - b.order);
      const groups: { group: number; items: TaskMenuItem[] }[] = [];
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
