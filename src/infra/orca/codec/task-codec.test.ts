import { describe, expect, it } from "vitest";
import fixtures from "../../../../tests/fixtures/task-blocks.json";
import { decodeTask, type TaskTagContext } from "./task-codec";

const { blocks, tagBlocks } = fixtures;
const zhTag: TaskTagContext = { tagBlockId: tagBlocks.zh.id, invalidated: [] };
const enTag: TaskTagContext = { tagBlockId: tagBlocks.en.id, invalidated: [] };

function decodedTask(block: Parameters<typeof decodeTask>[0], tag = zhTag) {
  const result = decodeTask(block, tag);
  if (result.kind !== "task") {
    throw new Error(`expected a task, got ${JSON.stringify(result)}`);
  }
  return result.task;
}

describe("decodeTask", () => {
  it("reads every value of a task on a Chinese task tag", () => {
    expect(decodedTask(blocks.zhFilled)).toEqual({
      id: 201,
      text: "NA验证任务A",
      status: "todo",
      importance: 6,
      effort: 4,
      start: null,
      due: { year: 2026, month: 10, day: 20 },
      contexts: ["@home"],
      labels: [],
      note: null,
      anomalies: [],
    });
  });

  it("reads every value of a task on an English task tag", () => {
    expect(decodedTask(blocks.enFilled, enTag)).toEqual({
      id: 301,
      text: "Call the plumber",
      status: "waiting",
      importance: 2,
      effort: 5,
      start: { year: 2026, month: 10, day: 7 },
      due: null,
      contexts: ["@phone", "@home"],
      labels: ["house"],
      note: "after 9am",
      anomalies: [],
    });
  });

  it("reads properties missing from the tag data as empty", () => {
    // Tagged without values: only the properties with defaults are present.
    expect(decodedTask(blocks.zhDefaultsOnly)).toEqual({
      id: 204,
      text: "NA验证任务B",
      status: "inbox",
      importance: 4,
      effort: 4,
      start: null,
      due: null,
      contexts: [],
      labels: [],
      note: null,
      anomalies: [],
    });
  });

  it("reads cleared (null) values as empty and falls back to defaults", () => {
    expect(decodedTask(blocks.zhCleared)).toEqual({
      id: 206,
      text: "NA清空测试",
      status: "inbox",
      importance: 4,
      effort: 4,
      start: null,
      due: null,
      contexts: [],
      labels: [],
      note: null,
      anomalies: [{ property: "status", value: null }],
    });
  });

  it("reads an unknown status as inbox and keeps the original value", () => {
    // "放弃" is an option the user added to the tag; it is no plugin status.
    const task = decodedTask(blocks.zhAbnormal);
    expect(task.status).toBe("inbox");
    expect(task.anomalies).toEqual([{ property: "status", value: "放弃" }]);
  });

  it("reads an importance above 7 and a non-integer effort as 4", () => {
    const task = decodedTask(blocks.zhAbnormal);
    expect(task.importance).toBe(4); // 99 in the notes
    expect(task.effort).toBe(4); // 3.5 in the notes
  });

  it("reads an importance or effort below 1 as 4", () => {
    const task = decodedTask(blocks.zhOutOfRangeLow);
    expect(task.importance).toBe(4); // 0 in the notes
    expect(task.effort).toBe(4); // -2 in the notes
  });

  it("reads dates as the local calendar day, dropping any time of day", () => {
    const task = decodedTask(blocks.zhAbnormal);
    // Written by code at local 15:30 (date-subtype spike, block D).
    expect(task.start).toEqual({ year: 2026, month: 10, day: 10 });
    // Local midnight, as Orca stores a date picked in its interface.
    expect(task.due).toEqual({ year: 2026, month: 10, day: 7 });
  });

  it("reads empty multi-select arrays as no contexts and no labels", () => {
    const task = decodedTask(blocks.zhAbnormal);
    expect(task.contexts).toEqual([]);
    expect(task.labels).toEqual([]);
  });

  it("reads invalidated properties as empty", () => {
    const task = decodedTask(blocks.zhWithOtherTag, {
      tagBlockId: tagBlocks.zh.id,
      invalidated: ["importance", "note"],
    });
    expect(task.importance).toBe(4); // 7 in the notes
    expect(task.note).toBeNull(); // "先问老王" in the notes
    expect(task.effort).toBe(1);
  });

  it("reads an invalidated status as inbox without recording an anomaly", () => {
    // The anomaly is about a value on a valid status property; once the
    // property itself is invalidated, every task would carry one.
    for (const block of [blocks.zhFilled, blocks.zhAbnormal, blocks.zhCleared]) {
      const task = decodedTask(block, {
        tagBlockId: tagBlocks.zh.id,
        invalidated: ["status"],
      });
      expect(task.status).toBe("inbox");
      expect(task.anomalies).toEqual([]);
    }
  });

  it("reads a block without the task tag as not a task", () => {
    expect(decodeTask(blocks.plain, zhTag)).toEqual({
      kind: "not-task",
      reason: "untagged",
    });
  });

  it("reads a block with only another tag as not a task", () => {
    // Tagged with "任务", but the English tag is the task tag here.
    expect(decodeTask(blocks.zhFilled, enTag)).toEqual({
      kind: "not-task",
      reason: "untagged",
    });
  });

  it("reads a mirror block as a pointer to its source block", () => {
    expect(decodeTask(blocks.mirror, zhTag)).toEqual({
      kind: "mirror",
      sourceId: 201,
    });
  });

  it("reads an orphan block (no parent) as not a task, though still tagged", () => {
    expect(decodeTask(blocks.orphan, zhTag)).toEqual({
      kind: "not-task",
      reason: "orphan",
    });
  });
});

describe("decodeTask with values of the wrong kind", () => {
  // Not observed in a spike: what a value looks like after the user changes a
  // property's type in Orca. Until #19 marks such a property invalidated, the
  // codec must not pass a value of the wrong kind on as if it were right.
  const withData = (
    data: { name: string; type: number; value: unknown }[],
  ) => ({
    ...blocks.zhDefaultsOnly,
    refs: [
      {
        ...blocks.zhDefaultsOnly.refs[0],
        id: 205,
        from: 204,
        to: 211,
        type: 2,
        data,
      },
    ],
  });

  it("reads each value of the wrong kind as empty", () => {
    const task = decodedTask(
      withData([
        { name: "状态", type: 6, value: ["待开始"] },
        { name: "重要性", type: 6, value: "5" },
        { name: "工作量", type: 1, value: "2" },
        { name: "开始时间", type: 1, value: "next week" },
        { name: "截止时间", type: 3, value: 20261020 },
        { name: "上下文", type: 1, value: "@home" },
        { name: "标记", type: 6, value: [3, "house"] },
        { name: "备注", type: 3, value: 42 },
      ]),
    );
    expect(task).toEqual({
      id: 204,
      text: "NA验证任务B",
      status: "inbox",
      importance: 4,
      effort: 4,
      start: null,
      due: null,
      contexts: [],
      labels: ["house"],
      note: null,
      anomalies: [{ property: "status", value: ["待开始"] }],
    });
  });
});
