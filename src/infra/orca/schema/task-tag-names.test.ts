import { describe, expect, it } from "vitest";
import { taskTagNamesFor } from "./task-tag-names";

const ready = {
  kind: "ready",
  tagBlockId: 1,
  tagName: "Task",
  language: "en",
  invalidated: [],
} as const;

describe("taskTagNamesFor", () => {
  it("gives the tag name, status property and options in the tag's language", () => {
    expect(
      taskTagNamesFor({ ...ready, tagName: "任务", language: "zh" }),
    ).toEqual({
      tagName: "任务",
      status: {
        property: "状态",
        options: {
          inbox: "收集箱",
          todo: "待开始",
          doing: "进行中",
          waiting: "等待中",
          someday: "将来/也许",
          done: "已完成",
        },
      },
    });
    expect(taskTagNamesFor(ready)?.status?.property).toBe("Status");
  });

  it("leaves out the status names while the status property is invalidated", () => {
    expect(taskTagNamesFor({ ...ready, invalidated: ["status"] })).toEqual({
      tagName: "Task",
    });
  });

  it("keeps the status names when only other properties are invalidated", () => {
    expect(
      taskTagNamesFor({ ...ready, invalidated: ["due"] })?.status,
    ).toBeDefined();
  });

  it("gives nothing while task features are paused", () => {
    expect(
      taskTagNamesFor({ kind: "paused", reason: "starting" }),
    ).toBeUndefined();
    expect(
      taskTagNamesFor({
        kind: "paused",
        reason: "refused",
        tagName: "Task",
        language: "en",
        conflicts: ["status"],
      }),
    ).toBeUndefined();
  });
});
