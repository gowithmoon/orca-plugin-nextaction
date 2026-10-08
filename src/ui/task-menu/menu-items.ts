// The task menu's item registrations (GLOSSARY: 任务操作菜单). The menu
// renders whatever is registered; later steps only append registrations.
import type { Task } from "../../domain/task/task";

/** One entry of the task menu. */
export interface TaskMenuItem {
  /** Stable identifier, unique within the menu. */
  readonly id: string;
  /** Items of one group sit together; groups are split by separators, lowest first. */
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

export interface TaskMenuItems {
  /** Adds an item. Throws when its identifier is already registered. */
  register(item: TaskMenuItem): void;
  /** The items shown for `task`, as non-empty groups in menu order. */
  arrange(task: Task): TaskMenuItem[][];
}

export function createTaskMenuItems(): TaskMenuItems {
  const items: TaskMenuItem[] = [];
  return {
    register(item) {
      if (items.some((existing) => existing.id === item.id)) {
        throw new Error(`Task menu item "${item.id}" is already registered`);
      }
      items.push(item);
    },
    arrange(task) {
      const shown = items
        .filter((item) => item.isShownFor?.(task) ?? true)
        .sort((a, b) => a.group - b.group || a.order - b.order);
      const groups: TaskMenuItem[][] = [];
      let last: number | undefined;
      for (const item of shown) {
        if (item.group !== last) groups.push([]);
        groups.at(-1)?.push(item);
        last = item.group;
      }
      return groups;
    },
  };
}
