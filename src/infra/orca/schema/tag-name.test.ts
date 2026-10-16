import { describe, expect, it } from "vitest";
import { resolveTagName } from "./tag-name";
import { taskTagSchema } from "./task-tag-structure";

describe("task tag name", () => {
  it.each([
    [undefined, "zh", "任务"],
    [undefined, "en", "Task"],
    ["", "zh", "任务"],
    ["   ", "en", "Task"],
  ] as const)(
    "setting %j with a %s interface gives %s",
    (setting, language, expected) => {
      expect(resolveTagName(taskTagSchema, setting, language)).toBe(expected);
    },
  );

  it("keeps the cached name when the setting was emptied while the plugin was off", () => {
    // An empty name is not a valid new name (ADR 0002): the tag keeps its own
    // instead of being renamed to the default.
    expect(
      resolveTagName(taskTagSchema, "  ", "en", {
        tagBlockId: 211,
        tagName: "GTD",
      }),
    ).toBe("GTD");
  });

  it("uses the name from the settings, whatever the interface language", () => {
    expect(resolveTagName(taskTagSchema, "GTD", "zh")).toBe("GTD");
    expect(resolveTagName(taskTagSchema, "任务", "en")).toBe("任务");
  });
});

describe("name of a tag other than the task tag", () => {
  const otherTag = { defaultNames: { zh: "书", en: "Book" } };

  it("falls back to that tag's own default name", () => {
    expect(resolveTagName(otherTag, undefined, "zh")).toBe("书");
    expect(resolveTagName(otherTag, " ", "en")).toBe("Book");
  });
});
