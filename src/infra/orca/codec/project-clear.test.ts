import { describe, expect, it } from "vitest";
import { tagBlocks } from "../../../../tests/task-block-fixtures";
import { encodeProjectSetting, projectSettingWithout } from "./project-clear";

const zhTagId = tagBlocks.zh.id;

/**
 * A task on the Chinese task tag whose 所属项目 holds `value`, as T1 of the
 * project-tag spike: reference 55 points at the project block 89.
 */
const task = (value: unknown) => ({
  refs: [
    {
      id: 50,
      type: 2,
      to: zhTagId,
      data: [
        { name: "所属项目", value },
        { name: "状态", value: "收集箱" },
      ],
    },
    { id: 55, type: 3, to: 89 },
    { id: 56, type: 3, to: 120 },
  ],
});

describe("projectSettingWithout", () => {
  it("removes the whole value when it held only that reference", () => {
    // setRefData writing [] removes the value with its reference (project-tag
    // round 2, as tag-operations A4).
    expect(projectSettingWithout(task([55]), zhTagId, new Set([55]))).toEqual({
      kind: "write",
      refIds: [],
    });
  });

  it("removes it from any place of the value, keeping the rest in order", () => {
    expect(
      projectSettingWithout(task([56, 55]), zhTagId, new Set([55])),
    ).toEqual({ kind: "write", refIds: [56] });
  });

  it("leaves a value without the reference unchanged", () => {
    // A `type: 3` reference to the project that is not the setting (a block
    // reference custom property makes one too).
    expect(projectSettingWithout(task([56]), zhTagId, new Set([55]))).toEqual({
      kind: "unchanged",
    });
    expect(projectSettingWithout(task(null), zhTagId, new Set([55]))).toEqual({
      kind: "unchanged",
    });
    expect(projectSettingWithout(task([55]), 999, new Set([55]))).toEqual({
      kind: "unchanged",
    });
  });

  it("keeps a value holding something other than reference IDs", () => {
    expect(
      projectSettingWithout(task([55, "x"]), zhTagId, new Set([55])),
    ).toEqual({ kind: "unreadable", raw: [55, "x"] });
  });
});

describe("encodeProjectSetting", () => {
  it("writes the reference IDs under the property's name in the tag's language", () => {
    expect(encodeProjectSetting([], { language: "zh" })).toEqual({
      name: "所属项目",
      type: 2,
      value: [],
    });
    expect(encodeProjectSetting([56], { language: "en" })).toEqual({
      name: "Project",
      type: 2,
      value: [56],
    });
  });
});
