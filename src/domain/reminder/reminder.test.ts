import { describe, expect, it } from "vitest";
import {
  planSetReminders,
  quickReminderOptions,
  showsReminderBell,
  upcomingReminders,
} from "./reminder";

const day = (year: number, month: number, d: number) => ({
  year,
  month,
  day: d,
});
const nine = { hours: 9, minutes: 0 };
// Tests run in UTC+8 (vitest.config.ts).
const at = (local: string) => new Date(`${local}+08:00`);

describe("quick reminder options (GLOSSARY: 提醒)", () => {
  it("due day options fall on the due day and 1, 3 and 7 days before it, at the reminder default time", () => {
    const options = quickReminderOptions(
      { start: null, due: day(2026, 10, 20) },
      nine,
      at("2026-10-01T08:00:00"),
    );
    expect(options).toEqual([
      {
        from: "due",
        daysBefore: 0,
        at: at("2026-10-20T09:00:00"),
        selectable: true,
      },
      {
        from: "due",
        daysBefore: 1,
        at: at("2026-10-19T09:00:00"),
        selectable: true,
      },
      {
        from: "due",
        daysBefore: 3,
        at: at("2026-10-17T09:00:00"),
        selectable: true,
      },
      {
        from: "due",
        daysBefore: 7,
        at: at("2026-10-13T09:00:00"),
        selectable: true,
      },
    ]);
  });

  it("start day options fall on the start day and 1 day before it", () => {
    const options = quickReminderOptions(
      { start: day(2026, 11, 1), due: null },
      { hours: 14, minutes: 30 },
      at("2026-10-01T08:00:00"),
    );
    expect(
      options.map(({ from, daysBefore, at }) => [from, daysBefore, at]),
    ).toEqual([
      ["start", 0, at("2026-11-01T14:30:00")],
      ["start", 1, at("2026-10-31T14:30:00")],
    ]);
  });

  it("a task without either date has no options", () => {
    expect(
      quickReminderOptions(
        { start: null, due: null },
        nine,
        at("2026-10-01T08:00:00"),
      ),
    ).toEqual([]);
  });

  it("takes the calendar day, not the logical day: 3:00 on the due day is that calendar day's 3:00, before a 5:00 day boundary", () => {
    const [dueDay] = quickReminderOptions(
      { start: null, due: day(2026, 10, 20) },
      { hours: 3, minutes: 0 },
      at("2026-10-01T08:00:00"),
    );
    expect(dueDay?.at).toEqual(at("2026-10-20T03:00:00"));
  });

  it("an option worked out to a moment not later than now cannot be picked", () => {
    const options = quickReminderOptions(
      { start: null, due: day(2026, 10, 20) },
      nine,
      // Exactly 1 day before at 9:00.
      at("2026-10-19T09:00:00"),
    );
    expect(options.map((option) => option.selectable)).toEqual([
      true,
      false,
      false,
      false,
    ]);
  });
});

describe("setting a task's reminders", () => {
  const now = at("2026-10-12T10:00:00");

  it("refuses a newly added moment not later than now", () => {
    expect(planSetReminders([], [at("2026-10-12T10:00:00")], now)).toEqual({
      kind: "refused",
      past: [at("2026-10-12T10:00:00")],
    });
  });

  it("writes the moments in order, each once", () => {
    expect(
      planSetReminders(
        [],
        [
          at("2026-10-20T09:00:00"),
          at("2026-10-13T09:00:00"),
          at("2026-10-20T09:00:00"),
        ],
        now,
      ),
    ).toEqual({
      kind: "write",
      reminders: [at("2026-10-13T09:00:00"), at("2026-10-20T09:00:00")],
    });
  });

  it("keeps a reminder the task already had though it has passed", () => {
    const passed = at("2026-10-10T09:00:00");
    expect(
      planSetReminders([passed], [passed, at("2026-10-13T09:00:00")], now),
    ).toEqual({
      kind: "write",
      reminders: [passed, at("2026-10-13T09:00:00")],
    });
  });

  it("clears every reminder", () => {
    expect(
      planSetReminders(
        [at("2026-10-10T09:00:00"), at("2026-10-13T09:00:00")],
        [],
        now,
      ),
    ).toEqual({ kind: "write", reminders: [] });
  });
});

describe("upcoming reminders and the bell", () => {
  const now = at("2026-10-12T10:00:00");

  it("upcoming reminders are those later than now", () => {
    expect(
      upcomingReminders(
        [
          at("2026-10-11T09:00:00"),
          at("2026-10-12T10:00:00"),
          at("2026-10-13T09:00:00"),
        ],
        now,
      ),
    ).toEqual([at("2026-10-13T09:00:00")]);
  });

  const list = (...moments: Date[]) =>
    ({ kind: "list", reminders: moments }) as const;

  it.each([
    ["an upcoming reminder", "todo", list(at("2026-10-13T09:00:00")), true],
    ["every reminder passed", "todo", list(at("2026-10-11T09:00:00")), false],
    ["no reminders", "waiting", { kind: "none" }, false],
    ["an empty list", "doing", list(), false],
    [
      "reminders it cannot read",
      "todo",
      { kind: "unreadable", reason: "unknown version 2" },
      false,
    ],
    [
      "done, with an upcoming reminder",
      "done",
      list(at("2026-10-13T09:00:00")),
      false,
    ],
  ] as const)(
    "the bell for a task with %s (%s)",
    (_, status, reminders, shown) => {
      expect(showsReminderBell({ status, reminders }, now)).toBe(shown);
    },
  );
});
