import { describe, expect, it, vi } from "vitest";
import {
  decodeProject,
  encodeProjectChanges,
  encodeProjectStatus,
  type ProjectTagContext,
} from "./project-codec";

// Shapes as docs/spikes/project-tag.md recorded them: the project's values
// sit in the `type: 2` reference to the project tag block, apart from the
// task tag's (block B carries both).
const projectTagId = 87;
const taskTagId = 88;
const zhTag: ProjectTagContext = { tagBlockId: projectTagId, invalidated: [] };

function block(
  data: { name: string; value?: unknown }[] | null,
  extra: Partial<{
    id: number;
    parent: number | null;
    aliases: string[];
    content: { t: string; v: unknown }[];
    properties: { name: string; value?: unknown }[];
    otherRefs: { id: number; type: number; to: number; data?: unknown[] }[];
  }> = {},
) {
  return {
    id: extra.id ?? 89,
    created: new Date("2026-10-15T01:00:00.000Z"),
    parent: extra.parent === undefined ? 10 : extra.parent,
    aliases: extra.aliases ?? [],
    content: extra.content ?? [{ t: "t", v: "P 测试项目" }],
    properties: extra.properties ?? [],
    refs: [
      ...(data === null
        ? []
        : [{ id: 49, type: 2, to: projectTagId, data: [...data] }]),
      ...((extra.otherRefs ?? []) as {
        id: number;
        type: number;
        to: number;
      }[]),
    ],
  };
}

function decoded(raw: Parameters<typeof decodeProject>[0], tag = zhTag) {
  const result = decodeProject(raw, tag);
  if (result.kind !== "project") {
    throw new Error(`expected a project, got ${JSON.stringify(result)}`);
  }
  return result.project;
}

