// The task menu (GLOSSARY: 任务操作菜单) rendered into Orca's own menus (the
// tag menu of the task tag and the block handle's menu, official-task-menus)
// and, from the same registrations, into a ContextMenu in the plugin panel.
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { ReadTask } from "../../application/usecases/read-task";
import type { Task, TaskId } from "../../domain/task/task";
import type {
  Block,
  BlockMenuCommand,
  BlockRef,
  TagMenuCommand,
} from "../../orca.d.ts";
import { t } from "../../shared/l10n/l10n";
import { useTask } from "../hooks/use-task";
import { createNotify, notifyActionFailure } from "../notify";
import type { TaskMenuItem, TaskMenuItems, TaskMenuPlace } from "./menu-items";

export interface TaskMenuDeps {
  items: TaskMenuItems;
  readTask: ReadTask;
  /** Titles the notices. */
  pluginName: string;
  /** The task tag block's ID; `undefined` while task features are paused. */
  taskTagBlockId: () => number | undefined;
}

function itemEntry(
  item: TaskMenuItem,
  task: Task,
  close: () => void,
  place: TaskMenuPlace | undefined,
) {
  const { MenuText } = orca.components;
  const current = item.isCurrent?.(task) ?? false;
  return (
    <MenuText
      key={item.id}
      title={item.label(task)}
      preIcon={item.icon}
      postIcon={current ? "ti ti-check" : undefined}
      dangerous={item.dangerous}
      aria-current={current || undefined}
      onClick={() => {
        close();
        void item.run(task, place);
      }}
    />
  );
}

/**
 * The registered entries for `task`, without a container: Orca's tag and
 * block menus provide their own. `TaskMenu` wraps them for a `ContextMenu`.
 */
function TaskMenuEntries(props: {
  items: TaskMenuItems;
  task: Task;
  close: () => void;
  /** The plugin panel the menu is in; absent in Orca's own menus. */
  place?: TaskMenuPlace;
}) {
  const { items, task, close, place } = props;
  const { Menu, MenuText } = orca.components;
  return (
    <>
      {items.arrange(task).map((group) => {
        const entries = group.items.map((item) =>
          itemEntry(item, task, close, place),
        );
        if (!group.submenu) return entries;
        return (
          <MenuText
            key={`group-${group.group}`}
            title={group.submenu.label(task)}
            preIcon={group.submenu.icon?.(task)}
          >
            <Menu>{entries}</Menu>
          </MenuText>
        );
      })}
    </>
  );
}

/**
 * The task menu as a whole menu, e.g. for `ContextMenu` inside the plugin
 * panel: the same registrations as in Orca's own menus.
 */
export function TaskMenu(props: {
  items: TaskMenuItems;
  task: Task;
  close: () => void;
  place?: TaskMenuPlace;
}) {
  const { Menu } = orca.components;
  return (
    <Menu>
      <TaskMenuEntries {...props} />
    </Menu>
  );
}

/** Reads the task, then shows its entries; nothing for a block that is not a task. */
function ReadTaskMenuEntries(props: {
  deps: TaskMenuDeps;
  /** May be a mirror's ID; the task read is the source's. `undefined` shows nothing. */
  taskId: TaskId | undefined;
  close: () => void;
}) {
  const { deps, taskId, close } = props;
  const onError = React.useCallback(
    (error: unknown) =>
      notifyActionFailure(createNotify(deps.pluginName), error, (reason) =>
        t("Could not open the task menu: ${reason}", { reason }),
      ),
    [deps.pluginName],
  );
  const task = useTask(deps.readTask, taskId, onError);
  if (!task) return null;
  return <TaskMenuEntries items={deps.items} task={task} close={close} />;
}

/**
 * The tag menu command: shows only when opened on an instance of the task
 * tag (`tagRef` present); the tagged block is `tagRef.from`.
 */
export function createTaskTagMenuCommand(deps: TaskMenuDeps): TagMenuCommand {
  return {
    // `render` must return an element, so "nothing" is an element without a task.
    render: (tagBlock: Block, close: () => void, tagRef?: BlockRef) => {
      const taskId =
        tagRef && tagBlock.id === deps.taskTagBlockId()
          ? tagRef.from
          : undefined;
      return (
        <ReadTaskMenuEntries
          key={taskId}
          deps={deps}
          taskId={taskId}
          close={close}
        />
      );
    },
  };
}

/** The block menu command, for one block only: multi-select shows nothing. */
export function createTaskBlockMenuCommand(
  deps: TaskMenuDeps,
): BlockMenuCommand {
  return {
    worksOnMultipleBlocks: false,
    render: (blockId: number, _rootBlockId: number, close: () => void) =>
      // While paused there is no task to show, and no notice on every right-click.
      deps.taskTagBlockId() === undefined ? null : (
        <ReadTaskMenuEntries
          key={blockId}
          deps={deps}
          taskId={blockId}
          close={close}
        />
      ),
  };
}
