import { describe, expect, it } from "vitest";
import { blocks, tagBlocks } from "../../../../tests/task-block-fixtures";
import type { CustomPropertyDefinition } from "../../../domain/task/custom-property";
import { CustomPropertyChangedError } from "../../../domain/task/custom-property";
import {
  blockCandidates,
  customPropertyDefinitions,
  decodeCustomPropertyValues,
  encodeBlockRefs,
  isProjectBuiltInProperty,
  isTaskBuiltInProperty,
  planBlockRefsWrite,
  planCustomChoiceAdditions,
  planCustomPropertyWrite,
  resolveBlockRefTargets,
} from "./custom-property-codec";

// Definitions as the custom-properties spike recorded them: added in Orca's
// interface, so `pos` is null and choices are plain strings.
const added = [
  { name: "自定义文本", type: 1, pos: null, typeArgs: null },
  {
    name: "自定义数字",
    type: 3,
    pos: null,
    typeArgs: { defaultEnabled: true, default: 1 },
  },
  {
    name: "自定义布尔",
    type: 4,
    pos: null,
    typeArgs: { defaultEnabled: true, default: true },
  },
  {
    name: "自定义日期",
    type: 5,
    pos: null,
    typeArgs: { subType: "date", defaultEnabled: true, default: "now" },
  },
  {
    name: "自定义日期时间",
    type: 5,
    pos: null,
    typeArgs: { subType: "datetime" },
  },
  { name: "时间", type: 5, pos: null, typeArgs: { subType: "time" } },
  {
    name: "自定义单选",
    type: 6,
    pos: null,
    typeArgs: {
      subType: "single",
      choices: ["aaa"],
      defaultEnabled: true,
      default: "aaa",
    },
  },
  {
    name: "自定义多选",
    type: 6,
    pos: null,
    typeArgs: { subType: "multi", choices: ["x", "y"] },
  },
  {
    name: "自定义块引用",
    type: 2,
    pos: null,
    typeArgs: { defaultEnabled: true, default: [26] },
  },
];

/**
 * The task tags as the plugin creates them since #224: the samples were
 * recorded before, when they still defined 标记 / Label.
 */
const ownTag = {
  zh: tagBlocks.zh.properties.filter((p) => p.name !== "标记"),
  en: tagBlocks.en.properties.filter((p) => p.name !== "Label"),
};

const onTag = (...extra: readonly unknown[]) =>
  [...ownTag.zh, ...extra] as Parameters<typeof customPropertyDefinitions>[0];

