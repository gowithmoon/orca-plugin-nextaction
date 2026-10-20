// The completion history popup (GLOSSARY: 完成历史, #209): every completion
// and skip, newest first, each with its logical day, time and kind and a
// delete button; "Clear all" below. Deleting and clearing ask first with
// Orca's ConfirmBox, as dropping a project does, and each is one undo. A
// history this plugin cannot read offers only "Discard and reset" (#106).
// In a plugin window, rendered into its own React root, as the reminder
// popup. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { TaskForPanel } from "../../application/usecases/read-task";
import {
  type CompletionEntry,
  entryKind,
} from "../../domain/task/completion-history";
import type { CalendarDate } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { entryKindText } from "../components/completion-history-text";
import { formatClock, formatDate } from "../components/format";
import {
  PluginWindow,
  WindowFooter,
  WindowHeader,
  WindowSpacer,
} from "../components/plugin-window";
import { usePopupLayer } from "../components/popup-layer";
import {
  type CompletionHistoryActionsDeps,
  useCompletionHistoryActions,
} from "../hooks/use-completion-history-actions";
import {
  type DiscardUnreadableDeps,
  useDiscardUnreadable,
} from "../hooks/use-discard-unreadable";
import { DiscardUnreadableField } from "./discard-unreadable-field";

export interface CompletionHistoryPopupDeps {
  /** Deletes an entry, or clears them all. */
  actions: CompletionHistoryActionsDeps;
  /** The current logical day, for showing dates. */
  today: () => CalendarDate;
  /** Discards the history when it cannot be read (#106). */
  discard: DiscardUnreadableDeps;
}

/** A task with its completion history, as the task panel read it. */
export type TaskWithHistory = Pick<TaskForPanel, "task" | "completionHistory">;

/** Opens the popup for a task, replacing one already open. */
export type OpenCompletionHistoryPopup = (read: TaskWithHistory) => void;

/** What deleting or clearing changes; shared by both confirmations. */
const consequence = () =>
  t(
    "The statistics, dependency delays and anything else counted from it change with it. You can undo it.",
  );

/** A button that asks first with Orca's ConfirmBox, then runs `onConfirm`. */
function ConfirmedButton(props: {
  question: string;
  onConfirm: () => void;
  children: (open: (e: React.UIEvent) => void) => React.ReactNode;
}) {
  const { ConfirmBox } = orca.components;
  const popupLayer = usePopupLayer();
  return (
    <ConfirmBox
      text={props.question}
      container={popupLayer}
      onConfirm={(_e, close) => {
        close();
        props.onConfirm();
      }}
    >
      {(open) => props.children(open)}
    </ConfirmBox>
  );
}

function EntryRow(props: {
  entry: CompletionEntry;
  today: CalendarDate;
  busy: boolean;
  onDelete: () => void;
}) {
  const { Button, Tooltip } = orca.components;
  const { entry } = props;
  const kind = entryKindText(entry);
  const when = `${formatDate(entry.day, props.today)} ${formatClock(entry.at)}`;
  return (
    <li className="nextaction-reminder-item">
      <span className="nextaction-completion-entry-when">{when}</span>
      <span
        className="nextaction-completion-entry-kind"
        data-skip={entryKind(entry) === "skip" || undefined}
      >
        {kind}
      </span>
      <ConfirmedButton
        question={t("Delete this record (${kind}, ${when})? ${consequence}", {
          kind,
          when,
          consequence: consequence(),
        })}
        onConfirm={props.onDelete}
      >
        {(open) => (
          <Tooltip text={t("Delete record")}>
            <Button
              variant="plain"
              disabled={props.busy}
              aria-label={t("Delete the record ${kind} at ${when}", {
                kind,
                when,
              })}
              onClick={open}
            >
              <i className="ti ti-trash" aria-hidden="true" />
            </Button>
          </Tooltip>
        )}
      </ConfirmedButton>
    </li>
  );
}

