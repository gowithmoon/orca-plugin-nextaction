import { describe, expect, it } from "vitest";
import { blocks, tagBlocks } from "../../../../tests/task-block-fixtures";
import {
  dependenciesWithout,
  dependentsOf,
  planDependencyWrite,
} from "./dependency-write";

const zhTagId = tagBlocks.zh.id;

describe("planDependencyWrite", () => {
  // tag-operations A2: a new dependency is a reference created first, its ID
  // then written; never a raw block ID.
  it("creates a reference for a target the task does not depend on yet", () => {
    expect(planDependencyWrite(blocks.zhDefaultsOnly, zhTagId, [201])).toEqual([
      { kind: "new", target: 201 },
    ]);
  });

  it("keeps the reference ID of a target the task already depends on", () => {
    // 262 is the sample's reference to 201, listed in its dependencies value.
    expect(planDependencyWrite(blocks.zhOneDependency, zhTagId, [201])).toEqual(
      [{ kind: "existing", refId: 262 }],
    );
  });

  // tag-operations A5: a reference ID left out is removed with its reference.
  it("writes an empty list to remove every dependency", () => {
    expect(planDependencyWrite(blocks.zhOneDependency, zhTagId, [])).toEqual(
      [],
    );
  });

  it("keeps existing references and adds new ones in the order given", () => {
    expect(
      planDependencyWrite(
        blocks.enTwoDependencies,
        tagBlocks.en.id,
        [364, 999, 301],
      ),
    ).toEqual([
      { kind: "existing", refId: 363 },
      { kind: "new", target: 999 },
      { kind: "existing", refId: 362 },
    ]);
  });

  it("does not take a date's reference to a journal for a dependency", () => {
    // 202 is zhFilled's `type: 3` reference to journal 213 for its due date.
    expect(planDependencyWrite(blocks.zhFilled, zhTagId, [213])).toEqual([
      { kind: "new", target: 213 },
    ]);
  });

  it("writes a target listed twice once", () => {
    expect(
      planDependencyWrite(blocks.zhDefaultsOnly, zhTagId, [201, 201]),
    ).toEqual([{ kind: "new", target: 201 }]);
  });
});

describe("dependentsOf", () => {
  // next-action-hierarchy-boolean-deps D1: Z's backRefs were 276 (A, type 3),
  // 277 (B, type 3) and 279 (C, an inline reference, type 1).
  it("finds the blocks with a type 3 reference to it, not inline ones", () => {
    const z = {
      id: 270,
      backRefs: [
        { id: 276, from: 271, type: 3 },
        { id: 277, from: 272, type: 3 },
        { id: 279, from: 273, type: 1 },
      ],
    };

    expect(dependentsOf(z)).toEqual(
      new Map([
        [271, new Set([276])],
        [272, new Set([277])],
      ]),
    );
  });

  it("finds none without back references", () => {
    expect(dependentsOf({ id: 201, backRefs: [] })).toEqual(new Map());
    expect(dependentsOf({ id: 201, backRefs: null })).toEqual(new Map());
  });
});

describe("dependenciesWithout", () => {
  it("removes the whole value when that was the only dependency", () => {
    // tag-operations A4: writing [] removes the value and the reference.
    expect(
      dependenciesWithout(blocks.zhOneDependency, zhTagId, new Set([262])),
    ).toEqual({ kind: "write", refIds: [] });
  });

  it("keeps the other dependencies in order", () => {
    expect(
      dependenciesWithout(
        blocks.enTwoDependencies,
        tagBlocks.en.id,
        new Set([362]),
      ),
    ).toEqual({ kind: "write", refIds: [363] });
  });

  it("leaves a value that does not hold the reference unchanged", () => {
    // 202 is zhFilled's `type: 3` reference to a journal for its due date,
    // not a dependency.
    expect(
      dependenciesWithout(blocks.zhFilled, zhTagId, new Set([202])),
    ).toEqual({ kind: "unchanged" });
    expect(
      dependenciesWithout(blocks.zhOneDependency, zhTagId, new Set([999])),
    ).toEqual({ kind: "unchanged" });
  });

  it("keeps a value holding something other than reference IDs", () => {
    const damaged = {
      refs: [
        {
          id: 281,
          type: 2,
          to: zhTagId,
          data: [{ name: "依赖", value: [262, "x"] }],
        },
        { id: 262, type: 3, to: 201 },
      ],
    };

    expect(dependenciesWithout(damaged, zhTagId, new Set([262]))).toEqual({
      kind: "unreadable",
      raw: [262, "x"],
    });
  });
});
