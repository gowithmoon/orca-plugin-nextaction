// The block search behind block reference candidates (#115). The text
// condition (`kind: 8`) is not measured yet
// (.scratch/spikes/step12-blockref-candidates.js); the tag condition and the
// "has a parent or an alias" group are the shapes of tag-property-query and
// page-task P2.
import { describe, expect, it } from "vitest";
import { buildBlockSearchQuery } from "./block-search-query";

const notOrphan = {
  kind: 101,
  conditions: [
    { kind: 9, hasParent: true },
    { kind: 9, hasAliases: true },
  ],
};

describe("buildBlockSearchQuery", () => {
  it("searches the text under the scope tag, journals and orphans left out, with an explicit page size", () => {
    expect(buildBlockSearchQuery("张三", "人")).toEqual({
      q: {
        kind: 100,
        conditions: [
          { kind: 4, name: "人" },
          { kind: 8, text: "张三" },
          notOrphan,
        ],
      },
      pageSize: 200,
    });
  });

  it("searches every block without a scope", () => {
    expect(buildBlockSearchQuery("张三", null)).toEqual({
      q: { kind: 100, conditions: [{ kind: 8, text: "张三" }, notOrphan] },
      pageSize: 200,
    });
  });

  it("lists the blocks under the scope tag when nothing is searched", () => {
    expect(buildBlockSearchQuery("  ", "人")).toEqual({
      q: { kind: 100, conditions: [{ kind: 4, name: "人" }, notOrphan] },
      pageSize: 200,
    });
  });

  it("asks for nothing when nothing is searched and there is no scope", () => {
    expect(buildBlockSearchQuery("", null)).toBeUndefined();
  });
});