describe("customPropertyDefinitions", () => {
  it("reads the plugin's own task tag as having no custom properties", () => {
    expect(customPropertyDefinitions(ownTag.zh, isTaskBuiltInProperty)).toEqual(
      [],
    );
    expect(customPropertyDefinitions(ownTag.en, isTaskBuiltInProperty)).toEqual(
      [],
    );
  });

  it("reads the old 标记 / Label as a multiple choice custom property (#224)", () => {
    // No longer built in, so it is the user's property (ADR 0023, 0028).
    expect(
      customPropertyDefinitions(tagBlocks.zh.properties, isTaskBuiltInProperty),
    ).toEqual([{ name: "标记", kind: "multi", choices: [] }]);
    expect(
      customPropertyDefinitions(tagBlocks.en.properties, isTaskBuiltInProperty),
    ).toEqual([{ name: "Label", kind: "multi", choices: [] }]);
  });

  it("maps each of the nine kinds, nulls in pos ordered by name", () => {
    expect(
      customPropertyDefinitions(onTag(...added), isTaskBuiltInProperty),
    ).toEqual([
      { name: "时间", kind: "time" },
      { name: "自定义单选", kind: "single", choices: ["aaa"] },
      { name: "自定义块引用", kind: "blockRefs", scope: null },
      { name: "自定义多选", kind: "multi", choices: ["x", "y"] },
      { name: "自定义布尔", kind: "boolean" },
      { name: "自定义数字", kind: "number" },
      { name: "自定义文本", kind: "text" },
      { name: "自定义日期", kind: "date" },
      { name: "自定义日期时间", kind: "datetime" },
    ]);
  });

  it("leaves out system properties, JSON and computed properties", () => {
    expect(
      customPropertyDefinitions(
        onTag(
          { name: "_internal", type: 1, pos: null },
          { name: "结构", type: 0, pos: null },
          { name: "合计", type: 7, pos: null },
          { name: "来源", type: 1, pos: null },
        ),
        isTaskBuiltInProperty,
      ),
    ).toEqual([{ name: "来源", kind: "text" }]);
  });

  it("leaves out a property named as a built-in one in either language, whatever the tag's language", () => {
    // "Status" on a Chinese tag, "备注" on an English one.
    expect(
      customPropertyDefinitions(
        onTag({ name: "Status", type: 1, pos: null }),
        isTaskBuiltInProperty,
      ),
    ).toEqual([]);
    expect(
      customPropertyDefinitions(
        [...ownTag.en, { name: "备注", type: 3, pos: null }],
        isTaskBuiltInProperty,
      ),
    ).toEqual([]);
  });

  it("leaves out only what the built-in check passed in says is built in", () => {
    // Another tag's check: the task's 状态 is kept, 来源 is left out.
    const isBuiltIn = (name: string) => name === "来源";
    expect(
      customPropertyDefinitions(
        [
          { name: "状态", type: 1, pos: null },
          { name: "来源", type: 1, pos: null },
        ],
        isBuiltIn,
      ),
    ).toEqual([{ name: "状态", kind: "text" }]);
  });

  it("does not take an invalidated built-in property, its type changed, for a custom one", () => {
    // The note changed to a number in Orca (ADR 0008).
    const properties = ownTag.zh.map((p) =>
      p.name === "备注" ? { ...p, type: 3 } : p,
    );
    expect(
      customPropertyDefinitions(properties, isTaskBuiltInProperty),
    ).toEqual([]);
  });

  it("reads a date property without a subtype, or with an unknown one, as a date and time", () => {
    expect(
      customPropertyDefinitions(
        onTag(
          { name: "a", type: 5, pos: null },
          { name: "b", type: 5, pos: null, typeArgs: { subType: "week" } },
        ),
        isTaskBuiltInProperty,
      ),
    ).toEqual([
      { name: "a", kind: "datetime" },
      { name: "b", kind: "datetime" },
    ]);
  });

  it("reads a choice property without a subtype as a single choice, object options by name", () => {
    expect(
      customPropertyDefinitions(
        onTag({
          name: "来源",
          type: 6,
          pos: null,
          typeArgs: { choices: [{ n: "客户", c: "" }, "内部"] },
        }),
        isTaskBuiltInProperty,
      ),
    ).toEqual([{ name: "来源", kind: "single", choices: ["客户", "内部"] }]);
  });

  it("takes a block reference property's search scope", () => {
    expect(
      customPropertyDefinitions(
        onTag({
          name: "委托给",
          type: 2,
          pos: null,
          typeArgs: { scope: "人" },
        }),
        isTaskBuiltInProperty,
      ),
    ).toEqual([{ name: "委托给", kind: "blockRefs", scope: "人" }]);
  });

  it("orders by pos first, those without one after them by name", () => {
    expect(
      customPropertyDefinitions(
        onTag(
          { name: "b", type: 1, pos: null },
          { name: "z", type: 1, pos: 20 },
          { name: "a", type: 1, pos: null },
          { name: "y", type: 1, pos: 14 },
        ),
        isTaskBuiltInProperty,
      ).map((d) => d.name),
    ).toEqual(["y", "z", "a", "b"]);
  });
});

describe("customPropertyDefinitions of the project tag", () => {
  it("leaves out the project's built-in properties in either language, keeping the task's 工作量", () => {
    expect(
      customPropertyDefinitions(
        [
          { name: "项目状态", type: 6, pos: 0 },
          { name: "Goal", type: 1, pos: 1 },
          { name: "开始日期", type: 5, pos: 2 },
          { name: "Due", type: 5, pos: 3 },
          { name: "重要性", type: 3, pos: 4 },
          { name: "Urgency", type: 3, pos: 5 },
          { name: "工作量", type: 3, pos: 6 },
          { name: "Status", type: 1, pos: 7 },
        ],
        isProjectBuiltInProperty,
      ),
    ).toEqual([
      { name: "工作量", kind: "number" },
      { name: "Status", kind: "text" },
    ]);
  });

  it("leaves out system properties, JSON and computed properties", () => {
    expect(
      customPropertyDefinitions(
        [
          { name: "_repr", type: 1, pos: null },
          { name: "结构", type: 0, pos: null },
          { name: "合计", type: 7, pos: null },
          { name: "负责人", type: 2, pos: null, typeArgs: { scope: "人" } },
        ],
        isProjectBuiltInProperty,
      ),
    ).toEqual([{ name: "负责人", kind: "blockRefs", scope: "人" }]);
  });
});

