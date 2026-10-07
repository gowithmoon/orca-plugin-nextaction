import { describe, expect, it } from "vitest";
import { planRename } from "./rename-plan";

describe("rename plan", () => {
  // The task tag is block 211, currently called "任务".
  const current = { tagBlockId: 211, tagName: "任务" };

  it("renames the tag to a valid new name, without surrounding blanks", () => {
    expect(
      planRename({ current, requested: "  GTD ", newNameOwner: undefined }),
    ).toEqual({ kind: "rename", from: "任务", to: "GTD" });
  });

  it.each([
    ["the current name", "任务"],
    ["the current name with blanks around it", " 任务  "],
  ])("does nothing for %s", (_, requested) => {
    // The plugin's own writes to the settings come back here too (#17 spike).
    expect(planRename({ current, requested, newNameOwner: 211 })).toEqual({
      kind: "none",
    });
  });

  it.each([
    ["an empty name", ""],
    ["a name of only blanks", "   "],
    ["a missing value", undefined],
  ])("reverts the setting to the current name for %s", (_, requested) => {
    expect(planRename({ current, requested, newNameOwner: undefined })).toEqual(
      { kind: "revert", reason: "empty", tagName: "任务" },
    );
  });

  it("reverts the setting when another block already has the new name", () => {
    expect(
      planRename({ current, requested: " 读书", newNameOwner: 305 }),
    ).toEqual({
      kind: "revert",
      reason: "taken",
      tagName: "任务",
      requested: "读书",
    });
  });
});
