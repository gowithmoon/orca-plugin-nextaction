import { describe, expect, it } from "vitest";
import {
  type DescendantCandidate,
  planDescendantResets,
} from "./descendant-reset";

/** The plan when every descendant task to reset is readable. */
const resets = (list: unknown[]) => ({ kind: "resets", resets: list });

const day = (year: number, month: number, date: number) => ({
  year,
  month,
  day: date,
});

/** A task below `parentId`: done, without dates or a rule unless told. */
const below = (
  id: number,
  parentId: number | null,
  task: Partial<DescendantCandidate["task"]> = {},
): DescendantCandidate => ({
  parentId,
  task: {
    id,
    status: "done",
    start: null,
    due: null,
    recurrence: { kind: "none" },
    ...task,
  },
});

describe("resetting the descendant tasks of an advanced recurring task", () => {
  // 每周大扫除, due Monday 2026-10-12, advanced to Monday 2026-10-19.
  const weeklyCleaning = { id: 1, start: null, due: day(2026, 10, 12) };
  const next = day(2026, 10, 19);

  it("a done subtask goes back to todo, its due date moved by the same days", () => {
    expect(
      planDescendantResets(weeklyCleaning, next, [
        below(2, 1, { due: day(2026, 10, 11) }),
      ]),
    ).toEqual(
      resets([{ id: 2, changes: { status: "todo", due: day(2026, 10, 18) } }]),
    );
  });

  it("a done task deeper down goes back to todo too, below a subtask left as it is", () => {
    // The parent task is the nearest task ancestor, so plain blocks between
    // tasks (ADR 0003) are already left out of the graph.
    expect(
      planDescendantResets(weeklyCleaning, next, [
        below(2, 1, { status: "todo" }),
        below(3, 2, { start: day(2026, 10, 10) }),
        below(9, null),
      ]),
    ).toEqual(
      resets([
        { id: 3, changes: { status: "todo", start: day(2026, 10, 17) } },
      ]),
    );
  });

  it("a done descendant task with a rule of its own is left as it is", () => {
    // A paused rule is still a rule (kind "rule"): it is left as it is too.
    const daily = {
      kind: "rule",
      rule: { period: { interval: 1, unit: "day" }, basis: "schedule" },
    } as const;
    expect(
      planDescendantResets(weeklyCleaning, next, [
        below(2, 1, { recurrence: daily, due: day(2026, 10, 11) }),
        below(3, 2),
      ]),
    ).toEqual(resets([{ id: 3, changes: { status: "todo" } }]));
  });

  it("a done descendant task whose rule is paused is left as it is too (#92)", () => {
    const paused = {
      kind: "rule",
      rule: {
        period: { interval: 1, unit: "day" },
        basis: "schedule",
        paused: true,
      },
    } as const;
    expect(
      planDescendantResets(weeklyCleaning, next, [
        below(2, 1, { recurrence: paused, due: day(2026, 10, 11) }),
      ]),
    ).toEqual(resets([]));
  });

  it("a done descendant task whose rule cannot be read stops the reset: whether it has a rule of its own is unknown", () => {
    expect(
      planDescendantResets(weeklyCleaning, next, [
        below(2, 1),
        below(3, 1, {
          recurrence: { kind: "unreadable", reason: "unknown version 2" },
        }),
      ]),
    ).toEqual({ kind: "unreadable", id: 3, reason: "unknown version 2" });
  });

  it("a descendant task not done is left as it is, even when its rule cannot be read", () => {
    expect(
      planDescendantResets(weeklyCleaning, next, [
        below(2, 1, {
          status: "doing",
          recurrence: { kind: "unreadable", reason: "unknown version 2" },
        }),
      ]),
    ).toEqual(resets([]));
  });

  it("when the task had no dates, its descendant tasks keep theirs", () => {
    // The next occurrence is written as the start: nothing moved to follow.
    const undated = { id: 1, start: null, due: null };
    expect(
      planDescendantResets(undated, next, [
        below(2, 1, { start: day(2026, 10, 1), due: day(2026, 10, 5) }),
      ]),
    ).toEqual(resets([{ id: 2, changes: { status: "todo" } }]));
  });

  it("when the task had only a start date, its descendant tasks move as far as the start", () => {
    const startOnly = { id: 1, start: day(2026, 10, 15), due: null };
    expect(
      planDescendantResets(startOnly, day(2026, 10, 22), [
        below(2, 1, { due: day(2026, 10, 16) }),
      ]),
    ).toEqual(
      resets([{ id: 2, changes: { status: "todo", due: day(2026, 10, 23) } }]),
    );
  });
});
