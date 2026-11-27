import { describe, expect, it } from "vitest";
import {
  planStandingScheduleDiscard,
  planStandingScheduleWrite,
  readStandingSchedule,
} from "./standing-schedule-codec";

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

const stored = (value: unknown) =>
  taskBlockWith({ name: "nextaction.standingschedule", value });

const morning = {
  start: { hours: 8, minutes: 45 },
  end: { hours: 9, minutes: 15 },
};

describe("readStandingSchedule and planStandingScheduleWrite", () => {
  it("reads back the schedule it writes, as local times of day", () => {
    const write = planStandingScheduleWrite(taskBlockWith(), morning);
    if (write.kind !== "write") throw new Error("refused");
    expect(write.property).toEqual({
      name: "nextaction.standingschedule",
      type: 0,
      value: { v: 1, schedule: { start: "08:45", end: "09:15" } },
    });
    expect(readStandingSchedule(taskBlockWith(write.property))).toEqual({
      kind: "schedule",
      schedule: morning,
    });
  });

  it("clearing writes no schedule, the property kept, and reads back as none", () => {
    const write = planStandingScheduleWrite(
      stored({ v: 1, schedule: null }),
      null,
    );
    if (write.kind !== "write") throw new Error("refused");
    expect(write.property.value).toEqual({ v: 1, schedule: null });
    expect(readStandingSchedule(taskBlockWith(write.property))).toEqual({
      kind: "none",
    });
  });

  it("reads none when the block holds none", () => {
    expect(readStandingSchedule(taskBlockWith())).toEqual({ kind: "none" });
  });

  it("leaves fields it does not know unread", () => {
    expect(
      readStandingSchedule(
        stored({
          v: 1,
          schedule: { start: "01:00", end: "02:00", removedOn: "2026-10-09" },
        }),
      ),
    ).toEqual({
      kind: "schedule",
      schedule: {
        start: { hours: 1, minutes: 0 },
        end: { hours: 2, minutes: 0 },
      },
    });
  });

  it.each([
    ["an unknown version", { v: 2, schedule: null }],
    ["no schedule field", { v: 1 }],
    [
      "a time that is not one",
      { v: 1, schedule: { start: "8:45", end: "09:15" } },
    ],
    [
      "an hour out of range",
      { v: 1, schedule: { start: "24:00", end: "09:15" } },
    ],
    ["a missing end", { v: 1, schedule: { start: "08:45" } }],
    ["not a versioned object", "08:45-09:15"],
  ])("reads %s as unreadable, and never overwrites it", (_, value) => {
    const block = stored(value);
    expect(readStandingSchedule(block).kind).toBe("unreadable");
    expect(planStandingScheduleWrite(block, morning)).toMatchObject({
      kind: "refused",
      raw: value,
    });
  });
});

describe("planStandingScheduleDiscard", () => {
  it("writes no schedule over one this plugin cannot read", () => {
    const discard = planStandingScheduleDiscard(stored({ v: 2 }));
    expect(discard).toEqual({
      kind: "write",
      property: {
        name: "nextaction.standingschedule",
        type: 0,
        value: { v: 1, schedule: null },
      },
    });
  });

  it("leaves a readable schedule, or none, as it is", () => {
    expect(planStandingScheduleDiscard(taskBlockWith())).toEqual({
      kind: "nothing",
    });
    expect(
      planStandingScheduleDiscard(
        stored({ v: 1, schedule: { start: "08:45", end: "09:15" } }),
      ),
    ).toEqual({ kind: "nothing" });
  });
});
