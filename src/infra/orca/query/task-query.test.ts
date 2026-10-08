// The query shapes asserted here are the ones that gave correct results in
// docs/spikes/tag-property-query.md ("能用的条件"). Two shapes that look
// simpler give wrong results and must not come back: a single-select
// property with `op: 3` and an array (Q3b, always empty), and a multi-select
// property with `op: 4` (Q11, wrong set).
import { describe, expect, it } from "vitest";
import { OrcaError } from "../orca-error";
import { buildTaskQuery, type TaskTagNames } from "./task-query";

const zhTag: TaskTagNames = {
  tagName: "任务",
  language: "zh",
  invalidated: [],
};

// ADR 0013: a task has a parent or an alias (page-task P2), so pages count
// and orphans and journal blocks do not.
const notOrphan = {
  kind: 101,
  conditions: [
    { kind: 9, hasParent: true },
    { kind: 9, hasAliases: true },
  ],
};
const allResults = 100_000;

describe("buildTaskQuery", () => {
  it("asks for every task that is not an orphan, with an explicit page size and no sort or page", () => {
    expect(buildTaskQuery({}, zhTag)).toEqual({
      q: { kind: 100, conditions: [{ kind: 4, name: "任务" }, notOrphan] },
      pageSize: allResults,
    });
  });

  it("matches one status by equality on the tag condition", () => {
    expect(buildTaskQuery({ statuses: ["inbox"] }, zhTag).q).toEqual({
      kind: 100,
      conditions: [
        {
          kind: 4,
          name: "任务",
          properties: [{ name: "状态", op: 1, value: "收集箱" }],
        },
        notOrphan,
      ],
    });
  });

  it("matches one of several statuses with an OR group, not op 3 with an array (Q3b returns nothing)", () => {
    expect(buildTaskQuery({ statuses: ["todo", "doing"] }, zhTag).q).toEqual({
      kind: 100,
      conditions: [
        { kind: 4, name: "任务" },
        notOrphan,
        {
          kind: 101,
          conditions: [
            {
              kind: 4,
              name: "任务",
              properties: [{ name: "状态", op: 1, value: "待开始" }],
            },
            {
              kind: 4,
              name: "任务",
              properties: [{ name: "状态", op: 1, value: "进行中" }],
            },
          ],
        },
      ],
    });
  });

  it("matches contexts the task holds all of with op 3 and an array", () => {
    expect(
      buildTaskQuery({ contexts: { includes: ["@home", "@phone"] } }, zhTag).q,
    ).toEqual({
      kind: 100,
      conditions: [
        {
          kind: 4,
          name: "任务",
          properties: [{ name: "上下文", op: 3, value: ["@home", "@phone"] }],
        },
        notOrphan,
      ],
    });
  });

  it("excludes contexts with one negated group per value, not op 4 (Q11 matches the wrong tasks)", () => {
    expect(
      buildTaskQuery({ contexts: { excludes: ["@home", "@phone"] } }, zhTag).q,
    ).toEqual({
      kind: 100,
      conditions: [
        { kind: 4, name: "任务" },
        notOrphan,
        {
          kind: 100,
          negate: true,
          conditions: [
            {
              kind: 4,
              name: "任务",
              properties: [{ name: "上下文", op: 3, value: "@home" }],
            },
          ],
        },
        {
          kind: 100,
          negate: true,
          conditions: [
            {
              kind: 4,
              name: "任务",
              properties: [{ name: "上下文", op: 3, value: "@phone" }],
            },
          ],
        },
      ],
    });
  });

  it("filters labels the same way as contexts, on the label property", () => {
    expect(
      buildTaskQuery(
        { labels: { includes: ["work"], excludes: ["blocked"] } },
        zhTag,
      ).q,
    ).toEqual({
      kind: 100,
      conditions: [
        {
          kind: 4,
          name: "任务",
          properties: [{ name: "标记", op: 3, value: ["work"] }],
        },
        notOrphan,
        {
          kind: 100,
          negate: true,
          conditions: [
            {
              kind: 4,
              name: "任务",
              properties: [{ name: "标记", op: 3, value: "blocked" }],
            },
          ],
        },
      ],
    });
  });

  it("matches tasks at any depth below a block with an ancestor group", () => {
    expect(buildTaskQuery({ underBlockId: 42 }, zhTag).q).toEqual({
      kind: 100,
      conditions: [
        { kind: 4, name: "任务" },
        notOrphan,
        { kind: 102, conditions: [{ kind: 12, blockId: 42 }] },
      ],
    });
  });

  it("combines every condition on an English task tag with English names", () => {
    const enTag: TaskTagNames = {
      tagName: "Task",
      language: "en",
      invalidated: [],
    };
    expect(
      buildTaskQuery(
        {
          statuses: ["waiting", "someday"],
          contexts: { includes: ["@home"], excludes: ["@car"] },
          labels: { includes: ["work"] },
          underBlockId: 7,
        },
        enTag,
      ),
    ).toEqual({
      q: {
        kind: 100,
        conditions: [
          {
            kind: 4,
            name: "Task",
            properties: [
              { name: "Context", op: 3, value: ["@home"] },
              { name: "Label", op: 3, value: ["work"] },
            ],
          },
          notOrphan,
          {
            kind: 101,
            conditions: [
              {
                kind: 4,
                name: "Task",
                properties: [{ name: "Status", op: 1, value: "Waiting" }],
              },
              {
                kind: 4,
                name: "Task",
                properties: [{ name: "Status", op: 1, value: "Someday" }],
              },
            ],
          },
          {
            kind: 100,
            negate: true,
            conditions: [
              {
                kind: 4,
                name: "Task",
                properties: [{ name: "Context", op: 3, value: "@car" }],
              },
            ],
          },
          { kind: 102, conditions: [{ kind: 12, blockId: 7 }] },
        ],
      },
      pageSize: allResults,
    });
  });

  describe("on a task tag with invalidated properties", () => {
    // ADR 0008: an invalidated property reads as empty, so a query on it
    // could never agree with reading; it fails instead of running.
    const tag: TaskTagNames = {
      ...zhTag,
      invalidated: ["status", "context", "label"],
    };

    it.each([
      ["status", { statuses: ["inbox"] as const }],
      ["contexts it includes", { contexts: { includes: ["@home"] } }],
      ["contexts it excludes", { contexts: { excludes: ["@home"] } }],
      ["labels", { labels: { includes: ["house"] } }],
    ])("refuses to filter by %s", (_, filter) => {
      expect(() => buildTaskQuery(filter, tag)).toThrow(OrcaError);
    });

    it("still filters by properties that are not invalidated", () => {
      const statusOnly: TaskTagNames = { ...zhTag, invalidated: ["status"] };
      expect(() =>
        buildTaskQuery(
          { contexts: { includes: ["@home"] }, underBlockId: 42 },
          statusOnly,
        ),
      ).not.toThrow();
    });

    it("treats empty value lists as no filter", () => {
      expect(() =>
        buildTaskQuery({ contexts: { includes: [], excludes: [] } }, tag),
      ).not.toThrow();
    });
  });
});
