// The schedule popup (#84 排期弹窗): a start time (hours:minutes) and a length
// (minutes, 60 by default) for a task in today's My Day; scheduling snaps
// them through the domain (`normalizeSchedule`). A scheduled task can be
// unscheduled here too, so every schedule change works without dragging.
// In Orca's ModalOverlay with the shared window look, rendered into its own
// React root (the view's container query would otherwise hold the fixed
// window inside the view). At most one at a time. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import {
  type MyDaySchedule,
  scheduleStepMinutes,
} from "../../../domain/task/my-day";
import type { Task } from "../../../domain/task/task";
import {
  type LogicalDayRange,
  momentOn,
} from "../../../domain/time/logical-day";
import { t } from "../../../shared/l10n/l10n";
import { formatTimeRange, shownText } from "../../components/format";
import { PopupLayer } from "../../components/popup-layer";
import { useFocusInside } from "../../hooks/use-focus-inside";
import {
  type MyDayScheduleActions,
  type MyDayScheduleDeps,
  myDayScheduleActions,
} from "../../hooks/use-my-day-schedule";

/** The length a new schedule gets (#81: 60 minutes, not a setting). */
export const defaultScheduleMinutes = 60;

/** What the popup is opened on. */
export interface SchedulePopupArgs {
  readonly task: Task;
  /** Today's time range the view read by. */
  readonly range: LogicalDayRange;
  /** Its schedule today; absent while unscheduled. */
  readonly schedule?: MyDaySchedule;
  /** The current time, for a new schedule's start. */
  readonly now: Date;
}

/** Opens the schedule popup, replacing one already open. */
export type OpenSchedulePopup = (args: SchedulePopupArgs) => void;

const minuteMs = 60_000;

/** "HH:MM" for a native time input. */
function timeValue(at: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(at.getHours())}:${two(at.getMinutes())}`;
}

/** The hours and minutes a native time input holds, or `undefined` when cleared. */
function parseTime(
  value: string,
): { hours: number; minutes: number } | undefined {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return undefined;
  return { hours, minutes };
}

/**
 * Where a new schedule starts: the next quarter hour from now when now is
 * today, otherwise the day boundary.
 */
function newStart(range: LogicalDayRange, now: Date): Date {
  const inside =
    now.getTime() >= range.start.getTime() &&
    now.getTime() < range.end.getTime();
  if (!inside) return range.start;
  const step = scheduleStepMinutes * minuteMs;
  return new Date(Math.ceil(now.getTime() / step) * step);
}

function SchedulePopup(props: {
  args: SchedulePopupArgs;
  actions: MyDayScheduleActions;
  onClose: () => void;
}) {
  const { args, actions, onClose } = props;
  const { Button, Input, ModalOverlay, Tooltip } = orca.components;
  const idPrefix = React.useId();
  const id = (field: string) => `${idPrefix}-${field}`;
  const [start, setStart] = React.useState(() =>
    timeValue(args.schedule?.start ?? newStart(args.range, args.now)),
  );
  const [minutes, setMinutes] = React.useState(() =>
    String(
      args.schedule
        ? Math.round(
            (args.schedule.end.getTime() - args.schedule.start.getTime()) /
              minuteMs,
          )
        : defaultScheduleMinutes,
    ),
  );
  const [busy, setBusy] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const restoreFocus = React.useRef(true);
  useFocusInside(input, restoreFocus);

  const time = parseTime(start);
  const length = Number(minutes);
  const valid = time !== undefined && minutes.trim() !== "" && length > 0;

  const run = async (write: () => Promise<boolean>) => {
    if (busy) return;
    setBusy(true);
    // A failure was told to the user; the popup stays, with what was typed.
    if (await write()) onClose();
    else setBusy(false);
  };
  const submit = () => {
    if (!valid || !time) return;
    void run(() =>
      actions.schedule(args.task.id, {
        start: momentOn(args.range, time),
        minutes: length,
      }),
    );
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
      submit();
    }
  };

  const text = shownText(args.task);
  return (
    <ModalOverlay visible={true} canClose={true} onClose={onClose}>
      <PopupLayer>
        <div
          className="nextaction-window nextaction-schedule-popup"
          role="dialog"
          aria-modal="true"
          aria-labelledby={id("title")}
          onKeyDown={onKeyDown}
        >
          <header className="nextaction-schedule-popup-header">
            <div className="nextaction-schedule-popup-heading">
              <div className="nextaction-schedule-popup-title" id={id("title")}>
                {t("Schedule")}
              </div>
              <div
                className="nextaction-schedule-popup-task"
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
          <div className="nextaction-schedule-popup-body">
            <div className="nextaction-schedule-popup-field">
              <span
                className="nextaction-schedule-popup-label"
                id={id("start")}
              >
                {t("Start time")}
              </span>
              <Input
                ref={input}
                aria-labelledby={id("start")}
                type="time"
                step={scheduleStepMinutes * 60}
                value={start}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setStart(e.target.value)
                }
              />
            </div>
            <div className="nextaction-schedule-popup-field">
              <span
                className="nextaction-schedule-popup-label"
                id={id("minutes")}
              >
                {t("Length (minutes)")}
              </span>
              <Input
                aria-labelledby={id("minutes")}
                type="number"
                min={scheduleStepMinutes}
                step={scheduleStepMinutes}
                inputMode="numeric"
                value={minutes}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setMinutes(e.target.value)
                }
              />
            </div>
            <div className="nextaction-schedule-popup-hint">
              {args.schedule
                ? t("Now ${times}", { times: formatTimeRange(args.schedule) })
                : t("Snaps to 15 minutes, within today")}
            </div>
          </div>
          <footer className="nextaction-schedule-popup-footer">
            {args.schedule && (
              <Button
                variant="plain"
                disabled={busy}
                onClick={() => void run(() => actions.unschedule(args.task.id))}
              >
                {t("Unschedule")}
              </Button>
            )}
            <span className="nextaction-schedule-popup-spacer" />
            <Button variant="plain" onClick={onClose}>
              {t("Cancel")}
            </Button>
            <Button variant="solid" disabled={!valid || busy} onClick={submit}>
              {t("Schedule")}
            </Button>
          </footer>
        </div>
      </PopupLayer>
    </ModalOverlay>
  );
}

/** The popup in `render`'s root; at most one at a time. */
export function createSchedulePopup(options: {
  deps: MyDayScheduleDeps;
  render: (node: React.ReactNode) => void;
}): OpenSchedulePopup {
  const actions = myDayScheduleActions(options.deps);
  let shown = 0;
  return (args) => {
    shown += 1;
    const mine = shown;
    options.render(
      <SchedulePopup
        // Another task starts afresh.
        key={mine}
        args={args}
        actions={actions}
        onClose={() => {
          if (mine === shown) options.render(null);
        }}
      />,
    );
  };
}
