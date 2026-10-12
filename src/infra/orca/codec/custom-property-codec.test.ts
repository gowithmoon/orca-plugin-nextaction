import { describe, expect, it } from "vitest";
import { tagBlocks } from "../../../../tests/task-block-fixtures";
import type { CustomPropertyDefinition } from "../../../domain/task/custom-property";
import { CustomPropertyChangedError } from "../../../domain/task/custom-property";
import {
  customPropertyDefinitions,
  decodeCustomPropertyValues,
  planCustomChoiceAdditions,
  planCustomPropertyWrite,
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

const onTag = (...extra: readonly unknown[]) =>
  [...tagBlocks.zh.properties, ...extra] as Parameters<
    typeof customPropertyDefinitions
  >[0];

describe("customPropertyDefinitions", () => {
  it("reads the plugin's own task tag as having no custom properties", () => {
    expect(customPropertyDefinitions(tagBlocks.zh.properties)).toEqual([]);
    expect(customPropertyDefinitions(tagBlocks.en.properties)).toEqual([]);
  });

  it("maps each of the nine kinds, nulls in pos ordered by name", () => {
    expect(customPropertyDefinitions(onTag(...added))).toEqual([
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
      ),
    ).toEqual([{ name: "来源", kind: "text" }]);
  });

  it("leaves out a property named as a built-in one in either language, whatever the tag's language", () => {
    // "Status" on a Chinese tag, "备注" on an English one.
    expect(
      customPropertyDefinitions(onTag({ name: "Status", type: 1, pos: null })),
    ).toEqual([]);
    expect(
      customPropertyDefinitions([
        ...tagBlocks.en.properties,
        { name: "备注", type: 3, pos: null },
      ]),
    ).toEqual([]);
  });

  it("does not take an invalidated built-in property, its type changed, for a custom one", () => {
    // The note changed to a number in Orca (ADR 0008).
    const properties = tagBlocks.zh.properties.map((p) =>
      p.name === "备注" ? { ...p, type: 3 } : p,
    );
    expect(customPropertyDefinitions(properties)).toEqual([]);
  });

  it("reads a date property without a subtype, or with an unknown one, as a date and time", () => {
    expect(
      customPropertyDefinitions(
        onTag(
          { name: "a", type: 5, pos: null },
          { name: "b", type: 5, pos: null, typeArgs: { subType: "week" } },
        ),
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
      ).map((d) => d.name),
    ).toEqual(["y", "z", "a", "b"]);
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
      planCustomChoiceAdditions(tag, "来源", { kind: "single", value: "内部" }),
    ).toBeUndefined();
    expect(
      planCustomChoiceAdditions(tag, "来源", { kind: "single", value: null }),
    ).toBeUndefined();
  });

  it("appends a new option as a string after string options, keeping the whole typeArgs and a null pos", () => {
    expect(
      planCustomChoiceAdditions(onTag(fromInterface), "来源", {
        kind: "single",
        value: "合作方",
      }),
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
      planCustomChoiceAdditions(onTag(property), "涉及", {
        kind: "multi",
        value: ["y", "x", "z", "y"],
      }),
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
      planCustomChoiceAdditions(onTag(property), "涉及", {
        kind: "multi",
        value: ["x"],
      }),
    ).toEqual({
      name: "涉及",
      type: 6,
      pos: null,
      typeArgs: { subType: "multi", choices: [{ n: "x", c: "" }] },
    });
  });

  it("refuses a property that is no longer defined, or whose kind changed", () => {
    expect(() =>
      planCustomChoiceAdditions(onTag(), "来源", {
        kind: "single",
        value: "客户",
      }),
    ).toThrow(CustomPropertyChangedError);
    expect(() =>
      planCustomChoiceAdditions(onTag(fromInterface), "来源", {
        kind: "multi",
        value: ["客户"],
      }),
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