describe("decodeProject", () => {
  it("reads every value of a project on a Chinese project tag", () => {
    expect(
      decoded(
        block([
          { name: "项目状态", value: "进行中" },
          { name: "目标", value: "搬进新家" },
          { name: "开始日期", value: new Date("2026-10-19T16:00:00.000Z") },
          { name: "截止日期", value: "2026-12-30T16:00:00.000Z" },
          { name: "重要性", value: 6 },
          { name: "紧急度", value: 2 },
        ]),
      ),
    ).toEqual({
      id: 89,
      text: "P 测试项目",
      status: "active",
      goal: "搬进新家",
      start: { year: 2026, month: 10, day: 20 },
      due: { year: 2026, month: 12, day: 31 },
      importance: 6,
      urgency: 2,
      created: new Date("2026-10-15T01:00:00.000Z"),
    });
  });

  it("reads the English names", () => {
    const project = decoded(
      block([
        { name: "Project status", value: "Paused" },
        { name: "Goal", value: "Moved in" },
      ]),
    );
    expect(project.status).toBe("paused");
    expect(project.goal).toBe("Moved in");
  });

  it("reads a freshly tagged project as planning, rated 4, with no goal (project-tag)", () => {
    expect(
      decoded(
        block([
          { name: "项目状态", value: "规划中" },
          { name: "重要性", value: 4 },
        ]),
      ),
    ).toMatchObject({
      status: "planning",
      goal: null,
      start: null,
      due: null,
      importance: 4,
      urgency: 4,
    });
  });

  it.each([
    ["empty", null],
    ["missing", undefined],
    ["unknown", "搁置"],
    ["a task status that is not a project status", "待开始"],
    ["not a string", 3],
  ])("reads a project status that is %s as planning", (_, value) => {
    const data =
      value === undefined
        ? []
        : [{ name: "项目状态", value: value as unknown }];
    expect(decoded(block(data)).status).toBe("planning");
  });

  it("reads an importance or urgency outside 1–7 as 4", () => {
    const project = decoded(
      block([
        { name: "重要性", value: 9 },
        { name: "紧急度", value: 2.5 },
      ]),
    );
    expect(project.importance).toBe(4);
    expect(project.urgency).toBe(4);
  });

  it("reads invalidated properties as empty: the status as planning", () => {
    const project = decoded(
      block([
        { name: "项目状态", value: "进行中" },
        { name: "重要性", value: 7 },
        { name: "目标", value: "搬进新家" },
      ]),
      { tagBlockId: projectTagId, invalidated: ["status", "importance"] },
    );
    expect(project.status).toBe("planning");
    expect(project.importance).toBe(4);
    expect(project.goal).toBe("搬进新家");
  });

  it("reads only the project tag's values on a block that also carries the task tag", () => {
    const project = decoded(
      block([{ name: "项目状态", value: "进行中" }], {
        otherRefs: [
          {
            id: 53,
            type: 2,
            to: taskTagId,
            data: [
              { name: "状态", value: "待开始" },
              { name: "重要性", value: 7 },
            ],
          },
        ],
      }),
    );
    expect(project.status).toBe("active");
    expect(project.importance).toBe(4);
  });

  it("takes a page's alias for its text", () => {
    expect(
      decoded(block([], { parent: null, aliases: ["搬家"], content: [] })).text,
    ).toBe("搬家");
  });

  it("reads a block without the project tag as no project", () => {
    expect(decodeProject(block(null), zhTag)).toEqual({
      kind: "not-project",
      reason: "untagged",
    });
  });

  it("reads a journal block or an orphan as no project (ADR 0013)", () => {
    expect(
      decodeProject(block([], { parent: null, aliases: [] }), zhTag),
    ).toEqual({ kind: "not-project", reason: "orphan" });
  });

  it("points a mirror at its source block (project-tag, round 2)", () => {
    expect(
      decodeProject(
        block(null, {
          id: 100,
          properties: [
            { name: "_repr", value: { type: "mirror", mirroredId: 97 } },
          ],
        }),
        zhTag,
      ),
    ).toEqual({ kind: "mirror", sourceId: 97 });
  });

  it("reads an unreadable creation time as the epoch, with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw = { ...block([]), created: "not a date" };
    expect(decoded(raw).created).toEqual(new Date(0));
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe("encodeProjectChanges", () => {
  const zh = { language: "zh" as const, invalidated: [] };

  it("writes each property passed, and only those", () => {
    expect(encodeProjectChanges({ goal: "搬进新家" }, zh)).toEqual([
      { name: "目标", value: "搬进新家" },
    ]);
    expect(encodeProjectChanges({ importance: 6 }, zh)).toEqual([
      { name: "重要性", value: 6 },
    ]);
    expect(encodeProjectChanges({ urgency: 2 }, zh)).toEqual([
      { name: "紧急度", value: 2 },
    ]);
    expect(
      encodeProjectChanges({ start: { year: 2026, month: 10, day: 20 } }, zh),
    ).toEqual([{ name: "开始日期", type: 5, value: new Date(2026, 9, 20) }]);
    expect(
      encodeProjectChanges(
        { due: { year: 2026, month: 12, day: 31 } },
        { language: "en", invalidated: [] },
      ),
    ).toEqual([{ name: "Due", type: 5, value: new Date(2026, 11, 31) }]);
  });

  it("clears the goal and the dates with null", () => {
    expect(
      encodeProjectChanges({ goal: null, start: null, due: null }, zh),
    ).toEqual([
      { name: "目标", value: null },
      { name: "开始日期", value: null },
      { name: "截止日期", value: null },
    ]);
  });

  it("encodes nothing for no changes", () => {
    expect(encodeProjectChanges({}, zh)).toEqual([]);
  });

  it("refuses to write an invalidated property, encoding nothing", () => {
    expect(() =>
      encodeProjectChanges(
        { goal: "x", due: null },
        { language: "zh", invalidated: ["due"] },
      ),
    ).toThrow("invalidated");
  });

  it("writes the others while one not passed is invalidated", () => {
    expect(
      encodeProjectChanges(
        { urgency: 7 },
        { language: "zh", invalidated: ["importance"] },
      ),
    ).toEqual([{ name: "紧急度", value: 7 }]);
  });
});

describe("encodeProjectStatus", () => {
  it("writes the option name in the language of the names on the tag", () => {
    expect(
      encodeProjectStatus("someday", { language: "zh", invalidated: [] }),
    ).toEqual({ name: "项目状态", value: "将来/也许" });
    expect(
      encodeProjectStatus("active", { language: "en", invalidated: [] }),
    ).toEqual({ name: "Project status", value: "Active" });
  });

  it("refuses to write an invalidated project status", () => {
    expect(() =>
      encodeProjectStatus("done", { language: "zh", invalidated: ["status"] }),
    ).toThrow("invalidated");
  });
});
