// A task in a view's list (#35 "任务卡片与组件", restyled in #45 "任务卡片"),
// the one card every view uses: its status icon, its text (up to three
// lines; not selectable where the card can be dragged, card-drag-style.ts),
// the "open in notes" button and its
// property row. The status icon opens the status menu; a right-click opens the
// task menu; a click elsewhere on the card calls `onOpen` (the task panel).
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type * as React from "react";
import type { Project } from "../../domain/project/project";
import type { CalendarDate, Task } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import type { TaskActions } from "../hooks/use-task-actions";
import { projectStatusIcons } from "../project-menu/project-status-icons";
import type { TaskMenuItems, TaskMenuPlace } from "../task-menu/menu-items";
import { TaskMenu } from "../task-menu/task-menu";
import { shownText } from "./format";
import { ContextMenu } from "./popup-controls";
import { projectStatusLabel } from "./project-status-label";
import { PropertyRow } from "./property-row";
import { selectsText } from "./selects-text";
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
   * faded (not struck through, #45) and, unless `keptStatusShown` is false,
   * saying its new status.
   */
  kept?: boolean;
  /**
   * A kept task says its new status ("Changed to …"); `false` only fades it
   * (the next action view, #53). Defaults to `true`.
   */
  keptStatusShown?: boolean;
  /**
   * The text of the task's parent task (#55), one line above its own,
   * cut short when too long and not clickable on its own; no line without it.
   */
  parentText?: string | null;
  /**
   * The project the task belongs to (GLOSSARY: 所属项目, #149), on the
   * parent task's line before its text, when where the card sits does not
   * say it; no project shown without it.
   */
  project?: Project | null;
  /**
   * Marked blocked (#65): held back by a dependency, a sequential parent or
   * a dependency cycle. The task panel says why.
   */
  blocked?: boolean;
  /**
   * A view's own buttons, before "open in notes" and shown like it (e.g. My
   * Day's schedule button, #84). Their clicks must stop propagating, or they
   * also open the task panel.
   */
  buttons?: React.ReactNode;
  /**
   * A recurring task completed today that has advanced already (My Day,
   * #95): faded as done, saying so.
   */
  doneToday?: boolean;
  /**
   * A recurring task skipped today that has advanced already (My Day, #91):
   * faded as done, saying so.
   */
  skippedToday?: boolean;
  /**
   * What the card shows below its property row (the board's subtasks,
   * #167). Its clicks and right-clicks must stop propagating, or they also
   * open the task panel and the card's task menu.
   */
  footer?: React.ReactNode;
  /**
   * The card's place in the Tab order when it opens (`onOpen`): 0 unless a
   * view moves the focus between its cards itself (the task map's roving
   * focus, #221, gives -1 to all but one).
   */
  tabIndex?: number;
  /**
   * Shift+F10, or the menu key, on the focused card opens its task menu
   * (#221); off unless asked for.
   */
  menuByKeyboard?: boolean;
}

/**
 * The status icon that opens the status menu; shared with My Day's timeline
 * cards and the board's subtask rows.
 */