const six: CustomPropertyDefinition[] = [
  { name: "合同号", kind: "text" },
  { name: "预算", kind: "number" },
  { name: "已报销", kind: "boolean" },
  { name: "签约日", kind: "date" },
  { name: "约见", kind: "datetime" },
  { name: "每天几点", kind: "time" },
];

describe("decodeCustomPropertyValues", () => {
  it("reads the six kinds as the custom-properties spike recorded them", () => {
    // Dates read back as Dates; Asia/Shanghai (vitest.config.ts).
    const data = [
      { name: "合同号", type: 1, value: "HT-7" },
      { name: "预算", type: 3, value: 1200.5 },
      { name: "已报销", type: 4, value: true },
      { name: "签约日", type: 5, value: new Date("2026-10-11T16:00:00.000Z") },
      { name: "约见", type: 5, value: new Date("2026-10-12T06:30:00.000Z") },
      {
        name: "每天几点",
        type: 5,
        value: new Date("2026-10-12T01:15:00.000Z"),
      },
    ];
    expect(decodeCustomPropertyValues(data, six)).toEqual({
      合同号: { kind: "text", value: "HT-7" },
      预算: { kind: "number", value: 1200.5 },
      已报销: { kind: "boolean", value: true },
      签约日: { kind: "date", value: { year: 2026, month: 10, day: 12 } },
      约见: { kind: "datetime", value: new Date("2026-10-12T06:30:00.000Z") },
      每天几点: { kind: "time", value: { hours: 9, minutes: 15 } },
    });
  });

  const empty = {
    合同号: { kind: "text", value: null },
    预算: { kind: "number", value: null },
    已报销: { kind: "boolean", value: false },
    签约日: { kind: "date", value: null },
    约见: { kind: "datetime", value: null },
    每天几点: { kind: "time", value: null },
  };

  it("reads a missing item and null as empty", () => {
    expect(decodeCustomPropertyValues([], six)).toEqual(empty);
    expect(decodeCustomPropertyValues(null, six)).toEqual(empty);
    expect(
      decodeCustomPropertyValues(
        six.map((d) => ({ name: d.name, value: null })),
        six,
      ),
    ).toEqual(empty);
  });

  it("reads a number in a text property as text (custom-properties: 222 stored as a number)", () => {
    expect(
      decodeCustomPropertyValues([{ name: "合同号", value: 222 }], six).合同号,
    ).toEqual({ kind: "text", value: "222" });
  });

  it("reads values of the wrong kind as empty, without failing", () => {
    expect(
      decodeCustomPropertyValues(
        [
          { name: "合同号", value: ["HT-7"] },
          { name: "预算", value: "1200" },
          { name: "已报销", value: "true" },
          { name: "签约日", value: 20261012 },
          { name: "约见", value: "not a date" },
          { name: "每天几点", value: { hours: 9 } },
        ],
        six,
      ),
    ).toEqual(empty);
  });
});

const choices: CustomPropertyDefinition[] = [
  { name: "来源", kind: "single", choices: ["客户", "内部"] },
  { name: "涉及", kind: "multi", choices: ["x", "y"] },
];

