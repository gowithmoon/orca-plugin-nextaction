// The standing schedule row of the recurrence rule popup (GLOSSARY: 常设排期,
// #243): a start and an end time of day on 15-minute steps, both cleared for
// none. The times are checked as the domain checks them before saving
// (`standingScheduleProblem`), saying why they cannot be saved. Verified by
// hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import { scheduleStepMinutes } from "../../domain/task/my-day";
import {
  type StandingSchedule,
  type StandingScheduleRead,
  standingScheduleProblem,
} from "../../domain/task/standing-schedule";
import type { DayBoundary } from "../../domain/time/logical-day";
import type { TimeOfDay } from "../../domain/time/time-of-day";
import { t } from "../../shared/l10n/l10n";

/** What the two time inputs hold: "HH:MM", or "" when cleared. */
export interface StandingScheduleDraft {
  readonly start: string;
  readonly end: string;
}

const two = (n: number) => String(n).padStart(2, "0");

/** `time` as a native time input holds it. */
const inputValue = (time: TimeOfDay) =>
  `${two(time.hours)}:${two(time.minutes)}`;

/** The hours and minutes a native time input holds, or `undefined`. */
function parseInput(value: string): TimeOfDay | undefined {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? { hours, minutes } : undefined;
}

/** The draft of the standing schedule a task holds; empty for none. */
export function standingDraftOf(
  read: StandingScheduleRead,
): StandingScheduleDraft {
  return read.kind === "schedule"
    ? {
        start: inputValue(read.schedule.start),
        end: inputValue(read.schedule.end),
      }
    : { start: "", end: "" };
}

/**
 * What the draft saves: a standing schedule, or none (`null`) when both
 * times are cleared; or why it cannot be saved, for the row to say.
 */
export type StandingScheduleChoice =
  | { readonly kind: "valid"; readonly schedule: StandingSchedule | null }
  | { readonly kind: "invalid"; readonly message: string };

export function standingChoiceOf(
  draft: StandingScheduleDraft,
  boundary: DayBoundary,
): StandingScheduleChoice {
  if (draft.start === "" && draft.end === "") {
    return { kind: "valid", schedule: null };
  }
  const start = parseInput(draft.start);
  const end = parseInput(draft.end);
  if (!start || !end) {
    return {
      kind: "invalid",
      message: t("Set both a start and an end time, or clear both."),
    };
  }
  const schedule = { start, end };
  switch (standingScheduleProblem(schedule, boundary)) {
    case undefined:
      return { kind: "valid", schedule };
    case "off-step":
      return { kind: "invalid", message: t("Times snap to 15 minutes.") };
    case "empty":
      return {
        kind: "invalid",
        message: t("The end time must be after the start time."),
      };
    case "crosses-day-boundary":
      return {
        kind: "invalid",
        message: t(
          "The times cross the day boundary (${boundary}). Choose times within one day.",
          { boundary: `${boundary.hours}:${two(boundary.minutes)}` },
        ),
      };
  }
}

/** Whether `a` and `b` are the same standing schedule, or both none. */
export function sameStandingSchedule(
  a: StandingSchedule | null,
  b: StandingSchedule | null,
): boolean {
  if (a === null || b === null) return a === b;
  const same = (x: TimeOfDay, y: TimeOfDay) =>
    x.hours === y.hours && x.minutes === y.minutes;
  return same(a.start, b.start) && same(a.end, b.end);
}

/** The row: two time inputs, a clear button, and a hint or what is wrong. */
export function StandingScheduleField(props: {
  draft: StandingScheduleDraft;
  /** Why the draft cannot be saved; `undefined` when it can. */
  problem: string | undefined;
  onChange: (draft: StandingScheduleDraft) => void;
}) {
  const { draft, problem, onChange } = props;
  const { Button, Input } = orca.components;
  const labelId = React.useId();
  const time = (field: keyof StandingScheduleDraft, label: string) => (
    <Input
      aria-label={label}
      aria-describedby={labelId}
      type="time"
      step={scheduleStepMinutes * 60}
      value={draft[field]}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
        onChange({ ...draft, [field]: e.target.value })
      }
    />
  );
  return (
    <div className="nextaction-recurrence-popup-field">
      <span className="nextaction-recurrence-popup-label" id={labelId}>
        {t("Standing schedule")}
      </span>
      <div className="nextaction-recurrence-popup-standing">
        {time("start", t("Start time"))}
        <span>{t("to")}</span>
        {time("end", t("End time"))}
        {(draft.start !== "" || draft.end !== "") && (
          <Button
            variant="plain"
            onClick={() => onChange({ start: "", end: "" })}
          >
            {t("Clear")}
          </Button>
        )}
      </div>
      {problem !== undefined ? (
        <div className="nextaction-recurrence-popup-warning">{problem}</div>
      ) : (
        <div className="nextaction-recurrence-popup-hint">
          {t("Each day it is to be done, it shows in My Day at these times.")}
        </div>
      )}
    </div>
  );
}
