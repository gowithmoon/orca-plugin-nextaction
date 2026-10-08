// The task menu's item registrations (GLOSSARY: 任务操作菜单). The menu
// renders whatever is registered; later steps only append registrations.
import type { Task } from "../../domain/task/task";

/** One entry of the task menu. */
export interface TaskMenuItem {
  /** Stable identifier, unique within the menu. */
  readonly id: string;
  /** Items of one group sit together, lowest group first. */
  readonly group: number;
  /** Position within the group, lowest first. */
  readonly order: number;
  /** The text shown, already translated. */
  readonly label: (task: Task) => string;
  /** A tabler icon class, e.g. `"ti ti-trash"`. */
  readonly icon?: string;
  readonly dangerous?: boolean;
  /** Marked as the task's current choice (e.g. its status). */
  readonly isCurrent?: (task: Task) => boolean;
  /** Whether the item shows for this task; shown when absent. */
  readonly isShownFor?: (task: Task) => boolean;
  /** What choosing the item does. The menu closes first; errors are the item's to report. */
  readonly run: (task: Task) => Promise<void>;
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
