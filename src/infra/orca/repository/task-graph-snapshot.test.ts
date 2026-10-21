import { describe, expect, it } from "vitest";
import type { Project } from "../../../domain/project/project";
import type { Task, TaskId } from "../../../domain/task/task";
import {
  type SnapshotParts,
  type SnapshotTaskBlock,
  taskGraphSnapshot,
} from "./task-graph-snapshot";
import type { HierarchyBlock } from "./task-hierarchy";

const task = (id: TaskId): Task => ({
  id,
  text: `task ${id}`,
  searchText: "",
  created: new Date("2026-01-01T00:00:00Z"),
  status: "todo",
  importance: 4,
  urgency: 4,
  effort: 4,
  start: null,
  due: null,
  contexts: [],
  tags: [],
  note: null,
  sequential: false,
  dependencies: [],
  dependencyMode: "all",
  dependencyDelay: 0,
  recurrence: { kind: "none" },
  review: { kind: "none" },
  reminders: { kind: "none" },
  customProperties: {},
  anomalies: [],
});

const project = (id: number): Project => ({
  id,
  text: `project ${id}`,
  status: "active",
  goal: null,
  start: null,
  due: null,
  importance: 4,
  urgency: 4,
  created: new Date("2026-01-01T00:00:00Z"),
});

// A block as get-blocks returns it, as far as the snapshot reads it
// (block-properties-json J1, J4).
const block = (
  id: number,
  setup: {
    parent?: number;
    children?: number[];
    aliases?: string[];
    plugin?: { name: string; value: unknown }[];
  } = {},
): SnapshotTaskBlock & HierarchyBlock => ({
  id,
  ...(setup.parent !== undefined && { parent: setup.parent }),
  children: setup.children ?? [],
  aliases: setup.aliases ?? [],
  properties: [
    { name: "_repr", value: { type: "text" } },
    ...(setup.plugin ?? []),
  ],
});

const parts = (setup: Partial<SnapshotParts>): SnapshotParts => ({
  tasks: [],
  taskBlocks: new Map(),
  projects: [],
  projectBlocks: new Map(),
  hierarchy: new Map(),
  projectSettings: new Map(),
  ...setup,
});

const byId = <T extends { id: number }>(...items: T[]) =>
  new Map(items.map((item) => [item.id, item]));

describe("taskGraphSnapshot", () => {
  it("places projects in note order when there is no task", () => {
    // Page 1 holds project 30 below project 20: 20 first, 30 inside it.
    const page = block(1, { children: [20] });
    const outer = block(20, { parent: 1, children: [30] });
    const inner = block(30, { parent: 20 });
    const snapshot = taskGraphSnapshot(
      parts({
        projects: [project(30), project(20)],
        projectBlocks: byId(outer, inner),
        hierarchy: byId(page, outer, inner),
      }),
    );
    expect(snapshot.tasks).toEqual([]);
    expect(snapshot.projects).toEqual([
      { project: project(30), position: 1, projectBlock: 20 },
      { project: project(20), position: 0 },
    ]);
  });

  it("gives each task its parent task, place, project block and page or root flag", () => {
    const page = block(1, { children: [10], aliases: ["Home"] });
    const owner = block(10, { parent: 1, children: [11] });
    const child = block(11, { parent: 10 });
    const snapshot = taskGraphSnapshot(
      parts({
        tasks: [task(11), task(1)],
        taskBlocks: byId(page, child),
        projects: [project(10)],
        projectBlocks: byId(owner),
        hierarchy: byId(page, owner, child),
      }),
    );
    expect(snapshot.tasks).toEqual([
      {
        task: task(11),
        parentId: 1,
        position: 2,
        projectBlock: 10,
      },
      { task: task(1), parentId: null, position: 0, page: true, root: true },
    ]);
    expect(snapshot.projects).toEqual([
      { project: project(10), position: 1, parentId: 1 },
    ]);
  });

  it("reads the completion history and My Day entries from the task block", () => {
    const done = block(5, {
      plugin: [
        {
          name: "nextaction.completions",
          value: {
            v: 1,
            entries: [{ at: "2026-10-07T02:00:00.000Z", day: "2026-10-07" }],
          },
        },
        {
          name: "nextaction.myday",
          value: { v: 1, entries: [{ day: "2026-10-08" }] },
        },
      ],
    });
    const [item] = taskGraphSnapshot(
      parts({
        tasks: [task(5)],
        taskBlocks: byId(done),
        hierarchy: byId(done),
      }),
    ).tasks;
    const entry = {
      at: new Date("2026-10-07T02:00:00.000Z"),
      day: { year: 2026, month: 10, day: 7 },
    };
    expect(item?.lastCompletion).toEqual(entry);
    expect(item?.completionHistory).toEqual([entry]);
    expect(item?.myDay).toEqual({
      kind: "readable",
      entries: [{ day: { year: 2026, month: 10, day: 8 } }],
    });
  });

  it("marks unreadable My Day entries so instead of reading them as none", () => {
    const odd = block(5, {
      plugin: [{ name: "nextaction.myday", value: "garbage" }],
    });
    const [item] = taskGraphSnapshot(
      parts({ tasks: [task(5)], taskBlocks: byId(odd), hierarchy: byId(odd) }),
    ).tasks;
    expect(item?.myDay).toMatchObject({ kind: "unreadable" });
    expect(item?.lastCompletion).toBeUndefined();
  });

  it("carries each task's 所属项目 setting and the paused flag", () => {
    const one = block(5);
    const snapshot = taskGraphSnapshot(
      parts({
        tasks: [task(5)],
        taskBlocks: byId(one),
        hierarchy: byId(one),
        projectSettings: new Map([[5, { refId: 77, target: 10 }]]),
        projectsPaused: true,
      }),
    );
    expect(snapshot.projectsPaused).toBe(true);
    expect(snapshot.tasks[0]?.projectSetting).toEqual({
      refId: 77,
      target: 10,
    });
  });
});
