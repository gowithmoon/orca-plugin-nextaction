import { describe, expect, it } from "vitest";
import type { CalendarDate, Rating, TaskId } from "../task/task";
import { rankByScore, type ScoreInput, score } from "./score";

const today: CalendarDate = { year: 2026, month: 10, day: 9 };

const day = (year: number, month: number, d: number): CalendarDate => ({
  year,
  month,
  day: d,
});

/** Inputs neutral unless given: no dates, importance and effort 4. */
function input(
  setup: {
    id?: TaskId;
    due?: CalendarDate;
    start?: CalendarDate;
    importance?: Rating;
    effort?: Rating;
  } = {},
): ScoreInput {
  return {
    task: {
      id: setup.id ?? 1,
      due: setup.due ?? null,
      importance: setup.importance ?? 4,
      effort: setup.effort ?? 4,
    },
    effectiveStart: setup.start ?? null,
  };
}

// Expected values are worked by hand from #51 "领域：评分":
// (0.45 × due + 0.25 × start + 0.30 × importance) / effort factor.
// With no dates, importance 4 and effort 4: 0.45 × 35 + 0.25 × 100 + 0.30 × 50.
const neutral = 55.75;

describe("score", () => {
  it("scores a task with no dates, importance 4 and effort 4 as 55.75", () => {
    expect(score(input(), today)).toBeCloseTo(neutral, 9);
  });

  describe("due", () => {
    it("gives a task due today a due score of 100", () => {
      expect(score(input({ due: today }), today)).toBeCloseTo(85, 9);
    });

    it("adds half a point per day overdue", () => {
      // 10 days overdue: 105.
      expect(score(input({ due: day(2026, 9, 29) }), today)).toBeCloseTo(
        87.25,
        9,
      );
    });

    it("stops adding at 20 points, from 40 days overdue on", () => {
      expect(score(input({ due: day(2026, 8, 30) }), today)).toBeCloseTo(94, 9);
      expect(score(input({ due: day(2025, 1, 1) }), today)).toBeCloseTo(94, 9);
    });

    it("falls from 100 towards 35 as the due day lies further ahead", () => {
      // 5 days ahead: 35 + 65 × e^−1 = 58.9123.
      expect(score(input({ due: day(2026, 10, 14) }), today)).toBeCloseTo(
        66.5105,
        4,
      );
    });
  });

  describe("start", () => {
    it("gives a start today or earlier a start score of 100", () => {
      expect(score(input({ start: today }), today)).toBeCloseTo(neutral, 9);
      expect(score(input({ start: day(2026, 9, 1) }), today)).toBeCloseTo(
        neutral,
        9,
      );
    });

    it("gives a start 14 days ahead or more a start score of 10", () => {
      expect(score(input({ start: day(2026, 10, 23) }), today)).toBeCloseTo(
        33.25,
        9,
      );
      expect(score(input({ start: day(2027, 3, 1) }), today)).toBeCloseTo(
        33.25,
        9,
      );
    });

    it("curves between the two: 7 days ahead scores 32.5", () => {
      expect(score(input({ start: day(2026, 10, 16) }), today)).toBeCloseTo(
        38.875,
        9,
      );
    });
  });

  it("maps importance 1, 4 and 7 to 10, 50 and 90", () => {
    expect(score(input({ importance: 1 }), today)).toBeCloseTo(43.75, 9);
    expect(score(input({ importance: 4 }), today)).toBeCloseTo(neutral, 9);
    expect(score(input({ importance: 7 }), today)).toBeCloseTo(67.75, 9);
  });

  it("leaves effort 4 neutral and scores more effort lower", () => {
    // 55.75 / 1.15 and 55.75 / 0.85.
    expect(score(input({ effort: 7 }), today)).toBeCloseTo(48.4783, 4);
    expect(score(input({ effort: 1 }), today)).toBeCloseTo(65.5882, 4);
  });

  it("counts whole calendar days across month and year ends", () => {
    // From the logical day 2026-12-31, 2027-01-05 is 5 days ahead.
    expect(
      score(input({ due: day(2027, 1, 5) }), day(2026, 12, 31)),
    ).toBeCloseTo(66.5105, 4);
    // From 2027-01-01, 2026-11-22 is 40 days overdue: the cap.
    expect(
      score(input({ due: day(2026, 11, 22) }), day(2027, 1, 1)),
    ).toBeCloseTo(94, 9);
    // From 2027-01-01, 2026-11-23 is 39 days overdue: just under it.
    expect(
      score(input({ due: day(2026, 11, 23) }), day(2027, 1, 1)),
    ).toBeCloseTo(93.775, 9);
  });
});

describe("rank by score", () => {
  const ids = (ranked: readonly ScoreInput[]) =>
    ranked.map((item) => item.task.id);

  it("puts the higher score first", () => {
    const ranked = rankByScore(
      [
        input({ id: 1, importance: 1 }),
        input({ id: 2, due: today }),
        input({ id: 3 }),
      ],
      today,
    );

    expect(ids(ranked)).toEqual([2, 3, 1]);
  });

  it("on a tie, puts the earlier due day first and no due day last", () => {
    // A due day 200 days ahead or more scores 35 to the last digit, as no
    // due day does.
    const ranked = rankByScore(
      [
        input({ id: 1 }),
        input({ id: 2, due: day(2027, 10, 9) }),
        input({ id: 3, due: day(2027, 6, 1) }),
      ],
      today,
    );

    expect(ids(ranked)).toEqual([3, 2, 1]);
  });

  it("then puts the higher importance first", () => {
    // Both score 32.5 by hand: start 7 days ahead, importance 2, effort 3
    // (30.875 / 0.95); start 14 days ahead, importance 3, effort 2
    // (29.25 / 0.9).
    const ranked = rankByScore(
      [
        input({ id: 1, start: day(2026, 10, 16), importance: 2, effort: 3 }),
        input({ id: 2, start: day(2026, 10, 23), importance: 3, effort: 2 }),
      ],
      today,
    );

    expect(ids(ranked)).toEqual([2, 1]);
  });

  it("then puts the lower task ID first", () => {
    const ranked = rankByScore(
      [input({ id: 9 }), input({ id: 3 }), input({ id: 5 })],
      today,
    );

    expect(ids(ranked)).toEqual([3, 5, 9]);
  });
});