describe("decodeCustomPropertyValues of choice properties", () => {
  it("reads a single choice as its option name, a multiple choice as option names", () => {
    expect(
      decodeCustomPropertyValues(
        [
          { name: "来源", value: "客户" },
          { name: "涉及", value: ["x", "y"] },
        ],
        choices,
      ),
    ).toEqual({
      来源: { kind: "single", value: "客户" },
      涉及: { kind: "multi", value: ["x", "y"] },
    });
  });

  it("reads a missing item and null as empty", () => {
    const empty = {
      来源: { kind: "single", value: null },
      涉及: { kind: "multi", value: [] },
    };
    expect(decodeCustomPropertyValues([], choices)).toEqual(empty);
    expect(
      decodeCustomPropertyValues(
        [
          { name: "来源", value: null },
          { name: "涉及", value: null },
        ],
        choices,
      ),
    ).toEqual(empty);
  });

  it("reads values of the wrong kind as empty, and drops what is not a string from a multiple choice", () => {
    expect(
      decodeCustomPropertyValues(
        [
          { name: "来源", value: ["客户"] },
          { name: "涉及", value: ["x", 3, null, { n: "y" }, "z"] },
        ],
        choices,
      ),
    ).toEqual({
      来源: { kind: "single", value: null },
      涉及: { kind: "multi", value: ["x", "z"] },
    });
    expect(
      decodeCustomPropertyValues([{ name: "涉及", value: "x" }], choices).涉及,
    ).toEqual({ kind: "multi", value: [] });
  });
});

describe("planCustomChoiceAdditions", () => {
  // As Orca's interface adds it (custom-properties): pos null, string choices.
  const fromInterface = {
    name: "来源",
    type: 6,
    pos: null,
    typeArgs: {
      subType: "single",
      choices: ["客户", "内部"],
      defaultEnabled: true,
      default: "客户",
    },
  };

  it("changes nothing when every value is already an option, or for an empty value", () => {
    const tag = onTag(fromInterface);
    expect(
      planCustomChoiceAdditions(
        tag,
        "来源",
        { kind: "single", value: "内部" },
        isTaskBuiltInProperty,
      ),
    ).toBeUndefined();
    expect(
      planCustomChoiceAdditions(
        tag,
        "来源",
        { kind: "single", value: null },
        isTaskBuiltInProperty,
      ),
    ).toBeUndefined();
  });

  it("appends a new option as a string after string options, keeping the whole typeArgs and a null pos", () => {
    expect(
      planCustomChoiceAdditions(
        onTag(fromInterface),
        "来源",
        {
          kind: "single",
          value: "合作方",
        },
        isTaskBuiltInProperty,
      ),
    ).toEqual({
      name: "来源",
      type: 6,
      pos: null,
      typeArgs: {
        subType: "single",
        choices: ["客户", "内部", "合作方"],
        defaultEnabled: true,
        default: "客户",
      },
    });
  });

  it("appends new options as objects after object options, keeping a position", () => {
    const property = {
      name: "涉及",
      type: 6,
      pos: 15,
      typeArgs: { subType: "multi", choices: [{ n: "x", c: "#2196f3" }] },
    };
    expect(
      planCustomChoiceAdditions(
        onTag(property),
        "涉及",
        {
          kind: "multi",
          value: ["y", "x", "z", "y"],
        },
        isTaskBuiltInProperty,
      ),
    ).toEqual({
      name: "涉及",
      type: 6,
      pos: 15,
      typeArgs: {
        subType: "multi",
        choices: [
          { n: "x", c: "#2196f3" },
          { n: "y", c: "" },
          { n: "z", c: "" },
        ],
      },
    });
  });

  it("adds objects to a property without options", () => {
    const property = {
      name: "涉及",
      type: 6,
      pos: null,
      typeArgs: { subType: "multi" },
    };
    expect(
      planCustomChoiceAdditions(
        onTag(property),
        "涉及",
        {
          kind: "multi",
          value: ["x"],
        },
        isTaskBuiltInProperty,
      ),
    ).toEqual({
      name: "涉及",
      type: 6,
      pos: null,
      typeArgs: { subType: "multi", choices: [{ n: "x", c: "" }] },
    });
  });

  it("refuses a property that is no longer defined, or whose kind changed", () => {
    expect(() =>
      planCustomChoiceAdditions(
        onTag(),
        "来源",
        {
          kind: "single",
          value: "客户",
        },
        isTaskBuiltInProperty,
      ),
    ).toThrow(CustomPropertyChangedError);
    expect(() =>
      planCustomChoiceAdditions(
        onTag(fromInterface),
        "来源",
        {
          kind: "multi",
          value: ["客户"],
        },
        isTaskBuiltInProperty,
      ),
    ).toThrow(CustomPropertyChangedError);
  });
});

