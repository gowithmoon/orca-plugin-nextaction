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

  it("keeps the cached name when the setting was emptied while the plugin was off", () => {
    // An empty name is not a valid new name (ADR 0002): the tag keeps its own
    // instead of being renamed to the default.
    expect(
      resolveTagName("  ", "en", { tagBlockId: 211, tagName: "GTD" }),
    ).toBe("GTD");
  });

  it("uses the name from the settings, whatever the interface language", () => {
    expect(resolveTagName("GTD", "zh")).toBe("GTD");
    expect(resolveTagName("任务", "en")).toBe("任务");
  });
});
