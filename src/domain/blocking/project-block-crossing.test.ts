import { describe, expect, it } from "vitest";
import type { ProjectId } from "../project/project";
import type { Task, TaskId } from "../task/task";
import { projectBlockCrossing } from "./project-block-crossing";
import type {
  SnapshotProject,
  SnapshotTask,
  TaskGraphSnapshot,
} from "./task-graph";

function task(
  id: TaskId,
  setup: {
    parent?: TaskId;
    /** Its nearest project block. */
    block?: ProjectId;
    /** Its own 所属项目 setting. */
    set?: ProjectId;
    position?: number;
  } = {},
): SnapshotTask {
  const full = { id, text: `task ${id}`, status: "todo" } as Task;
  return {
    task: full,
    parentId: setup.parent ?? null,
    position: setup.position ?? id,
    ...(setup.block !== undefined && { projectBlock: setup.block }),
    ...(setup.set !== undefined && {
      projectSetting: { refId: 900 + id, target: setup.set },
    }),
  };
}

function project(id: ProjectId, position: number): SnapshotProject {
  return {
    project: { id, text: `project ${id}`, status: "active" },
    position,
  } as SnapshotProject;
}

/**
 * Project 10's block holds tasks 1 and 2; task 3 sits outside any project
 * block. Positions follow the notes: the project block first.
 */
function snapshot(...tasks: SnapshotTask[]): TaskGraphSnapshot {
  return { tasks, projects: [project(10, 0), project(11, 50)] };
}

describe("跨越项目块的移动 (#157)", () => {
  it("a task moved into the project block, still this project's, moves in", () => {
    // 3 belongs to project 10 by its own setting; it goes into the block.
    const graph = snapshot(
      task(1, { block: 10, position: 1 }),
      task(3, { set: 10, position: 100 }),
    );

    expect(
      projectBlockCrossing(graph, { id: 3, target: 1, placement: "before" }, 10),
    ).toEqual({ kind: "moveIn" });
  });

  it("a task moved out of the project block below a task of the project, still this project's, moves out", () => {
    // 4 sits outside the block and belongs to project 10 by its setting; as
    // its subtask, 2 follows its parent task.
    const graph = snapshot(
      task(2, { block: 10, position: 2 }),
      task(4, { set: 10, position: 100 }),
    );

    expect(
      projectBlockCrossing(
        graph,
        { id: 2, target: 4, placement: "lastChild" },
        10,
      ),
    ).toEqual({ kind: "moveOut" });
  });

  it("a task moved out of the project block next to a task of no project belongs to none", () => {
    const graph = snapshot(
      task(2, { block: 10, position: 2 }),
      task(3, { position: 100 }),
    );

    expect(
      projectBlockCrossing(graph, { id: 2, target: 3, placement: "after" }, 10),
    ).toEqual({ kind: "noProject" });
  });

  it("a subtask whose own setting its parent task overrode belongs to that project once moved out", () => {
    // 2 is set to project 11, but its parent task 1 in the block decides.
    const graph = snapshot(
      task(1, { block: 10, position: 1 }),
      task(2, { parent: 1, block: 10, set: 11, position: 2 }),
      task(3, { position: 100 }),
    );

    expect(
      projectBlockCrossing(
        graph,
        { id: 2, target: 3, placement: "before" },
        10,
      ),
    ).toEqual({ kind: "otherProject", project: 11 });
  });

  it("a task moved below a block that is both a task and another project belongs to that project", () => {
    const graph: TaskGraphSnapshot = {
      ...snapshot(
        task(2, { block: 10, position: 2 }),
        task(11, { position: 50 }),
      ),
    };

    expect(
      projectBlockCrossing(
        graph,
        { id: 2, target: 11, placement: "lastChild" },
        10,
      ),
    ).toEqual({ kind: "otherProject", project: 11 });
  });

  it("a nested project block in between is not under the project's: moving from there into it crosses", () => {
    // Project 12's block sits inside project 10's; 5 is in 12's block but
    // set to project 10.
    const graph: TaskGraphSnapshot = {
      tasks: [
        task(1, { block: 10, position: 1 }),
        task(5, { block: 12, set: 10, position: 6 }),
      ],
      projects: [project(10, 0), project(12, 5)],
    };

    expect(
      projectBlockCrossing(graph, { id: 5, target: 1, placement: "after" }, 10),
    ).toEqual({ kind: "moveIn" });
    // 1 below 5 is in project 12's block: out of 10's, still 10's by 5.
    expect(
      projectBlockCrossing(
        graph,
        { id: 1, target: 5, placement: "lastChild" },
        10,
      ),
    ).toEqual({ kind: "moveOut" });
  });

  it("a move that stays on one side of the project block's boundary does not cross it", () => {
    const graph = snapshot(
      task(1, { block: 10, position: 1 }),
      task(2, { block: 10, position: 2 }),
      task(3, { set: 10, position: 100 }),
      task(4, { set: 10, position: 101 }),
    );

    // Both under the block, as a sibling or as a subtask.
    expect(
      projectBlockCrossing(graph, { id: 2, target: 1, placement: "before" }, 10),
    ).toBeNull();
    expect(
      projectBlockCrossing(
        graph,
        { id: 2, target: 1, placement: "lastChild" },
        10,
      ),
    ).toBeNull();
    // Both outside it.
    expect(
      projectBlockCrossing(
        graph,
        { id: 4, target: 3, placement: "lastChild" },
        10,
      ),
    ).toBeNull();
  });

  it("a move that cannot be made does not cross", () => {
    const graph = snapshot(
      task(1, { block: 10, position: 1 }),
      task(3, { parent: 1, set: 10, position: 100 }),
    );

    // Onto a task below itself.
    expect(
      projectBlockCrossing(
        graph,
        { id: 1, target: 3, placement: "lastChild" },
        10,
      ),
    ).toBeNull();
  });
});