function CompletionHistoryPopup(props: {
  read: TaskWithHistory;
  deps: CompletionHistoryPopupDeps;
  onClose: () => void;
  /** Shows the popup afresh for the task as read again. */
  onReopen: (read: TaskWithHistory) => void;
}) {
  const { read, deps, onClose, onReopen } = props;
  const { task, completionHistory } = read;
  const { Button } = orca.components;
  const idPrefix = React.useId();
  const id = (field: string) => `${idPrefix}-${field}`;
  const today = deps.today();
  const actions = useCompletionHistoryActions(
    deps.actions,
    task.id,
    React.useCallback(
      (again: TaskForPanel | null) => {
        // Nothing left to list: the task panel's row goes too.
        if (
          !again ||
          (again.completionHistory.kind === "readable" &&
            again.completionHistory.history.length === 0)
        ) {
          onClose();
        } else onReopen(again);
      },
      [onReopen, onClose],
    ),
  );
  // Discarded (#106): an empty history, so nothing to list.
  const discard = useDiscardUnreadable(
    deps.discard,
    task.id,
    "completionHistory",
    React.useCallback(() => onClose(), [onClose]),
  );
  const newestFirst =
    completionHistory.kind === "readable"
      ? [...completionHistory.history].reverse()
      : [];

  return (
    <PluginWindow
      onClose={onClose}
      className="nextaction-recurrence-popup"
      labelledBy={id("title")}
    >
      <WindowHeader
        title={t("Completion history")}
        titleId={id("title")}
        task={task}
        onClose={onClose}
      />
      <div className="nextaction-recurrence-popup-body">
        {completionHistory.kind === "unreadable" ? (
          <>
            <div className="nextaction-recurrence-popup-warning">
              {t(
                "This task's completion history cannot be read (${reason}). It is kept as it is and cannot be changed here.",
                { reason: completionHistory.reason },
              )}
            </div>
            <DiscardUnreadableField
              busy={discard.busy}
              onDiscard={discard.discard}
            />
          </>
        ) : (
          <div className="nextaction-recurrence-popup-field">
            <ul className="nextaction-reminder-list" aria-label={t("Records")}>
              {newestFirst.map((entry) => (
                <EntryRow
                  key={`${entry.at.getTime()}:${entryKind(entry)}`}
                  entry={entry}
                  today={today}
                  busy={actions.busy}
                  onDelete={() =>
                    actions.deleteEntry({
                      at: entry.at,
                      kind: entryKind(entry),
                    })
                  }
                />
              ))}
            </ul>
          </div>
        )}
      </div>
      <WindowFooter>
        {newestFirst.length > 0 && (
          <ConfirmedButton
            question={t("Clear all ${n} records of this task? ${consequence}", {
              n: String(newestFirst.length),
              consequence: consequence(),
            })}
            onConfirm={actions.clearAll}
          >
            {(open) => (
              <Button variant="plain" disabled={actions.busy} onClick={open}>
                {t("Clear all")}
              </Button>
            )}
          </ConfirmedButton>
        )}
        <WindowSpacer />
        <Button variant="plain" onClick={onClose}>
          {t("Close")}
        </Button>
      </WindowFooter>
    </PluginWindow>
  );
}

/**
 * The popup in `render`'s root; at most one at a time. Another task, or the
 * same one read again, starts afresh; a replaced popup's late close or
 * reopen does nothing (as `createTaskWindow`, which takes only a task).
 */
export function createCompletionHistoryPopup(options: {
  deps: CompletionHistoryPopupDeps;
  render: (node: React.ReactNode) => void;
}): OpenCompletionHistoryPopup {
  let shown = 0;
  const open: OpenCompletionHistoryPopup = (read) => {
    shown += 1;
    const mine = shown;
    options.render(
      <CompletionHistoryPopup
        key={mine}
        read={read}
        deps={options.deps}
        onClose={() => {
          if (mine === shown) options.render(null);
        }}
        onReopen={(again) => {
          if (mine === shown) open(again);
        }}
      />,
    );
  };
  return open;
}
