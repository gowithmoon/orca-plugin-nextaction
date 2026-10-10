import { describe, expect, it } from "vitest";
import {
  planCompletionHistoryWrite,
  readCompletionHistory,
} from "./completion-history-codec";

// A task block's `properties` as get-blocks returns them: plugin block
// properties are JSON (type 0) next to `_tags` and `_repr`
// (block-properties-json J1, J4).
const taskBlockWith = (...plugin: { name: string; value: unknown }[]) => ({
  properties: [
    { name: "_repr", type: 0, value: { type: "text" } },
    { name: "_tags", type: 0, value: [203] },
    ...plugin.map((p) => ({ ...p, type: 0, pos: null, typeArgs: null })),
  ],
});

describe("readCompletionHistory", () => {
  it("reads a task without nextaction.completions as no completions", () => {
    expect(readCompletionHistory(taskBlockWith())).toEqual({
      kind: "readable",
      history: [],
    });
  });

  it("reads each entry's UTC ISO time and YYYY-MM-DD logical day, in order", () => {
    const block = taskBlockWith({
      name: "nextaction.completions",
      value: {
        v: 1,
        entries: [
          { at: "2026-01-02T03:04:05.006Z", day: "2026-01-02" },
          // 02:30 in UTC+8, before a 05:00 boundary: still October 7.
          { at: "2026-10-07T18:30:00.000Z", day: "2026-10-07" },
        ],
      },
    });
    expect(readCompletionHistory(block)).toEqual({
      kind: "readable",
      history: [
        {
          at: new Date("2026-01-02T03:04:05.006Z"),
          day: { year: 2026, month: 1, day: 2 },
        },
        {
          at: new Date("2026-10-08T02:30:00+08:00"),
          day: { year: 2026, month: 10, day: 7 },
        },
      ],
    });
  });

  it("reads a time Orca hands back as a Date, as get-blocks does for what was written as an ISO string", () => {
    // The shape read back in Orca (#72 acceptance, 72a-completions):
    // `at` written as an ISO string comes back a Date; `day` stays a string.
    const block = taskBlockWith({
      name: "nextaction.completions",
      value: {
        v: 1,
        entries: [
          { at: new Date("2026-10-10T12:06:52.953Z"), day: "2026-10-10" },
        ],
      },
    });
    expect(readCompletionHistory(block)).toEqual({
      kind: "readable",
      history: [
        {
          at: new Date("2026-10-10T12:06:52.953Z"),
          day: { year: 2026, month: 10, day: 10 },
        },
      ],
    });
  });

  it("does not read an invalid Date as a time", () => {
    const block = taskBlockWith({
      name: "nextaction.completions",
      value: { v: 1, entries: [{ at: new Date("x"), day: "2026-10-10" }] },
    });
    expect(readCompletionHistory(block).kind).toBe("unreadable");
  });

  it("keeps a value of an unknown version as found", () => {
    const raw = { v: 2, entries: [] };
    const block = taskBlockWith({ name: "nextaction.completions", value: raw });
    expect(readCompletionHistory(block)).toEqual({
      kind: "unreadable",
      raw: { v: 2, entries: [] },
      reason: "unknown version 2",
    });
  });

  it.each([
    ["no entries", {}],
    ["entries not a list", { entries: { at: "2026-10-07T18:30:00.000Z" } }],
    ["an entry not an object", { entries: ["2026-10-07"] }],
    ["an entry without a time", { entries: [{ day: "2026-10-07" }] }],
    [
      "an entry with a time that is not a date",
      { entries: [{ at: "yesterday", day: "2026-10-07" }] },
    ],
    [
      "an entry without a logical day",
      { entries: [{ at: "2026-10-07T18:30:00.000Z" }] },
    ],
    [
      "an entry with a logical day in another format",
      { entries: [{ at: "2026-10-07T18:30:00.000Z", day: "2026/10/07" }] },
    ],
    [
      "an entry with a logical day that does not exist",
      { entries: [{ at: "2026-10-07T18:30:00.000Z", day: "2026-02-30" }] },
    ],
  ])("keeps a value with %s as found, unreadable", (_, data) => {
    const raw = { v: 1, ...data };
    const block = taskBlockWith({ name: "nextaction.completions", value: raw });
    expect(readCompletionHistory(block)).toMatchObject({
      kind: "unreadable",
      raw: { v: 1, ...data },
    });
  });
});

describe("planCompletionHistoryWrite", () => {
  it("writes each completion as a UTC ISO time and a YYYY-MM-DD logical day, under version 1", () => {
    expect(
      planCompletionHistoryWrite(taskBlockWith(), [
        {
          // 02:30 in UTC+8, before a 05:00 boundary: still October 7.
          at: new Date("2026-10-08T02:30:00+08:00"),
          day: { year: 2026, month: 10, day: 7 },
        },
      ]),
    ).toEqual({
      kind: "write",
      property: {
        name: "nextaction.completions",
        type: 0,
        value: {
          v: 1,
          entries: [{ at: "2026-10-07T18:30:00.000Z", day: "2026-10-07" }],
        },
      },
    });
  });

  it("refuses to overwrite a value it cannot read", () => {
    const block = taskBlockWith({
      name: "nextaction.completions",
      value: { v: 2, entries: [] },
    });
    expect(planCompletionHistoryWrite(block, [])).toMatchObject({
      kind: "refused",
      reason: "unknown version 2",
    });
  });
});
