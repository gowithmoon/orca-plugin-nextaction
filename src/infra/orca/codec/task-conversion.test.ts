import { describe, expect, it } from "vitest";
import { blocks, tagBlocks } from "../../../../tests/task-block-fixtures";
import type { TaskTagContext } from "./task-codec";
import { planConversion } from "./task-conversion";

const zhTag: TaskTagContext = { tagBlockId: tagBlocks.zh.id, invalidated: [] };

/** A root-level journal block: no parent, no alias (page-task P1). */
const journal = {
  ...blocks.plain,
  id: 36,
  parent: null,
  aliases: [],
  properties: [{ name: "_repr", value: { type: "journal" } }],
};

describe("planConversion (can this block be converted to a task)", () => {
  it("converts an ordinary block", () => {
    expect(planConversion(blocks.plain, zhTag)).toEqual({
      kind: "convertible",
      leftoverProperties: [],
    });
  });

  // ADR 0013: a page is a root-level block with an alias.
  it("converts a page", () => {
    const page = { ...blocks.plain, parent: null, aliases: ["NA页面"] };
    expect(planConversion(page, zhTag)).toEqual({
      kind: "convertible",
      leftoverProperties: [],
    });
  });

  it("refuses a journal block", () => {
    expect(planConversion(journal, zhTag)).toEqual({
      kind: "not-convertible",
      reason: "journal-or-orphan",
    });
  });

  it("refuses an orphan block", () => {
    expect(planConversion(blocks.orphan, zhTag)).toEqual({
      kind: "not-convertible",
      reason: "journal-or-orphan",
    });
  });

  it("refuses an untagged orphan block", () => {
    const untaggedOrphan = { ...blocks.plain, parent: null, aliases: [] };
    expect(planConversion(untaggedOrphan, zhTag)).toEqual({
      kind: "not-convertible",
      reason: "journal-or-orphan",
    });
  });

  it("refuses the task tag block itself", () => {
    expect(planConversion(tagBlocks.zh, zhTag)).toEqual({
      kind: "not-convertible",
      reason: "task-tag",
    });
  });

  it("reports a block that is already a task", () => {
    expect(planConversion(blocks.zhFilled, zhTag)).toEqual({
      kind: "already-task",
    });
  });

  it("reports a mirror block as a pointer to its source block", () => {
    expect(planConversion(blocks.mirror, zhTag)).toEqual({
      kind: "mirror",
      sourceId: 201,
    });
  });

  // A block whose task tag was removed in Orca keeps what the plugin wrote
  // (block-properties-json J4); only plugin block properties are leftovers.
  it("lists the plugin block properties left on the block", () => {
    const dropped = {
      ...blocks.plain,
      properties: [
        ...blocks.plain.properties,
        { name: "nextaction.completions", value: { v: 1, entries: [] } },
        { name: "nextaction.other", value: "damaged" },
        { name: "nextactionish", value: 1 },
        { name: "备注", value: "kept" },
      ],
    };
    expect(planConversion(dropped, zhTag)).toEqual({
      kind: "convertible",
      leftoverProperties: ["nextaction.completions", "nextaction.other"],
    });
  });
});
