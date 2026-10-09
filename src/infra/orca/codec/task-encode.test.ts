import { describe, expect, it } from "vitest";
import {
  encodeTaskChanges,
  InvalidatedPropertyError,
  type TaskWriteContext,
} from "./task-encode";

const zh: TaskWriteContext = { language: "zh", invalidated: [] };

/** The instant a written date value stands for. */
function instantOf(value: unknown): string {
  if (!(value instanceof Date)) {
    throw new Error(`expected a Date, got ${JSON.stringify(value)}`);
  }
  return value.toISOString();
}

describe("encodeTaskChanges", () => {
  it("writes an importance as a number under the Chinese property name", () => {
    expect(encodeTaskChanges({ importance: 6 }, zh)).toEqual([
      { name: "重要性", value: 6 },
    ]);
  });

  it("writes a due date as local midnight of that day", () => {
    // UTC+8 (pinned in vitest.config.ts): local midnight of 2026-10-20 is
    // 16:00 UTC the day before, as Orca stores a date picked in its own UI
    // (date-subtype, block A).
    const [item] = encodeTaskChanges(
      { due: { year: 2026, month: 10, day: 20 } },
      zh,
    );
    expect(item?.name).toBe("截止日期");
    expect(item?.type).toBe(5);
    expect(instantOf(item?.value)).toBe("2026-10-19T16:00:00.000Z");
  });

  it("refuses the whole write when it touches an invalidated property", () => {
    // Importance was changed to another type by the user (#19). Status is
    // fine, but nothing at all may be written.
    const tag: TaskWriteContext = {
      language: "zh",
      invalidated: ["importance"],
    };
    expect(() =>
      encodeTaskChanges({ status: "done", importance: 6 }, tag),
    ).toThrow(InvalidatedPropertyError);
  });

  it("writes contexts as a list of option names", () => {
    expect(encodeTaskChanges({ contexts: ["@home", "@phone"] }, zh)).toEqual([
      { name: "上下文", value: ["@home", "@phone"] },
    ]);
  });

  it("clears contexts given as an empty list by writing null", () => {
    // Only null is measured as clearing a choice (tag-operations step 06);
    // what an empty array does to a multiple choice value is not.
    expect(encodeTaskChanges({ contexts: [] }, zh)).toEqual([
      { name: "上下文", value: null },
    ]);
  });

  it("writes effort, start and labels, one item per property", () => {
    const en: TaskWriteContext = { language: "en", invalidated: [] };
    const items = encodeTaskChanges(
      {
        effort: 2,
        start: { year: 2026, month: 10, day: 7 },
        labels: ["house"],
      },
      en,
    );
    expect(items.map((item) => item.name).sort()).toEqual([
      "Effort",
      "Label",
      "Start",
    ]);
    expect(items.find((item) => item.name === "Effort")?.value).toBe(2);
    expect(items.find((item) => item.name === "Label")?.value).toEqual([
      "house",
    ]);
    const start = items.find((item) => item.name === "Start");
    expect(start?.type).toBe(5);
    expect(instantOf(start?.value)).toBe("2026-10-06T16:00:00.000Z");
  });

  it("writes nothing when no property is given", () => {
    expect(encodeTaskChanges({}, zh)).toEqual([]);
  });

  it("writes a note as text, under the English name Notes", () => {
    const en: TaskWriteContext = { language: "en", invalidated: [] };
    expect(encodeTaskChanges({ note: "after 9am" }, en)).toEqual([
      { name: "Notes", value: "after 9am" },
    ]);
  });

  it("clears a date by writing null", () => {
    // As tag-operations step 06 cleared a due date.
    expect(encodeTaskChanges({ due: null }, zh)).toEqual([
      { name: "截止日期", value: null },
    ]);
  });
});

describe("encodeTaskChanges: sequential", () => {
  // next-action-hierarchy-boolean-deps: a Boolean value without `type: 4`
  // makes insertTag silently tag nothing, so the type always goes with it.
  it("writes sequential on and off as Booleans carrying type 4", () => {
    expect(encodeTaskChanges({ sequential: true }, zh)).toEqual([
      { name: "顺序执行", type: 4, value: true },
    ]);
    expect(encodeTaskChanges({ sequential: false }, zh)).toEqual([
      { name: "顺序执行", type: 4, value: false },
    ]);
  });

  it("writes sequential under the English name Sequential", () => {
    const en: TaskWriteContext = { language: "en", invalidated: [] };
    expect(encodeTaskChanges({ sequential: true }, en)).toEqual([
      { name: "Sequential", type: 4, value: true },
    ]);
  });

  it("refuses to write an invalidated sequential", () => {
    const tag: TaskWriteContext = {
      language: "zh",
      invalidated: ["sequential"],
    };
    expect(() => encodeTaskChanges({ sequential: false }, tag)).toThrow(
      InvalidatedPropertyError,
    );
  });
});

describe("encodeTaskChanges on an English task tag", () => {
  const en: TaskWriteContext = { language: "en", invalidated: [] };

  it("writes a status as the English option name", () => {
    expect(encodeTaskChanges({ status: "waiting" }, en)).toEqual([
      { name: "Status", value: "Waiting" },
    ]);
  });
});
