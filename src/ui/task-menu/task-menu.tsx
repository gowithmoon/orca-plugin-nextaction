// The task menu (GLOSSARY: 任务操作菜单) rendered into Orca's own menus: the
// tag menu of the task tag and the block handle's menu (official-task-menus).
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
import { createNotify } from "../notify";
import { notifyMenuFailure } from "./builtin-items";
import type { TaskMenuItem, TaskMenuItems } from "./menu-items";

export interface TaskMenuDeps {
  items: TaskMenuItems;
  readTask: ReadTask;
  /** Titles the notices. */
  pluginName: string;
  /** The task tag block's ID; `undefined` while task features are paused. */
  taskTagBlockId: () => number | undefined;
}

function itemEntry(item: TaskMenuItem, task: Task, close: () => void) {
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
        void item.run(task);
      }}
    />
  );
}

/** The task's entries, once it is read; nothing for a block that is not a task. */
function TaskMenuEntries(props: {
  deps: TaskMenuDeps;
  /** May be a mirror's ID; the task read is the source's. `undefined` shows nothing. */
  taskId: TaskId | undefined;
  close: () => void;
}) {
  const { deps, taskId, close } = props;
  const { Menu, MenuText } = orca.components;
  const onError = React.useCallback(
    (error: unknown) =>
      notifyMenuFailure(createNotify(deps.pluginName), error, (reason) =>
        t("Could not open the task menu: ${reason}", { reason }),
      ),
    [deps.pluginName],
  );
  const task = useTask(deps.readTask, taskId, onError);
  if (!task) return null;

  return (
    <>
      {deps.items.arrange(task).map((group) => {
        const entries = group.items.map((item) => itemEntry(item, task, close));
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
        <TaskMenuEntries
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
        <TaskMenuEntries
          key={blockId}
          deps={deps}
          taskId={blockId}
          close={close}
        />
      ),
  };
}
