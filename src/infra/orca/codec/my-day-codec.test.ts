import { describe, expect, it } from "vitest";
import { planMyDayWrite, readMyDay } from "./my-day-codec";

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

const myDay = (data: Record<string, unknown>) =>
  taskBlockWith({ name: "nextaction.myday", value: { v: 1, ...data } });

describe("readMyDay", () => {
  it("reads a task without nextaction.myday as no entries", () => {
    expect(readMyDay(taskBlockWith())).toEqual({
      kind: "readable",
      entries: [],
    });
  });

  it("reads each entry's YYYY-MM-DD logical day and UTC ISO schedule, oldest first", () => {
    const block = myDay({
      entries: [
        { day: "2026-10-07" },
        {
          day: "2026-10-08",
          start: "2026-10-08T01:00:00.000Z",
          end: "2026-10-08T02:30:00.000Z",
        },
      ],
    });
    expect(readMyDay(block)).toEqual({
      kind: "readable",
      entries: [
        { day: { year: 2026, month: 10, day: 7 } },
        {
          day: { year: 2026, month: 10, day: 8 },
          schedule: {
            start: new Date("2026-10-08T09:00:00+08:00"),
            end: new Date("2026-10-08T10:30:00+08:00"),
          },
        },
      ],
    });
  });

  it("reads schedule times Orca hands back as Dates, as get-blocks does for ISO strings", () => {
    const block = myDay({
      entries: [
        {
          day: "2026-10-08",
          start: new Date("2026-10-08T01:00:00.000Z"),
          end: "2026-10-08T02:00:00.000Z",
        },
      ],
    });
    expect(readMyDay(block)).toEqual({
      kind: "readable",
      entries: [
        {
          day: { year: 2026, month: 10, day: 8 },
          schedule: {
            start: new Date("2026-10-08T01:00:00.000Z"),
            end: new Date("2026-10-08T02:00:00.000Z"),
          },
        },
      ],
    });
  });

  it.each([
    ["only a start", { start: "2026-10-08T01:00:00.000Z" }],
    ["only an end", { end: "2026-10-08T02:00:00.000Z" }],
    [
      "an end equal to the start",
      { start: "2026-10-08T01:00:00.000Z", end: "2026-10-08T01:00:00.000Z" },
    ],
    [
      "an end before the start",
      { start: "2026-10-08T02:00:00.000Z", end: "2026-10-08T01:00:00.000Z" },
    ],
    [
      "a start that is not a time",
      { start: "morning", end: "2026-10-08T02:00:00.000Z" },
    ],
  ])("reads an entry with %s as unscheduled", (_, schedule) => {
    expect(
      readMyDay(myDay({ entries: [{ day: "2026-10-08", ...schedule }] })),
    ).toEqual({
      kind: "readable",
      entries: [{ day: { year: 2026, month: 10, day: 8 } }],
    });
  });

  it("reads one entry for a logical day found twice: the last one", () => {
    const block = myDay({
      entries: [
        { day: "2026-10-07" },
        { day: "2026-10-08" },
        {
          day: "2026-10-08",
          start: "2026-10-08T01:00:00.000Z",
          end: "2026-10-08T02:00:00.000Z",
        },
      ],
    });
    expect(readMyDay(block)).toEqual({
      kind: "readable",
      entries: [
        { day: { year: 2026, month: 10, day: 7 } },
        {
          day: { year: 2026, month: 10, day: 8 },
          schedule: {
            start: new Date("2026-10-08T01:00:00.000Z"),
            end: new Date("2026-10-08T02:00:00.000Z"),
          },
        },
      ],
    });
  });

  it("keeps a value of an unknown version as found", () => {
    const block = taskBlockWith({
      name: "nextaction.myday",
      value: { v: 2, entries: [] },
    });
    expect(readMyDay(block)).toEqual({
      kind: "unreadable",
      raw: { v: 2, entries: [] },
      reason: "unknown version 2",
    });
  });

  it.each([
    ["not a versioned object", "2026-10-08"],
    ["no entries", { v: 1 }],
    ["entries not a list", { v: 1, entries: { day: "2026-10-08" } }],
    ["an entry not an object", { v: 1, entries: ["2026-10-08"] }],
    ["an entry without a logical day", { v: 1, entries: [{}] }],
    [
      "an entry with a logical day in another format",
      { v: 1, entries: [{ day: "2026/10/08" }] },
    ],
    [
      "an entry with a logical day that does not exist",
      { v: 1, entries: [{ day: "2026-02-30" }] },
    ],
  ])("keeps a value with %s as found, unreadable", (_, raw) => {
    const block = taskBlockWith({ name: "nextaction.myday", value: raw });
    expect(readMyDay(block)).toMatchObject({ kind: "unreadable", raw });
  });
});

describe("planMyDayWrite", () => {
  it("writes each entry's logical day as YYYY-MM-DD and its schedule as UTC ISO times, under version 1", () => {
    expect(
      planMyDayWrite(taskBlockWith(), [
        { day: { year: 2026, month: 10, day: 7 } },
        {
          day: { year: 2026, month: 10, day: 8 },
          schedule: {
            start: new Date("2026-10-08T09:00:00+08:00"),
            end: new Date("2026-10-08T10:30:00+08:00"),
          },
        },
      ]),
    ).toEqual({
      kind: "write",
      property: {
        name: "nextaction.myday",
        type: 0,
        value: {
          v: 1,
          entries: [
            { day: "2026-10-07" },
            {
              day: "2026-10-08",
              start: "2026-10-08T01:00:00.000Z",
              end: "2026-10-08T02:30:00.000Z",
            },
          ],
        },
      },
    });
  });

  it("writes an empty list when the last entry is gone, keeping the property", () => {
    const block = myDay({ entries: [{ day: "2026-10-08" }] });
    expect(planMyDayWrite(block, [])).toEqual({
      kind: "write",
      property: {
        name: "nextaction.myday",
        type: 0,
        value: { v: 1, entries: [] },
      },
    });
  });

  it("reads back what it writes", () => {
    const entries = [
      { day: { year: 2026, month: 10, day: 7 } },
      {
        day: { year: 2026, month: 10, day: 8 },
        schedule: {
          start: new Date("2026-10-08T09:00:00+08:00"),
          end: new Date("2026-10-08T10:30:00+08:00"),
        },
      },
    ];
    const plan = planMyDayWrite(taskBlockWith(), entries);
    if (plan.kind !== "write") throw new Error("expected a write");
    expect(readMyDay(taskBlockWith(plan.property))).toEqual({
      kind: "readable",
      entries,
    });
  });

  it.each([
    ["of an unknown version", { v: 2, entries: [] }],
    ["that is damaged", { v: 1, entries: [{ day: "yesterday" }] }],
  ])("refuses to overwrite a value %s", (_, raw) => {
    const block = taskBlockWith({ name: "nextaction.myday", value: raw });
    expect(planMyDayWrite(block, [])).toMatchObject({ kind: "refused", raw });
  });
});