describe("planCustomPropertyWrite", () => {
  /** 2026-10-12 20:00 in Asia/Shanghai. */
  const now = new Date("2026-10-12T12:00:00.000Z");

  it("writes a boolean with type 4 (next-action-hierarchy-boolean-deps)", () => {
    expect(
      planCustomPropertyWrite(
        six,
        "已报销",
        { kind: "boolean", value: true },
        now,
      ),
    ).toEqual({ name: "已报销", type: 4, value: true });
  });

  it("writes a date as local midnight (ADR 0012)", () => {
    expect(
      planCustomPropertyWrite(
        six,
        "签约日",
        { kind: "date", value: { year: 2026, month: 10, day: 15 } },
        now,
      ),
    ).toEqual({
      name: "签约日",
      type: 5,
      // 2026-10-15 00:00 in Asia/Shanghai.
      value: new Date("2026-10-14T16:00:00.000Z"),
    });
  });

  it("refuses a property that is no longer defined, or whose kind changed", () => {
    expect(() =>
      planCustomPropertyWrite(
        six,
        "删掉的属性",
        { kind: "text", value: "x" },
        now,
      ),
    ).toThrow(CustomPropertyChangedError);
    expect(() =>
      planCustomPropertyWrite(
        six,
        "预算",
        { kind: "text", value: "1200" },
        now,
      ),
    ).toThrow(CustomPropertyChangedError);
  });

  it("writes a time on today's local date, as Orca's interface does (custom-properties)", () => {
    expect(
      planCustomPropertyWrite(
        six,
        "每天几点",
        { kind: "time", value: { hours: 7, minutes: 30 } },
        now,
      ),
    ).toEqual({
      name: "每天几点",
      type: 5,
      // 2026-10-12 07:30 in Asia/Shanghai.
      value: new Date("2026-10-11T23:30:00.000Z"),
    });
  });

  it("writes text, a number and a date and time as they are, without a boolean type", () => {
    const at = new Date("2026-10-20T06:30:00.000Z");
    expect([
      planCustomPropertyWrite(
        six,
        "合同号",
        { kind: "text", value: "HT-7" },
        now,
      ),
      planCustomPropertyWrite(six, "预算", { kind: "number", value: 0 }, now),
      planCustomPropertyWrite(
        six,
        "约见",
        { kind: "datetime", value: at },
        now,
      ),
    ]).toEqual([
      { name: "合同号", value: "HT-7" },
      { name: "预算", value: 0 },
      { name: "约见", type: 5, value: at },
    ]);
  });

  it("writes a single choice as its option name, a multiple choice as option names, empty as null", () => {
    expect([
      planCustomPropertyWrite(
        choices,
        "来源",
        { kind: "single", value: "客户" },
        now,
      ),
      planCustomPropertyWrite(
        choices,
        "涉及",
        { kind: "multi", value: ["x", "y"] },
        now,
      ),
      planCustomPropertyWrite(
        choices,
        "来源",
        { kind: "single", value: null },
        now,
      ),
      planCustomPropertyWrite(
        choices,
        "涉及",
        { kind: "multi", value: [] },
        now,
      ),
    ]).toEqual([
      { name: "来源", value: "客户" },
      { name: "涉及", value: ["x", "y"] },
      { name: "来源", value: null },
      { name: "涉及", value: null },
    ]);
  });

  it("clears with null", () => {
    expect(
      (["合同号", "预算", "签约日", "约见", "每天几点"] as const).map(
        (name, i) =>
          planCustomPropertyWrite(
            six,
            name,
            {
              kind: (["text", "number", "date", "datetime", "time"] as const)[
                i
              ] as "text",
              value: null,
            },
            now,
          ).value,
      ),
    ).toEqual([null, null, null, null, null]);
  });
});

