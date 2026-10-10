import { describe, expect, it, vi } from "vitest";
import { blocks, tagBlocks } from "../../../../tests/task-block-fixtures";
import {
  decodeTask,
  resolveDependencyTargets,
  type TaskTagContext,
} from "./task-codec";

const zhTag: TaskTagContext = { tagBlockId: tagBlocks.zh.id, invalidated: [] };
const enTag: TaskTagContext = { tagBlockId: tagBlocks.en.id, invalidated: [] };

/** The one-dependency sample with its dependency value replaced. */
function withDependencyValue(value: unknown) {
  const block = blocks.zhOneDependency;
  return {
    ...block,
    refs: block.refs.map((ref) =>
      ref.type === 2
        ? {
            ...ref,
            data: (ref.data ?? []).map((item) =>
              item.name === "依赖" ? { ...item, value } : item,
            ),
          }
        : ref,
    ),
  };
}

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
      urgency: 5,
      effort: 4,
      start: null,
      due: { year: 2026, month: 10, day: 20 },
      contexts: ["@home"],
      labels: [],
      note: null,
      sequential: false,
      dependencies: [],
      dependencyMode: "all",
      created: new Date("2026-10-05T01:00:00.000Z"),
      anomalies: [],
    });
  });

  it("reads every value of a task on an English task tag", () => {
    expect(decodedTask(blocks.enFilled, enTag)).toEqual({
      id: 301,
      text: "Call the plumber",
      status: "waiting",
      importance: 2,
      urgency: 3,
      effort: 5,
      start: { year: 2026, month: 10, day: 7 },
      due: null,
      contexts: ["@phone", "@home"],
      labels: ["house"],
      note: "after 9am",
      sequential: true,
      dependencies: [],
      dependencyMode: "all",
      created: new Date("2026-10-06T08:00:00.000Z"),
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
      urgency: 4,
      effort: 4,
      start: null,
      due: null,
      contexts: [],
      labels: [],
      note: null,
      sequential: false,
      dependencies: [],
      dependencyMode: "all",
      created: new Date("2026-10-05T01:10:00.000Z"),
      anomalies: [],
    });
  });

  it("reads cleared (null) values as empty and falls back to defaults", () => {
    expect(decodedTask(blocks.zhCleared)).toEqual({
      id: 206,
      text: "NA清空测试",
      status: "inbox",
      importance: 4,
      urgency: 4,
      effort: 4,
      start: null,
      due: null,
      contexts: [],
      labels: [],
      note: null,
      sequential: false,
      dependencies: [],
      dependencyMode: "all",
      created: new Date("2026-10-05T01:20:00.000Z"),
      anomalies: [{ property: "status", value: null }],
    });
  });

  it("reads when the block was created", () => {
    // get-blocks returns `created` as a Date (multi-choices-created).
    expect(decodedTask(blocks.zhFilled).created).toEqual(
      new Date("2026-10-05T01:00:00.000Z"),
    );
  });

  it("reads a creation time given as an ISO string", () => {
    const block = { ...blocks.zhFilled, created: "2026-10-05T01:00:00.000Z" };
    expect(decodedTask(block).created).toEqual(
      new Date("2026-10-05T01:00:00.000Z"),
    );
  });

  it("reads a creation time given as milliseconds since the epoch", () => {
    // 2026-10-05T01:00:00.000Z
    const block = { ...blocks.zhFilled, created: 1_791_162_000_000 };
    expect(decodedTask(block).created).toEqual(
      new Date("2026-10-05T01:00:00.000Z"),
    );
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["an object", {}],
    ["an unparsable string", "yesterday-ish"],
    ["an invalid Date", new Date(Number.NaN)],
  ])(
    "reads a creation time that is %s as the epoch, with a warning",
    (_, created) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const task = decodedTask({ ...blocks.zhFilled, created });
        expect(task.created).toEqual(new Date(0));
        expect(warn).toHaveBeenCalledOnce();
      } finally {
        warn.mockRestore();
      }
    },
  );

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

  it("reads the urgency under its Chinese and its English name", () => {
    expect(decodedTask(blocks.zhFilled).urgency).toBe(5);
    expect(decodedTask(blocks.enFilled, enTag).urgency).toBe(3);
  });

  it.each([
    ["missing", blocks.zhDefaultsOnly],
    ["empty", blocks.zhCleared],
    ["not an integer (2.5)", blocks.zhAbnormal],
    ["above 7 (8)", blocks.zhOutOfRangeLow],
  ])("reads an urgency that is %s as 4", (_, block) => {
    expect(decodedTask(block).urgency).toBe(4);
  });

  it("reads dates as the local calendar day, dropping any time of day", () => {
    const task = decodedTask(blocks.zhAbnormal);
    // Written by code at local 15:30 (date-subtype spike, block D).
    expect(task.start).toEqual({ year: 2026, month: 10, day: 10 });
    // Local midnight, as Orca stores a date picked in its interface.
    expect(task.due).toEqual({ year: 2026, month: 10, day: 7 });
  });

  it("reads dates given as Date objects, as get-blocks returns them", () => {
    // plugin-panel-writes (2026-10-09): get-blocks returns date values as Date;
    // 2026-10-22T16:00Z is local midnight of 2026-10-23 (UTC+8).
    const block = {
      ...blocks.zhDefaultsOnly,
      refs: blocks.zhDefaultsOnly.refs.map((ref) => ({
        ...ref,
        data: [
          ...(ref.data ?? []),
          {
            name: "截止日期",
            type: 5,
            value: new Date("2026-10-22T16:00:00.000Z"),
          },
          { name: "开始日期", type: 5, value: new Date(Number.NaN) },
        ],
      })),
    };
    const task = decodedTask(block);
    expect(task.due).toEqual({ year: 2026, month: 10, day: 23 });
    expect(task.start).toBeNull();
  });

  it("reads empty multi-select arrays as no contexts and no labels", () => {
    const task = decodedTask(blocks.zhAbnormal);
    expect(task.contexts).toEqual([]);
    expect(task.labels).toEqual([]);
  });

  describe("sequential", () => {
    // next-action-hierarchy-boolean-deps: only `true` is on.
    it("reads true as on, on an English task tag", () => {
      expect(decodedTask(blocks.enFilled, enTag).sequential).toBe(true);
    });

    it("reads false as off", () => {
      expect(decodedTask(blocks.zhFilled).sequential).toBe(false);
    });

    it("reads a missing value as off", () => {
      // Tagged before the property had a default: no item at all.
      expect(decodedTask(blocks.zhDefaultsOnly).sequential).toBe(false);
    });

    it("reads a cleared (null) value as off", () => {
      expect(decodedTask(blocks.zhCleared).sequential).toBe(false);
    });

    it("reads any other value as off", () => {
      // "yes" is what Orca turns into true for insertTag without a type; as
      // stored, it is no Boolean, and the plugin does not rely on it.
      expect(decodedTask(blocks.zhAbnormal).sequential).toBe(false);
    });

    it("reads an invalidated sequential as off", () => {
      expect(
        decodedTask(blocks.enFilled, {
          tagBlockId: tagBlocks.en.id,
          invalidated: ["sequential"],
        }).sequential,
      ).toBe(false);
    });
  });

  describe("dependencies", () => {
    // tag-operations A2/A5: the value holds reference IDs; each is a
    // `type: 3` reference of the task block whose `to` is the target.
    it("reads one dependency as the target block's ID, on a Chinese task tag", () => {
      expect(decodedTask(blocks.zhOneDependency).dependencies).toEqual([201]);
    });

    it("reads no dependencies when the value is missing", () => {
      expect(decodedTask(blocks.zhDefaultsOnly).dependencies).toEqual([]);
    });

    it("reads several dependencies in the order of the value, on an English task tag", () => {
      expect(decodedTask(blocks.enTwoDependencies, enTag).dependencies).toEqual(
        [301, 364],
      );
    });

    it("reads a dependency on a mirror as the mirror's block ID, for the repository to resolve", () => {
      // The codec sees one block; resolving a mirror to its source needs the
      // target block, read by the repository (block-properties-json M1).
      expect(decodedTask(blocks.zhMirrorDependency).dependencies).toEqual([
        242,
      ]);
    });

    it.each([
      ["a single number", 262],
      ["a list of strings", ["262"]],
      ["null", null],
      ["an object", { 262: true }],
    ])(
      "reads a value that is %s as no dependencies, without failing",
      (_, value) => {
        expect(decodedTask(withDependencyValue(value)).dependencies).toEqual(
          [],
        );
      },
    );

    it("skips a reference ID the block has no block reference for", () => {
      // 999: no such reference; 202 is not on this block.
      expect(
        decodedTask(withDependencyValue([999, 262, 202])).dependencies,
      ).toEqual([201]);
    });

    it("does not take the tag reference for a dependency", () => {
      // 261 is the block's reference to the task tag (type 2), not type 3.
      expect(decodedTask(withDependencyValue([261])).dependencies).toEqual([]);
    });

    it("resolves a dependency on a mirror to the mirror's source block", () => {
      // block-properties-json M1: the mirror 242 shows block 201.
      const targets = new Map([[242, blocks.mirror]]);
      expect(resolveDependencyTargets([242], targets)).toEqual([201]);
    });

    it("keeps a target that is no mirror, or was not read, as it is", () => {
      const targets = new Map([[201, blocks.zhFilled]]);
      expect(resolveDependencyTargets([201, 7], targets)).toEqual([201, 7]);
    });

    it("lists a target once when a mirror and its source are both listed", () => {
      const targets = new Map([[242, blocks.mirror]]);
      expect(resolveDependencyTargets([201, 242], targets)).toEqual([201]);
    });

    it("reads an invalidated dependencies property as no dependencies", () => {
      expect(
        decodedTask(blocks.zhOneDependency, {
          tagBlockId: tagBlocks.zh.id,
          invalidated: ["dependencies"],
        }).dependencies,
      ).toEqual([]);
    });
  });

  describe("dependency mode", () => {
    /** The one-dependency sample with a dependency mode value added. */
    const withMode = (value: unknown) => {
      const block = blocks.zhOneDependency;
      return {
        ...block,
        refs: block.refs.map((ref) =>
          ref.type === 2
            ? {
                ...ref,
                data: [
                  ...(ref.data ?? []),
                  { name: "依赖模式", type: 6, value },
                ],
              }
            : ref,
        ),
      };
    };

    it("reads 任一 as any, on a Chinese task tag", () => {
      expect(decodedTask(withMode("任一")).dependencyMode).toBe("any");
    });

    it("reads 全部 as all", () => {
      expect(decodedTask(withMode("全部")).dependencyMode).toBe("all");
    });

    it("reads Any as any, on an English task tag", () => {
      expect(decodedTask(blocks.enTwoDependencies, enTag).dependencyMode).toBe(
        "any",
      );
    });

    it("reads a missing value as all", () => {
      expect(decodedTask(blocks.zhOneDependency).dependencyMode).toBe("all");
    });

    it.each([
      ["empty (null)", null],
      ["an unknown option", "两条"],
      ["a list", ["任一"]],
      ["a number", 1],
    ])("reads a value that is %s as all", (_, value) => {
      expect(decodedTask(withMode(value)).dependencyMode).toBe("all");
    });

    it("reads an invalidated dependency mode as all", () => {
      expect(
        decodedTask(blocks.enTwoDependencies, {
          tagBlockId: tagBlocks.en.id,
          invalidated: ["dependencyMode"],
        }).dependencyMode,
      ).toBe("all");
    });
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
    for (const block of [
      blocks.zhFilled,
      blocks.zhAbnormal,
      blocks.zhCleared,
    ]) {
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

  it("reads an orphan block (no parent, no alias) as not a task, though still tagged", () => {
    expect(decodeTask(blocks.orphan, zhTag)).toEqual({
      kind: "not-task",
      reason: "orphan",
    });
  });

  // ADR 0013: a page is a root-level block with an alias, and can be a task.
  // Reading by ID agrees with the task query's "has a parent or an alias".
  it("reads a tagged page (no parent, but an alias) as a task", () => {
    const page = { ...blocks.zhFilled, parent: null, aliases: ["NA页面"] };
    expect(decodedTask(page)).toMatchObject({ id: page.id, status: "todo" });
  });

  // plugin-panel-writes (2026-10-09): a page's title is its alias; its content is empty.
  it("reads a page's text from its alias", () => {
    const page = {
      ...blocks.zhFilled,
      parent: null,
      aliases: ["NA诊断页面"],
      content: null,
    };
    expect(decodedTask(page).text).toBe("NA诊断页面");
  });

  it("reads a page's own content as its text when it has some", () => {
    const page = { ...blocks.zhFilled, parent: null, aliases: ["NA页面"] };
    expect(decodedTask(page).text).toBe("NA验证任务A");
  });

  // A journal block is root-level without an alias (page-task P1), so it
  // reads like an orphan: not a task, though tagged.
  it("reads a tagged journal block (no parent, no alias) as not a task", () => {
    const journal = {
      ...blocks.zhFilled,
      parent: null,
      aliases: [],
      properties: blocks.zhFilled.properties.map((p) =>
        p.name === "_repr" ? { ...p, value: { type: "journal" } } : p,
      ),
    };
    expect(decodeTask(journal, zhTag)).toEqual({
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
        { name: "开始日期", type: 1, value: "next week" },
        { name: "截止日期", type: 3, value: 20261020 },
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
      urgency: 4,
      effort: 4,
      start: null,
      due: null,
      contexts: [],
      labels: ["house"],
      note: null,
      sequential: false,
      dependencies: [],
      dependencyMode: "all",
      created: new Date("2026-10-05T01:10:00.000Z"),
      anomalies: [{ property: "status", value: ["待开始"] }],
    });
  });
});
