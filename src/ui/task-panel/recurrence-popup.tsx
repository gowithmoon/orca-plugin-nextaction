// The recurrence rule popup (GLOSSARY: 重复规则, #95): every N days / weeks /
// months / years, and the recurrence basis (按固定日程 / 按完成日期). Saving writes the
// rule in one undo; the task's dates are not touched. A task with a rule can
// have it removed or paused here; resuming a done task advances it (#92).
// Each unit offers its placement, and the next occurrence is previewed
// before saving (#88). The end condition (never / on a day / after N times,
// #89) ends the recurrence once the next occurrence would fall outside it.
// In Orca's ModalOverlay with the shared
// window look, rendered into its own React root, as the schedule popup.
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { PreviewNextOccurrence } from "../../application/usecases/preview-next-occurrence";
import type { SetRecurrence } from "../../application/usecases/set-recurrence";
import {
  countEnd,
  type RecurrenceBasis,
  type RecurrenceEnd,
  type RecurrenceRule,
  type RecurrenceUnit,
  recurrenceBases,
  recurrenceUnits,
} from "../../domain/recurrence/recurrence";
import type { CalendarDate, Task } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { formatDate, shownText } from "../components/format";
import { PopupLayer } from "../components/popup-layer";
import { basisName, unitName } from "../components/recurrence-text";
import {
  type DiscardUnreadableDeps,
  useDiscardUnreadable,
} from "../hooks/use-discard-unreadable";
import { useFocusInside } from "../hooks/use-focus-inside";
import { type Notify, notifyActionFailure, notifyAdvanced } from "../notify";
import { DiscardUnreadableField } from "./discard-unreadable-field";
import {
  periodOf,
  placementDraftOf,
  RecurrencePlacementField,
} from "./recurrence-placement-field";
import { DateField } from "./task-panel-fields";

export interface RecurrencePopupDeps {
  setRecurrence: SetRecurrence;
  /** The next occurrence of the rule being edited, for the preview (#88). */
  previewNextOccurrence: PreviewNextOccurrence;
  /** The current logical day, for showing dates and the end day's picker. */
  today: () => CalendarDate;
  notify: Notify;
  /** Discards the task's data when it cannot be read (#106). */
  discard: DiscardUnreadableDeps;
}

/** The end conditions the popup offers (#89). */
const endKinds = ["none", "until", "count"] as const;
type EndKind = (typeof endKinds)[number];

function endKindName(kind: EndKind): string {
  switch (kind) {
    case "none":
      return t("Never");
    case "until":
      return t("On a day");
    case "count":
      return t("After a number of times");
  }
}

/** Opens the popup for `task`, replacing one already open. */
export type OpenRecurrencePopup = (task: Task) => void;

/** A whole number from 1 up typed into the interval field, or `undefined`. */
function typedInterval(text: string): number | undefined {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const interval = Number(trimmed);
  return interval >= 1 ? interval : undefined;
}

