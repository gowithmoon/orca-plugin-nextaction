import { describe, expect, it } from "vitest";
import type { CalendarDate, Rating, TaskId } from "../task/task";
import { rankByScore, type ScoreInput, score } from "./score";

const today: CalendarDate = { year: 2026, month: 10, day: 9 };

const day = (year: number, month: number, d: number): CalendarDate => ({
  year,
  month,
  day: d,
});

/**
 * Inputs neutral unless given: no dates, importance, urgency and effort 4,
 * no ancestor tasks. The effective start defaults to the task's own start.
 */
function input(
  setup: {
    id?: TaskId;
    due?: CalendarDate;
    start?: CalendarDate;
    effectiveStart?: CalendarDate;
    importance?: Rating;
    urgency?: Rating;
    effort?: Rating;
    ancestors?: { importance?: Rating; urgency?: Rating }[];
  } = {},
): ScoreInput {
  return {
    task: {
      id: setup.id ?? 1,
      due: setup.due ?? null,
      start: setup.start ?? null,
      importance: setup.importance ?? 4,
      urgency: setup.urgency ?? 4,
      effort: setup.effort ?? 4,
    },
    effectiveStart: setup.effectiveStart ?? setup.start ?? null,
    ancestorRatings: (setup.ancestors ?? []).map((ancestor) => ({
      importance: ancestor.importance ?? 4,
      urgency: ancestor.urgency ?? 4,
    })),
  };
}

// Expected values are worked by hand from #76:
// (0.35 × due + 0.20 × start + 0.25 × importance + 0.20 × urgency) / effort
// factor. With no dates and everything at 4:
// 0.35 × 35 + 0.20 × 100 + 0.25 × 50 + 0.20 × 50 = 54.75.
const neutral = 54.75;

