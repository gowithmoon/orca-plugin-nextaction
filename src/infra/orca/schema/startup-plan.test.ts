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
  { name: "开始日期", type: 5, pos: 3, typeArgs: { subType: "date" } },
  { name: "截止日期", type: 5, pos: 4, typeArgs: { subType: "date" } },
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

/**
 * A tag block as read back from Orca, holding `properties` (in this order)
 * and called by `aliases`.
 */
function tagBlock(properties: unknown[], id = 211, aliases: string[] = []) {
  return {
    id,
    aliases,
    properties: [
      ...properties,
      { name: "_repr", type: 0, pos: null, value: { type: "text" } },
      { name: "_show", type: 0, pos: null },
    ],
  } as never;
}

/** Read-back form of a definition: Orca adds `value: null`. */
const readBack = <T extends object>(definitions: T[]) =>
  definitions.map((definition) => ({ ...definition, value: null }));

const without = (names: string[]) =>
  zhDefinitions.filter((definition) => !names.includes(definition.name));

/** The cache says this tag block was already taken over. */
const takenOver = { tagBlockId: 211, tagName: "任务" };

describe("startup plan", () => {
  it("creates a Chinese task tag in an empty repo with a Chinese interface", () => {
    expect(
      planStartup({
        tagName: "任务",
        tagBlock: undefined,
        cache: undefined,
        uiLanguage: "zh",
      }),
    ).toEqual({
      action: { kind: "create", tagName: "任务" },
      writes: zhDefinitions,
    });
  });

  it("creates an English task tag in an empty repo with an English interface", () => {
    expect(
      planStartup({
        tagName: "Task",
        tagBlock: undefined,
        cache: undefined,
        uiLanguage: "en",
      }),
    ).toEqual({
      action: { kind: "create", tagName: "Task" },
      writes: enDefinitions,
    });
  });

  it("writes nothing when the task tag already has the complete structure", () => {
    expect(
      planStartup({
        tagName: "任务",
        tagBlock: tagBlock(readBack(zhDefinitions)),
        cache: takenOver,
        uiLanguage: "zh",
      }),
    ).toEqual({
      action: { kind: "use", tagBlockId: 211, invalidated: [], language: "zh" },
      writes: [],
    });
  });

  it("adds a missing property with its full definition and pos", () => {
    expect(
      planStartup({
        tagName: "任务",
        tagBlock: tagBlock(readBack(without(["标记"]))),
        cache: takenOver,
        uiLanguage: "zh",
      }),
    ).toEqual({
      action: { kind: "use", tagBlockId: 211, invalidated: [], language: "zh" },
      writes: [
        {
          name: "标记",
          type: 6,
          pos: 6,
          typeArgs: { subType: "multi", choices: [] },
        },
      ],
    });
  });

  it("adds a missing status option and keeps the user's options and colors", () => {
    const status = {
      name: "状态",
      type: 6,
      pos: 0,
      value: null,
      typeArgs: {
        subType: "single",
        defaultEnabled: true,
        default: "收集箱",
        // "等待中" deleted; "收集箱" recolored; "放弃" added by the user.
        choices: [
          { n: "收集箱", c: "#000000" },
          { n: "待开始", c: "#2196f3" },
          { n: "放弃", c: "#123456" },
          { n: "进行中", c: "#ff9800" },
          { n: "将来/也许", c: "#795548" },
          { n: "已完成", c: "#4caf50" },
        ],
      },
    };

    expect(
      planStartup({
        tagName: "任务",
        tagBlock: tagBlock([status, ...readBack(without(["状态"]))]),
        cache: takenOver,
        uiLanguage: "zh",
      }).writes,
    ).toEqual([
      {
        name: "状态",
        type: 6,
        pos: 0,
        typeArgs: {
          subType: "single",
          defaultEnabled: true,
          default: "收集箱",
          choices: [
            { n: "收集箱", c: "#000000" },
            { n: "待开始", c: "#2196f3" },
            { n: "放弃", c: "#123456" },
            { n: "进行中", c: "#ff9800" },
            { n: "将来/也许", c: "#795548" },
            { n: "已完成", c: "#4caf50" },
            { n: "等待中", c: "#9c27b0" },
          ],
        },
      },
    ]);
  });

  it("switches a default that was turned off back on", () => {
    const importance = {
      name: "重要性",
      type: 3,
      pos: 1,
      value: null,
      typeArgs: { defaultEnabled: false, default: 4 },
    };

    expect(
      planStartup({
        tagName: "任务",
        tagBlock: tagBlock([importance, ...readBack(without(["重要性"]))]),
        cache: takenOver,
        uiLanguage: "zh",
      }).writes,
    ).toEqual([
      {
        name: "重要性",
        type: 3,
        pos: 1,
        typeArgs: { defaultEnabled: true, default: 4 },
      },
    ]);
  });

  it("names a missing property in the tag's language, not the interface's", () => {
    expect(
      planStartup({
        tagName: "任务",
        tagBlock: tagBlock(readBack(without(["备注"]))),
        cache: takenOver,
        uiLanguage: "en",
      }).writes,
    ).toEqual([{ name: "备注", type: 1, pos: 7 }]);
  });

  it("keeps the position of a property the user moved when aligning it", () => {
    const movedEffort = {
      name: "工作量",
      type: 3,
      pos: 9,
      value: null,
      typeArgs: { defaultEnabled: false, default: 4 },
    };

    expect(
      planStartup({
        tagName: "任务",
        tagBlock: tagBlock([movedEffort, ...readBack(without(["工作量"]))]),
        cache: takenOver,
        uiLanguage: "zh",
      }).writes,
    ).toEqual([
      {
        name: "工作量",
        type: 3,
        pos: 9,
        typeArgs: { defaultEnabled: true, default: 4 },
      },
    ]);
  });

  it("leaves the user's own properties and options alone, even on a first takeover", () => {
    const withContexts = {
      name: "上下文",
      type: 6,
      pos: 5,
      value: null,
      typeArgs: {
        subType: "multi",
        choices: [
          { n: "家", c: "#2196f3" },
          { n: "公司", c: "#ff9800" },
        ],
      },
    };
    const ownProperty = {
      name: "精力",
      type: 6,
      pos: 8,
      value: null,
      typeArgs: { subType: "single", choices: [{ n: "高", c: "#f44336" }] },
    };

    expect(
      planStartup({
        tagName: "任务",
        tagBlock: tagBlock([
          withContexts,
          ownProperty,
          ...readBack(without(["上下文"])),
        ]),
        cache: undefined,
        uiLanguage: "zh",
      }),
    ).toEqual({
      action: { kind: "use", tagBlockId: 211, invalidated: [], language: "zh" },
      writes: [],
    });
  });

  it("goes by most of the tag's properties when one carries a name of the other language", () => {
    // The user added a property of their own that happens to be called
    // "Label"; the tag is still Chinese and lacks "备注".
    const ownLabel = { name: "Label", type: 1, pos: 9, value: null };

    expect(
      planStartup({
        tagName: "任务",
        tagBlock: tagBlock([ownLabel, ...readBack(without(["备注"]))]),
        cache: takenOver,
        uiLanguage: "en",
      }).writes,
    ).toEqual([{ name: "备注", type: 1, pos: 7 }]);
  });

  it("plans nothing more once its writes are applied", () => {
    // A tag the user has worn down: options removed and recolored, a default
    // switched off, a property deleted, one of their own added.
    const worn: ({ name: string } & Record<string, unknown>)[] = [
      {
        name: "状态",
        type: 6,
        pos: 0,
        value: null,
        typeArgs: {
          subType: "single",
          choices: [
            { n: "放弃", c: "#123456" },
            { n: "收集箱", c: "#000000" },
          ],
        },
      },
      {
        name: "重要性",
        type: 3,
        pos: 1,
        value: null,
        typeArgs: { defaultEnabled: false, default: 4 },
      },
      { name: "精力", type: 1, pos: 8, value: null },
      ...readBack(without(["状态", "重要性", "备注"])),
    ];
    const input = (properties: unknown[]) => ({
      tagName: "任务",
      tagBlock: tagBlock(properties),
      cache: takenOver,
      uiLanguage: "zh" as const,
    });

    const first = planStartup(input(worn));
    expect(first.writes).not.toEqual([]);

    // Orca's setProperties: merges by name, replaces typeArgs as a whole
    // (tag-operations spike).
    const applied: typeof worn = worn.map((property) => {
      const write = first.writes.find((w) => w.name === property.name);
      return write ? { ...write, value: null } : property;
    });
    for (const write of first.writes) {
      if (!applied.some((property) => property.name === write.name)) {
        applied.push({ ...write, value: null });
      }
    }

    expect(planStartup(input(applied)).writes).toEqual([]);
  });

  describe("conflicting definitions", () => {
    // A user's own tag that happens to share the name: "状态" is a number.
    const numericStatus = { name: "状态", type: 3, pos: 0, value: null };
    const foreignTag = tagBlock([numericStatus], 305);

    it.each([
      ["there is no cache", undefined],
      [
        "the cache points at another block",
        { tagBlockId: 211, tagName: "任务" },
      ],
    ])("refuses a first takeover and writes nothing when %s", (_, cache) => {
      expect(
        planStartup({
          tagName: "任务",
          tagBlock: foreignTag,
          cache,
          uiLanguage: "zh",
        }),
      ).toEqual({
        action: { kind: "refuse", conflicts: ["status"], language: "zh" },
        writes: [],
      });
    });

    it("invalidates only the conflicting property of a tag already taken over", () => {
      // The user turned "重要性" into a single choice and deleted "标记".
      const singleChoiceImportance = {
        name: "重要性",
        type: 6,
        pos: 1,
        value: null,
        typeArgs: { subType: "single", choices: [] },
      };

      expect(
        planStartup({
          tagName: "任务",
          tagBlock: tagBlock([
            singleChoiceImportance,
            ...readBack(without(["重要性", "标记"])),
          ]),
          cache: takenOver,
          uiLanguage: "zh",
        }),
      ).toEqual({
        action: {
          kind: "use",
          tagBlockId: 211,
          invalidated: ["importance"],
          language: "zh",
        },
        writes: [
          {
            name: "标记",
            type: 6,
            pos: 6,
            typeArgs: { subType: "multi", choices: [] },
          },
        ],
      });
    });

    it("treats a date property with a different subtype as a conflict", () => {
      const dateTimeDue = {
        name: "截止日期",
        type: 5,
        pos: 4,
        value: null,
        typeArgs: { subType: "datetime" },
      };

      expect(
        planStartup({
          tagName: "任务",
          tagBlock: tagBlock([dateTimeDue, ...readBack(without(["截止日期"]))]),
          cache: takenOver,
          uiLanguage: "zh",
        }),
      ).toEqual({
        action: {
          kind: "use",
          tagBlockId: 211,
          invalidated: ["due"],
          language: "zh",
        },
        writes: [],
      });
    });
  });
  describe("rename while the plugin was off", () => {
    // The user renamed "任务" to "GTD" in the settings while the plugin was
    // disabled: no block is called "GTD", the cached block is still "任务".
    const renamedInSettings = { tagBlockId: 211, tagName: "任务" };

    it("renames the cached tag instead of creating one", () => {
      expect(
        planStartup({
          tagName: "GTD",
          tagBlock: undefined,
          cache: renamedInSettings,
          cachedBlock: tagBlock(readBack(zhDefinitions), 211, ["任务"]),
          uiLanguage: "en",
        }),
      ).toEqual({
        action: {
          kind: "rename",
          from: "任务",
          to: "GTD",
          tagBlockId: 211,
          invalidated: [],
          language: "zh",
        },
        writes: [],
      });
    });

    it.each([
      ["the block was reused for something else", tagBlock([])],
      [
        "the tag was renamed in Orca itself",
        tagBlock(readBack(zhDefinitions), 211, ["别的名字"]),
      ],
      ["the block no longer exists", undefined],
    ])("creates a tag under the new name when %s", (_, cachedBlock) => {
      expect(
        planStartup({
          tagName: "GTD",
          tagBlock: undefined,
          cache: renamedInSettings,
          cachedBlock,
          uiLanguage: "zh",
        }),
      ).toEqual({
        action: { kind: "create", tagName: "GTD" },
        writes: zhDefinitions,
      });
    });

    describe("onto a name another block already has", () => {
      // The user renamed "任务" to "NA已占用" in the settings while the plugin
      // was disabled, and a page is already called "NA已占用" (ADR 0002).
      const cachedTag = tagBlock(readBack(zhDefinitions), 211, ["任务"]);

      it.each([
        ["a plain page", tagBlock([], 305, ["NA已占用"])],
        [
          "a page that would pass a takeover",
          tagBlock(readBack(zhDefinitions), 305, ["NA已占用"]),
        ],
      ])("keeps the cached tag rather than taking over %s", (_, page) => {
        expect(
          planStartup({
            tagName: "NA已占用",
            tagBlock: page,
            cache: renamedInSettings,
            cachedBlock: cachedTag,
            uiLanguage: "zh",
          }),
        ).toEqual({
          action: {
            kind: "revert",
            tagBlockId: 211,
            tagName: "任务",
            requested: "NA已占用",
            invalidated: [],
            language: "zh",
          },
          writes: [],
        });
      });

      it("still aligns the cached tag it keeps", () => {
        const plan = planStartup({
          tagName: "NA已占用",
          tagBlock: tagBlock([], 305, ["NA已占用"]),
          cache: renamedInSettings,
          cachedBlock: tagBlock(readBack(without(["备注"])), 211, ["任务"]),
          uiLanguage: "zh",
        });
        expect(plan.action.kind).toBe("revert");
        expect(plan.writes).toEqual([{ name: "备注", type: 1, pos: 7 }]);
      });

      it("goes by the name when the cached block is no longer the tag", () => {
        expect(
          planStartup({
            tagName: "NA已占用",
            tagBlock: tagBlock(readBack(zhDefinitions), 305, ["NA已占用"]),
            cache: renamedInSettings,
            cachedBlock: tagBlock(readBack(zhDefinitions), 211, ["别的名字"]),
            uiLanguage: "zh",
          }).action,
        ).toEqual({
          kind: "use",
          tagBlockId: 305,
          invalidated: [],
          language: "zh",
        });
      });
    });

    it("goes by the name alone when the cache is lost", () => {
      expect(
        planStartup({
          tagName: "GTD",
          tagBlock: tagBlock(readBack(zhDefinitions), 305),
          cache: undefined,
          uiLanguage: "zh",
        }),
      ).toEqual({
        action: {
          kind: "use",
          tagBlockId: 305,
          invalidated: [],
          language: "zh",
        },
        writes: [],
      });
      expect(
        planStartup({
          tagName: "GTD",
          tagBlock: undefined,
          cache: undefined,
          uiLanguage: "zh",
        }).action,
      ).toEqual({ kind: "create", tagName: "GTD" });
    });
  });
});
