import { describe, expect, it } from "vitest";
import { blocks, tagBlocks } from "../../../../tests/task-block-fixtures";
import { planDependencyWrite } from "./dependency-write";

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
