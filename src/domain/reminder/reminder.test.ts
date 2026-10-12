import { describe, expect, it } from "vitest";
import type { TaskStatus } from "../task/task";
import {
  dueReminders,
  moveReminders,
  nextWakeUp,
  planSetReminders,
  quickReminderOptions,
  type ReminderRead,
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

describe("due reminders (GLOSSARY: 提醒, 错过的提醒)", () => {
  const list = (...moments: Date[]) =>
    ({ kind: "list", reminders: moments }) as const;
  const task = (
    id: number,
    reminders: ReminderRead,
    status: TaskStatus = "todo",
  ) => ({ id, status, reminders });

  it("lists the reminders after the start, not at it, up to and at now", () => {
    expect(
      dueReminders(
        [
          task(
            1,
            list(
              at("2026-10-12T09:00:00"),
              at("2026-10-12T09:30:00"),
              at("2026-10-12T10:00:00"),
              at("2026-10-12T10:00:01"),
            ),
          ),
        ],
        at("2026-10-12T09:00:00"),
        at("2026-10-12T10:00:00"),
      ),
    ).toEqual([
      { taskId: 1, at: at("2026-10-12T09:30:00") },
      { taskId: 1, at: at("2026-10-12T10:00:00") },
    ]);
  });

  it("lists each task's reminder at the same moment once each, by moment", () => {
    expect(
      dueReminders(
        [
          task(1, list(at("2026-10-12T09:40:00"))),
          task(2, list(at("2026-10-12T09:20:00"), at("2026-10-12T09:40:00"))),
        ],
        at("2026-10-12T09:00:00"),
        at("2026-10-12T10:00:00"),
      ),
    ).toEqual([
      { taskId: 2, at: at("2026-10-12T09:20:00") },
      { taskId: 1, at: at("2026-10-12T09:40:00") },
      { taskId: 2, at: at("2026-10-12T09:40:00") },
    ]);
  });

  it("skips done tasks and reminders it cannot read", () => {
    expect(
      dueReminders(
        [
          task(1, list(at("2026-10-12T09:30:00")), "done"),
          task(2, { kind: "unreadable", reason: "unknown version 2" }),
          task(3, { kind: "none" }),
          task(4, list(at("2026-10-12T09:30:00")), "waiting"),
        ],
        at("2026-10-12T09:00:00"),
        at("2026-10-12T10:00:00"),
      ),
    ).toEqual([{ taskId: 4, at: at("2026-10-12T09:30:00") }]);
  });

  it("lists every reminder missed over a long time, one by one", () => {
    expect(
      dueReminders(
        [
          task(
            1,
            list(
              at("2026-09-01T09:00:00"),
              at("2026-09-20T09:00:00"),
              at("2026-10-12T08:00:00"),
            ),
          ),
          task(2, list(at("2026-10-01T09:00:00"))),
        ],
        at("2026-08-31T23:00:00"),
        at("2026-10-12T10:00:00"),
      ),
    ).toEqual([
      { taskId: 1, at: at("2026-09-01T09:00:00") },
      { taskId: 1, at: at("2026-09-20T09:00:00") },
      { taskId: 2, at: at("2026-10-01T09:00:00") },
      { taskId: 1, at: at("2026-10-12T08:00:00") },
    ]);
  });
});

describe("the next wake-up", () => {
  const list = (...moments: Date[]) =>
    ({ kind: "list", reminders: moments }) as const;
  const now = at("2026-10-12T10:00:00");

  it("is the earliest reminder later than now among tasks not done", () => {
    expect(
      nextWakeUp(
        [
          { id: 1, status: "todo", reminders: list(at("2026-10-14T09:00:00")) },
          {
            id: 2,
            status: "waiting",
            reminders: list(
              at("2026-10-11T09:00:00"),
              now,
              at("2026-10-13T09:00:00"),
            ),
          },
        ],
        now,
      ),
    ).toEqual(at("2026-10-13T09:00:00"));
  });

  it("does not count done tasks", () => {
    expect(
      nextWakeUp(
        [
          { id: 1, status: "done", reminders: list(at("2026-10-13T09:00:00")) },
          { id: 2, status: "todo", reminders: list(at("2026-10-14T09:00:00")) },
        ],
        now,
      ),
    ).toEqual(at("2026-10-14T09:00:00"));
  });

  it("is none when no reminder is to come", () => {
    expect(
      nextWakeUp(
        [
          { id: 1, status: "todo", reminders: list(at("2026-10-11T09:00:00")) },
          { id: 2, status: "done", reminders: list(at("2026-10-13T09:00:00")) },
          {
            id: 3,
            status: "todo",
            reminders: { kind: "unreadable", reason: "damaged" },
          },
          { id: 4, status: "todo", reminders: { kind: "none" } },
        ],
        now,
      ),
    ).toBeNull();
  });
});

describe("moving reminders when a recurring task advances (GLOSSARY: 安排下一次)", () => {
  it("moves each reminder as many calendar days as the due date moves, keeping its local time", () => {
    expect(
      moveReminders(
        [at("2026-10-17T09:00:00"), at("2026-10-20T14:30:00")],
        { start: null, due: day(2026, 10, 20) },
        day(2026, 10, 27),
      ),
    ).toEqual([at("2026-10-24T09:00:00"), at("2026-10-27T14:30:00")]);
  });

  it("moves them with the start date when the task has no due date", () => {
    expect(
      moveReminders(
        [at("2026-10-12T09:00:00")],
        { start: day(2026, 10, 12), due: null },
        day(2026, 10, 19),
      ),
    ).toEqual([at("2026-10-19T09:00:00")]);
  });

  it("moves them with the due date when the task has both dates", () => {
    expect(
      moveReminders(
        [at("2026-10-14T09:00:00")],
        { start: day(2026, 10, 10), due: day(2026, 10, 15) },
        day(2026, 10, 18),
      ),
    ).toEqual([at("2026-10-17T09:00:00")]);
  });

  it("moves them across the end of a month", () => {
    expect(
      moveReminders(
        [at("2026-10-28T08:15:00")],
        { start: null, due: day(2026, 10, 31) },
        day(2026, 11, 30),
      ),
    ).toEqual([at("2026-11-27T08:15:00")]);
  });

  it("without dates, puts the earliest reminder on the next date at its local time and keeps the others as far from it", () => {
    expect(
      moveReminders(
        [at("2026-10-12T21:00:00"), at("2026-10-10T09:30:00")],
        { start: null, due: null },
        day(2026, 10, 20),
      ),
    ).toEqual([at("2026-10-20T09:30:00"), at("2026-10-22T21:00:00")]);
  });

  it("keeps a moved reminder that is still in the past", () => {
    // A task months behind: the next date is still past, and so is the
    // reminder moved with it; it stays, and is never notified.
    expect(
      moveReminders(
        [at("2026-06-29T09:00:00")],
        { start: null, due: day(2026, 7, 1) },
        day(2026, 7, 8),
      ),
    ).toEqual([at("2026-07-06T09:00:00")]);
  });

  it("moves no reminders when the task has none", () => {
    expect(
      moveReminders([], { start: null, due: null }, day(2026, 10, 20)),
    ).toEqual([]);
  });
});