function RecurrencePopup(props: {
  task: Task;
  deps: RecurrencePopupDeps;
  onClose: () => void;
  /** Shows the popup afresh for the task as read again. */
  onReopen: (task: Task) => void;
}) {
  const { task, deps, onClose, onReopen } = props;
  const { Button, Input, ModalOverlay, Segmented, Switch, Tooltip } =
    orca.components;
  const idPrefix = React.useId();
  const id = (field: string) => `${idPrefix}-${field}`;
  const current =
    task.recurrence.kind === "rule" ? task.recurrence.rule : undefined;
  const [interval, setInterval] = React.useState(
    String(current?.period.interval ?? 1),
  );
  const [unit, setUnit] = React.useState<RecurrenceUnit>(
    current?.period.unit ?? "week",
  );
  const [basis, setBasis] = React.useState<RecurrenceBasis>(
    current?.basis ?? "schedule",
  );
  const [endKind, setEndKind] = React.useState<EndKind>(
    current?.end?.kind ?? "none",
  );
  const [endDay, setEndDay] = React.useState<CalendarDate | null>(
    current?.end?.kind === "until" ? current.end.day : null,
  );
  const [endTotal, setEndTotal] = React.useState(
    current?.end?.kind === "count" ? String(current.end.total) : "",
  );
  const [placement, setPlacement] = React.useState(() =>
    placementDraftOf(current?.period, task.due ?? task.start ?? deps.today()),
  );
  // Paused (GLOSSARY: 暂停重复, #92): saved with the rule.
  const [paused, setPaused] = React.useState(current?.paused === true);
  const [busy, setBusy] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const restoreFocus = React.useRef(true);
  useFocusInside(input, restoreFocus);
  // Discarded (#106): shown afresh with the empty value to edit, or closed
  // when the block is no longer a task.
  const discard = useDiscardUnreadable(
    deps.discard,
    task.id,
    "recurrence",
    React.useCallback(
      (read: Task | null) => (read ? onReopen(read) : onClose()),
      [onReopen, onClose],
    ),
  );

  const typed = typedInterval(interval);
  const today = deps.today();
  // The end condition as chosen; `undefined` while it is incomplete (no day
  // picked, or no whole number from 1 up typed).
  const end: RecurrenceEnd | null | undefined = (() => {
    switch (endKind) {
      case "none":
        return null;
      case "until":
        return endDay ? { kind: "until", day: endDay } : undefined;
      case "count": {
        const total = typedInterval(endTotal);
        return total === undefined ? undefined : countEnd(total, current?.end);
      }
    }
  })();
  const draft: RecurrenceRule | undefined =
    typed === undefined || end === undefined
      ? undefined
      : {
          period: periodOf(typed, unit, placement),
          basis,
          ...(end && { end }),
          ...(paused && { paused: true }),
        };
  // An unreadable rule cannot be overwritten (the repository refuses); the
  // popup says so instead of offering a save that would fail.
  const unreadable = task.recurrence.kind === "unreadable";
  // `null`: completing it today would be the last occurrence (#89).
  const preview =
    draft && !unreadable ? deps.previewNextOccurrence(draft, task) : undefined;

  const write = async (rule: RecurrenceRule | null) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await deps.setRecurrence(task.id, rule);
      // Resuming a done task advanced it (#92): its icon shows todo again, so
      // the next occurrence is told, as after completing it.
      if (result.kind === "advanced") {
        notifyAdvanced(deps.notify, {
          next: result.next,
          on: result.resumedOn,
        });
      } else if (result.kind === "ended") {
        // Resumed on its last occurrence (#89): it stays done, the rule removed.
        notifyAdvanced(deps.notify, { next: null });
      }
      onClose();
    } catch (error) {
      // The popup stays, with what was chosen.
      notifyActionFailure(deps.notify, error, (reason) =>
        t("Could not save the change: ${reason}", { reason }),
      );
      setBusy(false);
    }
  };
  const save = () => {
    if (draft === undefined || unreadable) return;
    void write(draft);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing || e.defaultPrevented) return;
    // Keys from a popup rendered elsewhere still bubble here through React.
    if (!e.currentTarget.contains(e.target as Node)) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
      e.preventDefault();
      e.stopPropagation();
      save();
    }
  };

  const text = shownText(task);
  return (
    <ModalOverlay visible={true} canClose={true} onClose={onClose}>
      <PopupLayer>
        <div
          className="nextaction-window nextaction-recurrence-popup"
          role="dialog"
          aria-modal="true"
          aria-labelledby={id("title")}
          onKeyDown={onKeyDown}
        >
          <header className="nextaction-recurrence-popup-header">
            <div className="nextaction-recurrence-popup-heading">
              <div
                className="nextaction-recurrence-popup-title"
                id={id("title")}
              >
                {t("Repeat")}
              </div>
              <div
                className="nextaction-recurrence-popup-task"
                data-empty={text.empty || undefined}
                title={text.text}
              >
                {text.text}
              </div>
            </div>
            <Tooltip text={t("Close")}>
              <Button variant="plain" aria-label={t("Close")} onClick={onClose}>
                <i className="ti ti-x" aria-hidden="true" />
              </Button>
            </Tooltip>
          </header>
          <div className="nextaction-recurrence-popup-body">
            {unreadable && (
              <div className="nextaction-recurrence-popup-warning">
                {t(
                  "This task's recurrence rule cannot be read (${reason}). It is kept as it is and cannot be changed here.",
                  { reason: task.recurrence.reason },
                )}
              </div>
            )}
            {unreadable && (
              <DiscardUnreadableField
                busy={discard.busy}
                onDiscard={discard.discard}
              />
            )}
            <div className="nextaction-recurrence-popup-field">
              <span
                className="nextaction-recurrence-popup-label"
                id={id("interval")}
              >
                {t("Every")}
              </span>
              <div className="nextaction-recurrence-popup-period">
                <Input
                  ref={input}
                  aria-labelledby={id("interval")}
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={interval}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setInterval(e.target.value)
                  }
                />
                <Segmented
                  role="group"
                  aria-labelledby={id("interval")}
                  selected={unit}
                  options={recurrenceUnits.map((value) => ({
                    value,
                    label: unitName(value),
                  }))}
                  onChange={(value) => {
                    const chosen = recurrenceUnits.find((u) => u === value);
                    if (chosen) setUnit(chosen);
                  }}
                />
              </div>
            </div>
            <RecurrencePlacementField
              labelId={id("placement")}
              unit={unit}
              draft={placement}
              onChange={setPlacement}
            />
            <div className="nextaction-recurrence-popup-field">
              <span
                className="nextaction-recurrence-popup-label"
                id={id("basis")}
              >
                {t("Next occurrence counts from")}
              </span>
              <Segmented
                role="group"
                aria-labelledby={id("basis")}
                selected={basis}
                options={recurrenceBases.map((value) => ({
                  value,
                  label: basisName(value),
                }))}
                onChange={(value) => {
                  const chosen = recurrenceBases.find((b) => b === value);
                  if (chosen) setBasis(chosen);
                }}
              />
              <div className="nextaction-recurrence-popup-hint">
                {basis === "schedule"
                  ? t(
                      "From the task's due date (or start date), whenever it is done.",
                    )
                  : t("From the day it is done.")}
              </div>
            </div>
            <div className="nextaction-recurrence-popup-field">
              <span
                className="nextaction-recurrence-popup-label"
                id={id("end")}
              >
                {t("Ends")}
              </span>
              <Segmented
                role="group"
                aria-labelledby={id("end")}
                selected={endKind}
                options={endKinds.map((value) => ({
                  value,
                  label: endKindName(value),
                }))}
                onChange={(value) => {
                  const chosen = endKinds.find((k) => k === value);
                  if (chosen) setEndKind(chosen);
                }}
              />
              {endKind === "until" && (
                <DateField
                  labelId={id("end")}
                  value={endDay}
                  today={today}
                  onChange={setEndDay}
                />
              )}
              {endKind === "count" && (
                <div className="nextaction-recurrence-popup-period">
                  <Input
                    aria-labelledby={id("end")}
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    value={endTotal}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setEndTotal(e.target.value)
                    }
                  />
                  <span>{t("times")}</span>
                  {current?.end?.kind === "count" &&
                    end?.kind === "count" &&
                    end.total === current.end.total && (
                      <span className="nextaction-recurrence-popup-hint">
                        {t("${remaining} left", {
                          remaining: String(end.remaining),
                        })}
                      </span>
                    )}
                </div>
              )}
            </div>
            {/* Pause (GLOSSARY: 暂停重复, #92): only for a rule already set. */}
            {task.recurrence.kind === "rule" && (
              <div className="nextaction-recurrence-popup-field">
                <span
                  className="nextaction-recurrence-popup-label"
                  id={id("paused")}
                >
                  {t("Pause")}
                </span>
                <div className="nextaction-recurrence-popup-pause">
                  <Switch
                    role="switch"
                    aria-checked={paused}
                    aria-labelledby={id("paused")}
                    aria-describedby={id("paused-hint")}
                    on={paused}
                    onChange={(on) => setPaused(on)}
                  />
                  <span
                    className="nextaction-recurrence-popup-hint"
                    id={id("paused-hint")}
                  >
                    {paused
                      ? task.status === "done" && current?.paused
                        ? t(
                            "The rule is kept but does not apply. Turning this off moves the done task to its next occurrence.",
                          )
                        : t(
                            "The rule is kept but does not apply: done, the task stays done.",
                          )
                      : t("Keep the rule but stop it applying for a while.")}
                  </span>
                </div>
              </div>
            )}
            {preview !== undefined && (
              <div
                className="nextaction-recurrence-popup-preview"
                aria-live="polite"
              >
                {preview === null
                  ? t(
                      "This is the last occurrence: once it is done, the task stays done and the rule is removed.",
                    )
                  : t("Done today, next: ${date}", {
                      date: formatDate(preview, today),
                    })}
              </div>
            )}
            {task.due !== null && task.start === null && (
              <div className="nextaction-recurrence-popup-hint">
                {t(
                  "Once done, it shows again right away. To have it show only when due, set a start date.",
                )}
              </div>
            )}
          </div>
          <footer className="nextaction-recurrence-popup-footer">
            {task.recurrence.kind === "rule" && (
              <Button
                variant="plain"
                disabled={busy}
                onClick={() => void write(null)}
              >
                {t("Remove rule")}
              </Button>
            )}
            <span className="nextaction-recurrence-popup-spacer" />
            <Button variant="plain" onClick={onClose}>
              {t("Cancel")}
            </Button>
            <Button
              variant="solid"
              disabled={draft === undefined || unreadable || busy}
              onClick={save}
            >
              {t("Save")}
            </Button>
          </footer>
        </div>
      </PopupLayer>
    </ModalOverlay>
  );
}

/** The popup in `render`'s root; at most one at a time. */
export function createRecurrencePopup(options: {
  deps: RecurrencePopupDeps;
  render: (node: React.ReactNode) => void;
}): OpenRecurrencePopup {
  let shown = 0;
  const open: OpenRecurrencePopup = (task) => {
    shown += 1;
    const mine = shown;
    options.render(
      <RecurrencePopup
        // Another task, or the same one read again, starts afresh.
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
