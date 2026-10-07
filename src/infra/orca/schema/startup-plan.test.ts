import { describe, expect, it } from "vitest";
import { planStartup } from "./startup-plan";

// Expected definitions written out by hand from spec #16 ("写进笔记的名称").
const zhDefinitions = [
  {
    name: "状态",
    type: 6,
    pos: 0,
    typeArgs: {
      subType: "single",
      defaultEnabled: true,
      default: "收集箱",
      choices: [
        { n: "收集箱", c: "#9e9e9e" },
        { n: "待开始", c: "#2196f3" },
        { n: "进行中", c: "#ff9800" },
        { n: "等待中", c: "#9c27b0" },
        { n: "将来/也许", c: "#795548" },
        { n: "已完成", c: "#4caf50" },
      ],
    },
  },
  {
    name: "重要性",
    type: 3,
    pos: 1,
    typeArgs: { defaultEnabled: true, default: 4 },
  },
  {
    name: "工作量",
    type: 3,
    pos: 2,
    typeArgs: { defaultEnabled: true, default: 4 },
  },
  { name: "开始时间", type: 5, pos: 3, typeArgs: { subType: "date" } },
  { name: "截止时间", type: 5, pos: 4, typeArgs: { subType: "date" } },
  {
    name: "上下文",
    type: 6,
    pos: 5,
    typeArgs: { subType: "multi", choices: [] },
  },
  {
    name: "标记",
    type: 6,
    pos: 6,
    typeArgs: { subType: "multi", choices: [] },
  },
  // Text has no type arguments; written without typeArgs as in the
  // tag-operations spike.
  { name: "备注", type: 1, pos: 7 },
];

const enDefinitions = [
  {
    name: "Status",
    type: 6,
    pos: 0,
    typeArgs: {
      subType: "single",
      defaultEnabled: true,
      default: "Inbox",
      choices: [
        { n: "Inbox", c: "#9e9e9e" },
        { n: "Todo", c: "#2196f3" },
        { n: "Doing", c: "#ff9800" },
        { n: "Waiting", c: "#9c27b0" },
        { n: "Someday", c: "#795548" },
        { n: "Done", c: "#4caf50" },
      ],
    },
  },
  {
    name: "Importance",
    type: 3,
    pos: 1,
    typeArgs: { defaultEnabled: true, default: 4 },
  },
  {
    name: "Effort",
    type: 3,
    pos: 2,
    typeArgs: { defaultEnabled: true, default: 4 },
  },
  { name: "Start", type: 5, pos: 3, typeArgs: { subType: "date" } },
  { name: "Due", type: 5, pos: 4, typeArgs: { subType: "date" } },
  {
    name: "Context",
    type: 6,
    pos: 5,
    typeArgs: { subType: "multi", choices: [] },
  },
  {
    name: "Label",
    type: 6,
    pos: 6,
    typeArgs: { subType: "multi", choices: [] },
  },
  { name: "Notes", type: 1, pos: 7 },
];

describe("startup plan", () => {
  it("creates a Chinese task tag in an empty repo with a Chinese interface", () => {
    expect(
      planStartup({ tagName: "任务", tagBlock: undefined, uiLanguage: "zh" }),
    ).toEqual({
      action: { kind: "create", tagName: "任务" },
      writes: zhDefinitions,
    });
  });

  it("creates an English task tag in an empty repo with an English interface", () => {
    expect(
      planStartup({ tagName: "Task", tagBlock: undefined, uiLanguage: "en" }),
    ).toEqual({
      action: { kind: "create", tagName: "Task" },
      writes: enDefinitions,
    });
  });

  it("writes nothing when the task tag already has the complete structure", () => {
    // Shaped like a tag block read back from Orca (tag-operations spike):
    // definitions carry `value`, system properties have `pos: null`.
    const tagBlock = {
      id: 211,
      properties: [
        ...zhDefinitions.map((definition) => ({ ...definition, value: null })),
        { name: "_repr", type: 0, pos: null, value: { type: "text" } },
        { name: "_show", type: 0, pos: null },
      ],
    };

    // Interface language differs from the tag's: it must not matter.
    expect(
      planStartup({
        tagName: "任务",
        tagBlock: tagBlock as never,
        uiLanguage: "en",
      }),
    ).toEqual({ action: { kind: "use", tagBlockId: 211 }, writes: [] });
  });
});
