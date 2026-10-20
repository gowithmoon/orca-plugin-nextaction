// The plugin's windows (#118): Orca's ModalOverlay with the shared window
// look (window-style.ts), the popup layer for the controls inside
// (popup-layer.tsx), the focus moved in on opening and back on closing, and
// Esc closing it. The standard header (title, the task's text, close) and
// footer are parts a window may use. Only this module takes ModalOverlay from
// orca.components (tests/architecture.test.ts). Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { Task } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { useFocusInside } from "../hooks/use-focus-inside";
import { shownText } from "./format";
import { PopupLayer } from "./popup-layer";

export function PluginWindow(props: {
  /** Closes the window by unmounting it. */
  onClose: () => void;
  /** Extra classes, e.g. one setting `--nextaction-window-width`. */
  className?: string;
  /** The id of the element that names the window (its header's title). */
  labelledBy?: string;
  /** The window's name, when nothing in it names it. */
  label?: string;
  /** Takes the focus on opening; the window itself without it. */
  focus?: React.RefObject<HTMLElement>;
  /** Turned off, the focus is not moved back on closing (useFocusInside). */
  restoreFocus?: React.RefObject<boolean>;
  /** Keys other than Esc from inside the window, not yet handled. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
}) {
  const { ModalOverlay } = orca.components;
  const dialog = React.useRef<HTMLDivElement>(null);
  const restoreAlways = React.useRef(true);
  useFocusInside(props.focus ?? dialog, props.restoreFocus ?? restoreAlways);
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Whether ModalOverlay closes on Esc by itself is not measured; a key a
    // control inside already handled (e.g. a picker closing) is left alone.
    if (e.defaultPrevented || e.nativeEvent.isComposing) return;
    // Keys from a picker rendered elsewhere in the page (a portal) still
    // bubble here through React: Esc there closes the picker, not the window.
    if (!e.currentTarget.contains(e.target as Node)) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      props.onClose();
      return;
    }
    props.onKeyDown?.(e);
  };
  // Always visible while mounted: closing unmounts it at once instead of
  // waiting for `onClosed`, whose timing is not documented, so it can open
  // again right away, afresh.
  return (
    <ModalOverlay visible={true} canClose={true} onClose={props.onClose}>
      <PopupLayer>
        <div
          ref={dialog}
          // Focusable itself, so opening moves the focus here when nothing
          // else is to take it (useFocusInside).
          tabIndex={-1}
          // Centred and scrolling inside when taller than the screen.
          className={
            props.className
              ? `nextaction-window ${props.className}`
              : "nextaction-window"
          }
          role="dialog"
          aria-modal="true"
          aria-labelledby={props.labelledBy}
          aria-label={props.label}
          onKeyDown={onKeyDown}
        >
          {props.children}
        </div>
      </PopupLayer>
    </ModalOverlay>
  );
}

/** The title, the task's text under it when there is a task, and close. */
export function WindowHeader(props: {
  title: string;
  /** For the window's `labelledBy`. */
  titleId: string;
  task?: Pick<Task, "text">;
  onClose: () => void;
}) {
  const { Button, Tooltip } = orca.components;
  const text = props.task && shownText(props.task);
  return (
    <header
      className="nextaction-window-header"
      data-title-only={text ? undefined : true}
    >
      <div className="nextaction-window-heading">
        <div className="nextaction-window-title" id={props.titleId}>
          {props.title}
        </div>
        {text && (
          <div
            className="nextaction-window-task"
            data-empty={text.empty || undefined}
            title={text.text}
          >
            {text.text}
          </div>
        )}
      </div>
      <Tooltip text={t("Close")}>
        <Button variant="plain" aria-label={t("Close")} onClick={props.onClose}>
          <i className="ti ti-x" aria-hidden="true" />
        </Button>
      </Tooltip>
    </header>
  );
}

/** The row of buttons at the bottom; a `WindowSpacer` pushes the rest right. */
export function WindowFooter(props: { children: React.ReactNode }) {
  return <footer className="nextaction-window-footer">{props.children}</footer>;
}

export function WindowSpacer() {
  return <span className="nextaction-window-spacer" />;
}

/**
 * What a task's window gets from `createTaskWindow`. `Subject` is what it is
 * opened for: the task, or the task with more read along with it.
 */
export interface TaskWindowProps<Deps, Subject = Task> {
  task: Subject;
  deps: Deps;
  onClose: () => void;
  /** Shows the window afresh for the task as read again. */
  onReopen: (task: Subject) => void;
}

/**
 * Opens `Window` for a task in `render`'s root; at most one at a time.
 * Another task, or the same one read again, starts afresh; a replaced
 * window's late close or reopen does nothing.
 */
export function createTaskWindow<Deps, Subject = Task>(
  Window: React.ComponentType<TaskWindowProps<Deps, Subject>>,
  options: { deps: Deps; render: (node: React.ReactNode) => void },
): (task: Subject) => void {
  let shown = 0;
  const open = (task: Subject) => {
    shown += 1;
    const mine = shown;
    options.render(
      <Window
        key={mine}
        task={task}
        deps={options.deps}
        onClose={() => {
          if (mine === shown) options.render(null);
        }}
        onReopen={(read) => {
          if (mine === shown) open(read);
        }}
      />,
    );
  };
  return open;
}