describe("block reference custom properties", () => {
  const delegatedTo = [
    { name: "委托给", kind: "blockRefs", scope: "人" },
  ] as const satisfies readonly CustomPropertyDefinition[];
  // As the custom-properties spike recorded it: the value holds reference
  // IDs, each a `type: 3` reference of the task block to its target.
  const refs = [
    { id: 44, type: 3, to: 26 },
    { id: 45, type: 3, to: 27 },
    { id: 46, type: 1, to: 28 },
  ];

  it("reads reference IDs as the blocks their type 3 references point at", () => {
    expect(
      decodeCustomPropertyValues(
        [{ name: "委托给", value: [45, 44] }],
        delegatedTo,
        refs,
      ).委托给,
    ).toEqual({ kind: "blockRefs", value: [27, 26] });
  });

  it("ignores a reference ID with no type 3 reference of that ID", () => {
    expect(
      decodeCustomPropertyValues(
        [{ name: "委托给", value: [99, 46, 44] }],
        delegatedTo,
        refs,
      ).委托给,
    ).toEqual({ kind: "blockRefs", value: [26] });
  });

  describe("planning a write", () => {
    const tagBlockId = tagBlocks.zh.id;
    // A task delegated to block 26 through reference 44; reference 47 is
    // another `type: 3` reference (e.g. a date's to a journal), not in the
    // value.
    const task = {
      refs: [
        {
          id: 61,
          type: 2,
          to: tagBlockId,
          data: [{ name: "委托给", value: [44] }],
        },
        { id: 44, type: 3, to: 26 },
        { id: 47, type: 3, to: 27 },
      ],
    };

    it("keeps the reference of a target already held and creates one for a new target, as for dependencies", () => {
      expect(
        planBlockRefsWrite(delegatedTo, task, tagBlockId, "委托给", [27, 26]),
      ).toEqual([
        { kind: "new", target: 27 },
        { kind: "existing", refId: 44 },
      ]);
    });

    it("writes an empty list to remove every target", () => {
      expect(
        planBlockRefsWrite(delegatedTo, task, tagBlockId, "委托给", []),
      ).toEqual([]);
    });

    it("refuses a property that is no longer defined, or is no longer a block reference", () => {
      expect(() =>
        planBlockRefsWrite(delegatedTo, task, tagBlockId, "下发人", [26]),
      ).toThrow(CustomPropertyChangedError);
      expect(() =>
        planBlockRefsWrite(
          [{ name: "委托给", kind: "text" }],
          task,
          tagBlockId,
          "委托给",
          [26],
        ),
      ).toThrow(CustomPropertyChangedError);
    });

    it("writes the reference IDs under the property's name with the block reference type", () => {
      expect(encodeBlockRefs("委托给", [44, 70])).toEqual({
        name: "委托给",
        type: 2,
        value: [44, 70],
      });
    });
  });

  describe("candidates from the blocks found", () => {
    const journal = {
      ...blocks.plain,
      id: 213,
      parent: null,
      content: [],
      properties: [
        {
          name: "_repr",
          value: { type: "journal", date: "2026-10-20T00:00:00.000Z" },
        },
      ],
    };
    const page = {
      ...blocks.plain,
      id: 30,
      parent: null,
      content: [],
      aliases: ["张三"],
    };

    it("reads a mirror as its source block, each block once, journals and orphans left out", () => {
      // blocks.mirror (242) mirrors 201, also found itself.
      const source = {
        ...blocks.plain,
        id: 201,
        content: [{ t: "t", v: "A" }],
      };
      expect(
        blockCandidates(
          [blocks.mirror, source, journal, blocks.orphan, blocks.plain, page],
          new Map([[201, source]]),
        ),
      ).toEqual([
        { id: 201, text: "A" },
        { id: 250, text: "Just a note" },
        { id: 30, text: "张三" },
      ]);
    });

    it("leaves out a mirror whose source was not read", () => {
      expect(blockCandidates([blocks.mirror], new Map())).toEqual([]);
    });
  });

  it("reads a target that is a mirror as its source block", () => {
    // blocks.mirror (242) mirrors 201 (block-properties-json M1).
    const values = {
      委托给: { kind: "blockRefs", value: [242, 250] },
      下发人: { kind: "text", value: "张三" },
    } as const;
    expect(
      resolveBlockRefTargets(
        values,
        new Map<number, { properties: readonly { name: string }[] }>([
          [242, blocks.mirror],
          [250, blocks.plain],
        ]),
      ),
    ).toEqual({
      委托给: { kind: "blockRefs", value: [201, 250] },
      下发人: { kind: "text", value: "张三" },
    });
  });
});
