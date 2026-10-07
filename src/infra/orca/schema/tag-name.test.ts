import { describe, expect, it } from "vitest";
import { resolveTagName } from "./tag-name";

describe("task tag name", () => {
  it.each([
    [undefined, "zh", "任务"],
    [undefined, "en", "Task"],
    ["", "zh", "任务"],
    ["   ", "en", "Task"],
  ] as const)(
    "setting %j with a %s interface gives %s",
    (setting, language, expected) => {
      expect(resolveTagName(setting, language)).toBe(expected);
    },
  );

  it("uses the name from the settings, whatever the interface language", () => {
    expect(resolveTagName("GTD", "zh")).toBe("GTD");
    expect(resolveTagName("任务", "en")).toBe("任务");
  });
});
