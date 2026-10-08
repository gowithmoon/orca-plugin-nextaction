// The task menu (GLOSSARY: 任务操作菜单): Orca's Popup and Menu components at
// the status icon, on a root of its own. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5; layout from status-icon-task-menu).
import { createElement, type ReactNode, useRef } from "react";
import type { ReadTask } from "../../application/usecases/read-task";
import type { Task } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { createNotify } from "../notify";
import { notifyMenuFailure } from "./builtin-items";
import type { TaskMenuItem, TaskMenuItems } from "./menu-items";
import type { StatusIconHit } from "./orca-dom";

interface TaskMenuProps {
  task: Task;
  groups: TaskMenuItem[][];
  rect: DOMRect;
  visible: boolean;
  onChoose: (item: TaskMenuItem) => void;
  onClose: () => void;
  onClosed: () => void;
}

function TaskMenu(props: TaskMenuProps) {
  const { Popup, Menu, MenuText, MenuSeparator } = orca.components;
  const container = useRef<HTMLDivElement>(null);
  const boundary = useRef<HTMLElement>(document.body);
  const entries: ReactNode[] = [];
  props.groups.forEach((group, index) => {
    if (index > 0) {
      entries.push(createElement(MenuSeparator, { key: `separator-${index}` }));
    }
    for (const item of group) {
      const current = item.isCurrent?.(props.task) ?? false;
      entries.push(
        createElement(MenuText, {
          key: item.id,
          title: item.label(props.task),
          preIcon: item.icon,
          postIcon: current ? "ti ti-check" : undefined,
          dangerous: item.dangerous,
          "aria-current": current || undefined,
          onClick: () => props.onChoose(item),
        }),
      );
    }
  });
  return createElement(
    "div",
    { ref: container },
    createElement(
      Popup,
      {
        visible: props.visible,
        rect: props.rect,
        container,
        boundary,
        allowBeyondContainer: true,
        defaultPlacement: "bottom",
        alignment: "left",
        escapeToClose: true,
        onClose: props.onClose,
        onClosed: props.onClosed,
      },
      createElement(Menu, { keyboardNav: true }, ...entries),
    ),
  );
}

/** Opens the task menu for a status icon; at most one menu is open. */
export type OpenTaskMenu = (hit: StatusIconHit) => Promise<void>;

export function createTaskMenuController(deps: {
  items: TaskMenuItems;
  readTask: ReadTask;
  /** Titles the notices. */
  pluginName: string;
  /** Renders into the menu's own root; `null` empties it. */
  render: (node: ReactNode) => void;
}): OpenTaskMenu {
  const notify = createNotify(deps.pluginName);
  // Every open bumps it, so a slow read never shows a stale menu.
  let generation = 0;

  return async (hit) => {
    const opened = ++generation;
    let task: Task | null;
    try {
      // The block ID may be a mirror's; the task read is the source's.
      task = await deps.readTask(hit.blockId);
    } catch (error) {
      notifyMenuFailure(notify, error, (reason) =>
        t("Could not open the task menu: ${reason}", { reason }),
      );
      return;
    }
    // The icon outlived its tag (e.g. just dropped elsewhere): nothing to show.
    if (!task || opened !== generation) return;
    const shown = task;
    const groups = deps.items.arrange(shown);

    const show = (visible: boolean) =>
      deps.render(
        createElement(TaskMenu, {
          task: shown,
          groups,
          rect: hit.rect,
          visible,
          onChoose(item) {
            close();
            void item.run(shown);
          },
          onClose: close,
          onClosed() {
            if (opened === generation) deps.render(null);
          },
        }),
      );
    const close = () => {
      if (opened === generation) show(false);
    };
    show(true);
  };
}
