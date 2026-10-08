import { describe, expect, it } from "vitest";
import {
  decodeCompletionHistory,
  encodeCompletionHistory,
} from "./completion-history-codec";

describe("completion history codec", () => {
  it("encodes each completion as a UTC ISO time and a YYYY-MM-DD logical day", () => {
    expect(
      encodeCompletionHistory([
        {
          // 02:30 in UTC+8, before a 05:00 boundary: still October 7.
          at: new Date("2026-10-08T02:30:00+08:00"),
          day: { year: 2026, month: 10, day: 7 },
        },
      ]),
    ).toEqual({
      entries: [{ at: "2026-10-07T18:30:00.000Z", day: "2026-10-07" }],
    });
  });

  it("decodes what it encodes, in order", () => {
    const history = [
      {
        at: new Date("2026-01-02T03:04:05.006Z"),
        day: { year: 2026, month: 1, day: 2 },
      },
      {
        at: new Date("2026-12-31T23:59:59.000Z"),
        day: { year: 2027, month: 1, day: 1 },
      },
    ];
    expect(
      decodeCompletionHistory({
        kind: "present",
        data: encodeCompletionHistory(history),
      }),
    ).toEqual({ kind: "readable", history });
  });

  it("reads an absent property as an empty history", () => {
    expect(decodeCompletionHistory({ kind: "absent" })).toEqual({
      kind: "readable",
      history: [],
    });
  });

  it("reads a value of an unknown version as unreadable", () => {
    expect(
      decodeCompletionHistory({
        kind: "unreadable",
        reason: "unknown version 2",
      }),
    ).toEqual({ kind: "unreadable", reason: "unknown version 2" });
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
  ])("reads a value with %s as unreadable", (_, data) => {
    expect(decodeCompletionHistory({ kind: "present", data })).toMatchObject({
      kind: "unreadable",
    });
  });
});
