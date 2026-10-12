import { describe, expect, it } from "vitest";
import { createSettingsReminderDefaultTime } from "./settings-reminder-default-time";

const readAs = (value: unknown) =>
  createSettingsReminderDefaultTime(() => value).current();

describe("the reminder default time setting", () => {
  it("takes only the local hours and minutes of the time Orca holds", () => {
    expect(readAs(new Date("2026-03-01T14:30:45+08:00"))).toEqual({
      hours: 14,
      minutes: 30,
    });
  });

  it.each([
    ["no value", undefined],
    ["null", null],
    ["a string", "09:30"],
    ["a number", 930],
    ["an invalid Date", new Date("not a time")],
  ])("reads %s as 9:00", (_, value) => {
    expect(readAs(value)).toEqual({ hours: 9, minutes: 0 });
  });
});
