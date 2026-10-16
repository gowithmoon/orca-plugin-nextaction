// The item registrations shared by the task menu and the project menu
// (GLOSSARY: 任务操作菜单, 项目操作菜单): items register by group and order,
// some groups show as a submenu, and the menu arranges what shows for its
// subject into non-empty groups in menu order.

/** What every registered item has. */
export interface MenuItemBase {
  /** Stable identifier, unique within the menu. */
  readonly id: string;
  /** Items of one group sit together, lowest group first. */
  readonly group: number;
  /** Position within the group, lowest first. */
  readonly order: number;
}

/** An item of a menu on `S`, which may show only for some subjects. */
type ArrangedItem<S> = MenuItemBase & {
  /** Whether the item shows for this subject; shown when absent. */
  readonly isShownFor?: (subject: S) => boolean;
};

/** A non-empty group of the menu, in menu order. */
export interface MenuGroup<I, M> {
  readonly group: number;
  /** Present when the group shows as a submenu. */
  readonly submenu?: M;
  readonly items: readonly I[];
}

export interface MenuItems<S, I extends ArrangedItem<S>, M> {
  /** Adds an item. Throws when its identifier is already registered. */
  register(item: I): void;
  /** Shows `group` as a submenu. Throws when the group already has one. */
  registerSubmenu(group: number, submenu: M): void;
  /** The items shown for `subject`, as non-empty groups in menu order. */
  arrange(subject: S): MenuGroup<I, M>[];
}

/** @param menuName Names the menu in errors, e.g. "Task menu". */
export function createMenuItems<S, I extends ArrangedItem<S>, M>(
  menuName: string,
): MenuItems<S, I, M> {
  const items: I[] = [];
  const submenus = new Map<number, M>();
  return {
    register(item) {
      if (items.some((existing) => existing.id === item.id)) {
        throw new Error(`${menuName} item "${item.id}" is already registered`);
      }
      items.push(item);
    },
    registerSubmenu(group, submenu) {
      if (submenus.has(group)) {
        throw new Error(`${menuName} group ${group} already has a submenu`);
      }
      submenus.set(group, submenu);
    },
    arrange(subject) {
      const shown = items
        .filter((item) => item.isShownFor?.(subject) ?? true)
        .sort((a, b) => a.group - b.group || a.order - b.order);
      const groups: { group: number; items: I[] }[] = [];
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