describe("score", () => {
  it("scores a task with no dates and importance, urgency and effort 4 as 54.75", () => {
    expect(score(input(), today)).toBeCloseTo(neutral, 9);
  });

  describe("due", () => {
    it("gives a task due today a due score of 100", () => {
      expect(score(input({ due: today }), today)).toBeCloseTo(77.5, 9);
    });

    it("falls from 100 towards 35 as the due day lies further ahead", () => {
      // 5 days ahead: 35 + 65 × e^−1 = 58.9123.
      expect(score(input({ due: day(2026, 10, 14) }), today)).toBeCloseTo(
        63.1193,
        4,
      );
    });

    it("adds half the square of the days overdue: 3, 7 and 14 days give 104.5, 124.5 and 198", () => {
      expect(score(input({ due: day(2026, 10, 6) }), today)).toBeCloseTo(
        79.075,
        9,
      );
      expect(score(input({ due: day(2026, 10, 2) }), today)).toBeCloseTo(
        86.075,
        9,
      );
      expect(score(input({ due: day(2026, 9, 25) }), today)).toBeCloseTo(
        111.8,
        9,
      );
    });

    it("has no cap: 40 days overdue gives 900", () => {
      expect(score(input({ due: day(2026, 8, 30) }), today)).toBeCloseTo(
        357.5,
        9,
      );
    });
  });

  describe("start", () => {
    it("gives an effective start 14 days ahead or more a start score of 10", () => {
      expect(score(input({ start: day(2026, 10, 23) }), today)).toBeCloseTo(
        36.75,
        9,
      );
      expect(score(input({ start: day(2027, 3, 1) }), today)).toBeCloseTo(
        36.75,
        9,
      );
    });

    it("curves between: 7 days ahead gives a start score of 32.5", () => {
      expect(score(input({ start: day(2026, 10, 16) }), today)).toBeCloseTo(
        41.25,
        9,
      );
    });

    it("gives a start score of 100 once started, or without any start", () => {
      expect(score(input({ start: today }), today)).toBeCloseTo(neutral, 9);
      expect(score(input(), today)).toBeCloseTo(neutral, 9);
    });

    it("ages one point a day after the task's own start", () => {
      // 1 and 10 days ago: start scores 101 and 110.
      expect(score(input({ start: day(2026, 10, 8) }), today)).toBeCloseTo(
        54.95,
        9,
      );
      expect(score(input({ start: day(2026, 9, 29) }), today)).toBeCloseTo(
        56.75,
        9,
      );
    });

    it("stops ageing at 30 points, from 30 days after the start on", () => {
      expect(score(input({ start: day(2026, 9, 9) }), today)).toBeCloseTo(
        60.75,
        9,
      );
      expect(score(input({ start: day(2025, 1, 1) }), today)).toBeCloseTo(
        60.75,
        9,
      );
    });

    it("ages only by the task's own start, not an ancestor task's", () => {
      // The effective start comes from an ancestor task 10 days ago.
      expect(
        score(input({ effectiveStart: day(2026, 9, 29) }), today),
      ).toBeCloseTo(neutral, 9);
      // An ancestor task started 20 days ago, the task itself 5 days ago.
      expect(
        score(
          input({ start: day(2026, 10, 4), effectiveStart: day(2026, 10, 4) }),
          today,
        ),
      ).toBeCloseTo(55.75, 9);
    });

    it("does not age within the preview, whatever its own start", () => {
      // Its own start was 20 days ago; an ancestor task starts in 7 days.
      expect(
        score(
          input({ start: day(2026, 9, 19), effectiveStart: day(2026, 10, 16) }),
          today,
        ),
      ).toBeCloseTo(41.25, 9);
    });
  });

  it("maps importance 1, 4 and 7 to 10, 50 and 90", () => {
    expect(score(input({ importance: 1 }), today)).toBeCloseTo(44.75, 9);
    expect(score(input({ importance: 4 }), today)).toBeCloseTo(neutral, 9);
    expect(score(input({ importance: 7 }), today)).toBeCloseTo(64.75, 9);
  });

  it("maps urgency 1, 4 and 7 to 10, 50 and 90", () => {
    expect(score(input({ urgency: 1 }), today)).toBeCloseTo(46.75, 9);
    expect(score(input({ urgency: 4 }), today)).toBeCloseTo(neutral, 9);
    expect(score(input({ urgency: 7 }), today)).toBeCloseTo(62.75, 9);
  });

  describe("inherited along the ancestor tasks", () => {
    it("leaves an ancestor task at 4 neutral", () => {
      expect(
        score(input({ ancestors: [{ importance: 4, urgency: 4 }] }), today),
      ).toBeCloseTo(neutral, 9);
    });

    it("scales importance by 1.15 for an ancestor task at 7 and 0.85 at 1", () => {
      // 50 × 1.15 = 57.5; 50 × 0.85 = 42.5.
      expect(
        score(input({ ancestors: [{ importance: 7 }] }), today),
      ).toBeCloseTo(56.625, 9);
      expect(
        score(input({ ancestors: [{ importance: 1 }] }), today),
      ).toBeCloseTo(52.875, 9);
    });

    it("scales urgency by 1.15 for an ancestor task at 7 and 0.85 at 1", () => {
      expect(score(input({ ancestors: [{ urgency: 7 }] }), today)).toBeCloseTo(
        56.25,
        9,
      );
      expect(score(input({ ancestors: [{ urgency: 1 }] }), today)).toBeCloseTo(
        53.25,
        9,
      );
    });

    it("multiplies the factors of every level", () => {
      // 50 × 1.15 × 1.15 = 66.125.
      expect(
        score(
          input({ ancestors: [{ importance: 7 }, { importance: 7 }] }),
          today,
        ),
      ).toBeCloseTo(58.78125, 9);
      // 50 × 1.15 × 0.85 = 48.875.
      expect(
        score(input({ ancestors: [{ urgency: 7 }, { urgency: 1 }] }), today),
      ).toBeCloseTo(54.525, 9);
    });

    it("keeps importance and urgency scores at 100 at most", () => {
      // 90 × 1.15 × 1.15 = 119.025, held at 100.
      const high = { importance: 7, urgency: 7 } as const;
      expect(
        score(
          input({ importance: 7, urgency: 7, ancestors: [high, high] }),
          today,
        ),
      ).toBeCloseTo(77.25, 9);
    });
  });

  it("leaves effort 4 neutral and scores more effort lower", () => {
    // 54.75 / 1.15 and 54.75 / 0.85.
    expect(score(input({ effort: 7 }), today)).toBeCloseTo(47.6087, 4);
    expect(score(input({ effort: 1 }), today)).toBeCloseTo(64.4118, 4);
  });

  it("counts whole logical days across month and year ends", () => {
    // From the logical day 2026-12-31, 2027-01-05 is 5 days ahead.
    expect(
      score(input({ due: day(2027, 1, 5) }), day(2026, 12, 31)),
    ).toBeCloseTo(63.1193, 4);
    // From 2027-01-01, 2026-12-25 is 7 days overdue.
    expect(
      score(input({ due: day(2026, 12, 25) }), day(2027, 1, 1)),
    ).toBeCloseTo(86.075, 9);
  });
});

describe("rank by score", () => {
  const ids = (ranked: readonly ScoreInput[]) =>
    ranked.map((item) => item.task.id);

  // Under two ancestor tasks at 7, own values 6 and 7 both reach the cap of
  // 100 (76.67 × 1.3225 and 90 × 1.3225): the scores tie exactly.
  const twoHigh = (dimension: "importance" | "urgency") => [
    { [dimension]: 7 as const },
    { [dimension]: 7 as const },
  ];

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

  it("puts a subtask of an important parent task above the same task elsewhere", () => {
    const ranked = rankByScore(
      [input({ id: 1 }), input({ id: 2, ancestors: [{ importance: 7 }] })],
      today,
    );

    expect(ids(ranked)).toEqual([2, 1]);
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

  it("then puts the higher own importance first", () => {
    const ranked = rankByScore(
      [
        input({ id: 1, importance: 6, ancestors: twoHigh("importance") }),
        input({ id: 2, importance: 7, ancestors: twoHigh("importance") }),
      ],
      today,
    );

    expect(ids(ranked)).toEqual([2, 1]);
  });

  it("then puts the higher own urgency first", () => {
    const ranked = rankByScore(
      [
        input({ id: 1, urgency: 6, ancestors: twoHigh("urgency") }),
        input({ id: 2, urgency: 7, ancestors: twoHigh("urgency") }),
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