export function StatusButton(props: { task: Task; actions: TaskActions }) {
  const { task, actions } = props;
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

/** Blank text reads as "(No text)". */
function lineText(text: string): { text: string; blank: boolean } {
  const blank = text.trim() === "";
  return { text: blank ? t("(No text)") : text, blank };
}

/**
 * The line above the task's text (#55, #149): the project it belongs to
 * (its project status icon and name), then the parent task's text, either
 * one alone, each cut short. Plain text, so a click on it is a click on the
 * card.
 */
function ParentLine(props: {
  project: Project | null;
  parentText: string | null;
}) {
  const { project, parentText } = props;
  const name = project && lineText(project.text);
  const parent = parentText === null ? null : lineText(parentText);
  const icon = project && projectStatusIcons[project.status];
  const title = [name?.text, parent?.text].filter(Boolean).join(" › ");
  return (
    <div className="nextaction-task-card-parent" title={title}>
      {project && icon && name && (
        <span
          className="nextaction-task-card-project"
          data-empty={name.blank || undefined}
        >
          <i
            className={icon.className}
            style={{ color: icon.color }}
            aria-hidden="true"
          />
          <span className="nextaction-task-card-parent-text">
            <span className="nextaction-visually-hidden">
              {t("Project (${status}):", {
                status: projectStatusLabel(project.status),
              })}{" "}
            </span>
            {name.text}
          </span>
        </span>
      )}
      {name && parent && (
        <span className="nextaction-task-card-parent-sep" aria-hidden="true">
          ›
        </span>
      )}
      {parent && (
        <span
          className="nextaction-task-card-parent-task"
          data-empty={parent.blank || undefined}
        >
          <i className="ti ti-corner-left-up" aria-hidden="true" />
          <span className="nextaction-task-card-parent-text">
            <span className="nextaction-visually-hidden">
              {t("Parent task:")}{" "}
            </span>
            {parent.text}
          </span>
        </span>
      )}
    </div>
  );
}

export function TaskCard(props: TaskCardProps) {
  const {
    task,
    today,
    actions,
    menuItems,
    onOpen,
    menuPlace,
    selected,
    kept,
    keptStatusShown = true,
    parentText,
    project,
    blocked,
    buttons,
    doneToday,
    skippedToday,
    footer,
    menuByKeyboard,
  } = props;
  const text = shownText(task);

  const card = (
    onContextMenu?: (event: React.MouseEvent) => void,
    openMenu?: (event: React.UIEvent) => void,
  ) => (
    <article
      className="nextaction-task-card"
      data-clickable={onOpen ? true : undefined}
      data-selected={selected || undefined}
      data-kept={kept || doneToday || skippedToday || undefined}
      aria-current={selected || undefined}
      onClick={
        onOpen &&
        ((event) => {
          // React bubbles clicks out of portals: a menu item chosen in a menu
          // opened from this card is not a click on the card.
          if (!(event.target instanceof Node)) return;
          if (!event.currentTarget.contains(event.target)) return;
          // A click that selected the card's text is not a click on it.
          if (!selectsText(event.currentTarget)) onOpen(task);
        })
      }
      // The keyboard opens it too: Enter on the focused card, not on its buttons.
      onKeyDown={
        !onOpen && !(menuByKeyboard && openMenu)
          ? undefined
          : (event) => {
              if (event.target !== event.currentTarget) return;
              if (onOpen && event.key === "Enter") {
                event.preventDefault();
                onOpen(task);
              } else if (
                menuByKeyboard &&
                openMenu &&
                ((event.key === "F10" && event.shiftKey) ||
                  event.key === "ContextMenu")
              ) {
                event.preventDefault();
                // Opened at the card's lower left, as Orca opens a menu at a
                // pointer (as note-status-menu.tsx opens one at an icon).
                const box = event.currentTarget.getBoundingClientRect();
                openMenu({
                  currentTarget: event.currentTarget,
                  target: event.currentTarget,
                  clientX: box.left,
                  clientY: box.bottom,
                  preventDefault() {},
                  stopPropagation() {},
                  nativeEvent: {},
                } as unknown as React.UIEvent);
              }
            }
      }
      tabIndex={onOpen ? (props.tabIndex ?? 0) : undefined}
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
          <span className="nextaction-task-card-status-mark">
            <StatusIcon status={task.status} />
          </span>
        )}
      </div>
      <div className="nextaction-task-card-main">
        {(parentText != null || project) && (
          <ParentLine
            project={project ?? null}
            parentText={parentText ?? null}
          />
        )}
        <div
          className="nextaction-task-card-text"
          data-empty={text.empty || undefined}
        >
          {text.text}
        </div>
        <PropertyRow
          task={task}
          today={today}
          kept={kept && keptStatusShown}
          blocked={blocked}
          doneToday={doneToday}
          skippedToday={skippedToday}
        />
        {footer}
      </div>
      {buttons}
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
      {(open) => card(open, open)}
    </ContextMenu>
  );
}
