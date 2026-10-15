import { describe, expect, it } from "vitest";
import {
  type OwnershipLink,
  ownershipDecision,
  owningProject,
  settingCounts,
} from "./ownership";

/** Blocks 10, 11 and 12 are projects; anything else is not. */
const isProject = (id: number) => id === 10 || id === 11 || id === 12;

const link = (
  id: number,
  own: { set?: number | null; block?: number } = {},
): OwnershipLink => ({
  task: { id },
  ...(own.set !== undefined && {
    projectSetting: { refId: 900 + id, target: own.set },
  }),
  ...(own.block !== undefined && { projectBlock: own.block }),
});

describe("所属项目: a task's own ownership", () => {
  it("a task with neither a setting nor a project block belongs to none", () => {
    expect(owningProject([link(1)], isProject)).toBeNull();
    expect(ownershipDecision([link(1)], isProject)).toBeNull();
  });

  it("a task in a project block belongs to it", () => {
    expect(ownershipDecision([link(1, { block: 10 })], isProject)).toEqual({
      project: 10,
      link: 0,
      by: "block",
    });
  });

  it("its own setting comes before the project block it is in", () => {
    expect(
      ownershipDecision([link(1, { set: 11, block: 10 })], isProject),
    ).toEqual({ project: 11, link: 0, by: "setting" });
  });

  it("a stale setting counts as none: the project block decides", () => {
    // Block 7 is no longer a project; a setting with no reference is stale too.
    expect(
      ownershipDecision([link(1, { set: 7, block: 10 })], isProject),
    ).toEqual({ project: 10, link: 0, by: "block" });
    expect(owningProject([link(1, { set: null, block: 10 })], isProject)).toBe(
      10,
    );
    expect(owningProject([link(1, { set: 7 })], isProject)).toBeNull();
  });

  it("a block both task and project is not its own task's project, set or not", () => {
    expect(owningProject([link(12, { set: 12 })], isProject)).toBeNull();
    expect(owningProject([link(12, { set: 12, block: 10 })], isProject)).toBe(
      10,
    );
  });

  it("a project block that is no longer a project counts as none", () => {
    expect(owningProject([link(1, { block: 7 })], isProject)).toBeNull();
  });
});

describe("所属项目: parent task first", () => {
  it("a subtask with nothing of its own belongs to its parent task's project", () => {
    expect(
      ownershipDecision([link(2), link(1, { set: 10 })], isProject),
    ).toEqual({ project: 10, link: 1, by: "setting" });
  });

  it("a parent task's setting overrides the subtask's own setting", () => {
    expect(
      ownershipDecision(
        [link(2, { set: 11 }), link(1, { set: 10 })],
        isProject,
      ),
    ).toEqual({ project: 10, link: 1, by: "setting" });
  });

  it("a parent task's project block overrides the subtask's own project block", () => {
    expect(
      ownershipDecision(
        [link(2, { block: 11 }), link(1, { block: 10 })],
        isProject,
      ),
    ).toEqual({ project: 10, link: 1, by: "block" });
  });

  it("the top task with an ownership decides, not the nearest", () => {
    expect(
      owningProject(
        [link(3, { set: 12 }), link(2, { set: 11 }), link(1, { set: 10 })],
        isProject,
      ),
    ).toBe(10);
    expect(
      ownershipDecision(
        [link(3, { set: 12 }), link(2, { set: 11 }), link(1)],
        isProject,
      ),
    ).toEqual({ project: 11, link: 1, by: "setting" });
  });

  it("a parent task's stale setting falls back to its own project block", () => {
    expect(
      ownershipDecision(
        [link(2, { set: 11 }), link(1, { set: 7, block: 10 })],
        isProject,
      ),
    ).toEqual({ project: 10, link: 1, by: "block" });
  });

  it("a parent task with only a stale setting leaves the subtask to decide", () => {
    expect(
      ownershipDecision([link(2, { set: 11 }), link(1, { set: 7 })], isProject),
    ).toEqual({ project: 11, link: 0, by: "setting" });
  });
});

describe("whether a task's own setting counts", () => {
  it("counts when it names a project other than its own block", () => {
    expect(settingCounts(link(1, { set: 10 }), isProject)).toBe(true);
  });

  it("does not count when stale, absent, or naming the task's own block", () => {
    expect(settingCounts(link(1, { set: 7 }), isProject)).toBe(false);
    expect(settingCounts(link(1, { set: null }), isProject)).toBe(false);
    expect(settingCounts(link(1), isProject)).toBe(false);
    expect(settingCounts(link(12, { set: 12 }), isProject)).toBe(false);
  });
});
