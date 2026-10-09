// A task in a view's list (#35 "任务卡片与组件"): its status icon, its text
// (up to three lines, selectable), the "open in notes" button and its
// property row. The status icon opens the status menu; a right-click opens the
// task menu; a click elsewhere on the card calls `onOpen` (the task panel).
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type * as React from "react";
import type { CalendarDate, Task } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import type { TaskActions } from "../hooks/use-task-actions";
import type { TaskMenuItems, TaskMenuPlace } from "../task-menu/menu-items";
import { TaskMenu } from "../task-menu/task-menu";
import { shownText } from "./format";
import { PropertyRow } from "./property-row";
import { StatusIcon } from "./status-icon";
import { markedStatus, StatusMenu } from "./status-menu";

export interface TaskCardProps {
  task: Task;
  today: CalendarDate;
  /** The status menu and "open in notes"; the card only shows without them. */
  actions?: TaskActions;
  /** The task menu's registrations, for a right-click. */
  menuItems?: TaskMenuItems;
  /** A click on the text or the card's empty space; the card is not clickable without it. */
  onOpen?: (task: Task) => void;
  /** The plugin panel the card is in, for its task menu. */
  menuPlace?: TaskMenuPlace;
  /** The task is the one open in the task panel. */
  selected?: boolean;
  /**
   * The task has left the view's list but stays while it is selected (#42):
   * faded, struck through, and saying its new status.
   */
  kept?: boolean;
}

/** A click that selected text is not a click on the card. */
function selectsText(): boolean {
  const selection = window.getSelection();
  return selection !== null && !selection.isCollapsed;
}

function StatusButton(props: { task: Task; actions: TaskActions }) {
  const { task, actions } = props;
  const { ContextMenu } = orca.components;
  return (
    <ContextMenu
      menu={(close) => (
        <StatusMenu
          current={markedStatus(task)}
          onChoose={(status) => actions.changeStatus(task, status)}
          close={close}
        />
      )}
    >
      {(open, _close, shown) => (
        <button
          type="button"
          className="nextaction-task-card-button nextaction-task-card-status-button"
          aria-haspopup="menu"
          aria-expanded={shown}
          aria-label={t("Change status")}
          onClick={(event) => {
            event.stopPropagation();
            open(event);
          }}
        >
          <StatusIcon status={task.status} />
        </button>
      )}
    </ContextMenu>
  );
}

function OpenInNotesButton(props: { task: Task; actions: TaskActions }) {
  const { task, actions } = props;
  const { Tooltip } = orca.components;
  return (
    <Tooltip text={t("Open in notes")}>
      <button
        type="button"
        className="nextaction-task-card-button nextaction-task-card-open"
        aria-label={t("Open in notes")}
        onClick={(event) => {
          event.stopPropagation();
          actions.openInNotes(task);
        }}
      >
        <i className="ti ti-arrow-up-right" aria-hidden="true" />
      </button>
    </Tooltip>
  );
}

export function TaskCard(props: TaskCardProps) {
  const { task, today, actions, menuItems, onOpen, menuPlace, selected, kept } =
    props;
  const { ContextMenu } = orca.components;
  const text = shownText(task);

  const card = (onContextMenu?: (event: React.MouseEvent) => void) => (
    <article
      className="nextaction-task-card"
      data-clickable={onOpen ? true : undefined}
      data-selected={selected || undefined}
      data-kept={kept || undefined}
      aria-current={selected || undefined}
      onClick={
        onOpen &&
        ((event) => {
          // React bubbles clicks out of portals: a menu item chosen in a menu
          // opened from this card is not a click on the card.
          if (!(event.target instanceof Node)) return;
          if (!event.currentTarget.contains(event.target)) return;
          if (!selectsText()) onOpen(task);
        })
      }
      // The keyboard opens it too: Enter on the focused card, not on its buttons.
      onKeyDown={
        onOpen &&
        ((event) => {
          if (event.key === "Enter" && event.target === event.currentTarget) {
            event.preventDefault();
            onOpen(task);
          }
        })
      }
      tabIndex={onOpen ? 0 : undefined}
      onContextMenu={
        onContextMenu &&
        ((event) => {
          if (!(event.target instanceof Node)) return;
          if (!event.currentTarget.contains(event.target)) return;
          onContextMenu(event);
        })
      }
    >
      <div className="nextaction-task-card-status">
        {actions ? (
          <StatusButton task={task} actions={actions} />
        ) : (
          <StatusIcon status={task.status} />
        )}
      </div>
      <div className="nextaction-task-card-main">
        <div
          className="nextaction-task-card-text"
          data-empty={text.empty || undefined}
        >
          {text.text}
        </div>
        <PropertyRow task={task} today={today} kept={kept} />
      </div>
      {actions && <OpenInNotesButton task={task} actions={actions} />}
    </article>
  );

  if (!menuItems) return card();
  return (
    <ContextMenu
      menu={(close) => (
        <TaskMenu
          items={menuItems}
          task={task}
          close={close}
          place={menuPlace}
        />
      )}
    >
      {(open) => card(open)}
    </ContextMenu>
  );
}
