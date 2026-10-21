import { describe, expect, it } from "vitest";
import { createFixedStartPreviewDays } from "../../../tests/fixed-start-preview-days";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { readTaskPanelPart } from "../../../tests/task-panel-relations";

const weekly = {
  kind: "rule",
  rule: { period: { interval: 1, unit: "week" }, basis: "schedule" },
} as const;

function setup() {
  const repository = createInMemoryTaskRepository();
  const startPreviewDays = createFixedStartPreviewDays();
  const readNotNextActionReasons = readTaskPanelPart(
    repository,
    "reasons",
    startPreviewDays,
  );
  return { repository, startPreviewDays, readNotNextActionReasons };
}

describe("read not-next-action reasons", () => {
  it("says a done ancestor task keeps it out, naming the nearest one", async () => {
    const { repository, readNotNextActionReasons } = setup();
    repository.addTask({ id: 1, text: "Move house", status: "done" });
    repository.addTask(
      { id: 2, text: "Pack", status: "done" },
      { parentId: 1 },
    );
    repository.addTask(
      { id: 3, text: "Pack the books", status: "todo" },
      { parentId: 2 },
    );

    const read = await readNotNextActionReasons(3);

    expect(read.reasons).toEqual([
      { kind: "doneAncestor", source: 2, waitingFor: [] },
    ]);
    expect(read.tasks.get(2)).toEqual({
      id: 2,
      text: "Pack",
      recurring: false,
    });
  });

  it("says it is in a parked subtree, naming the nearest waiting or someday ancestor task", async () => {
    const { repository, readNotNextActionReasons } = setup();
    repository.addTask({ id: 1, text: "Learn piano", status: "someday" });
    repository.addTask(
      { id: 2, text: "Find a teacher", status: "waiting" },
      { parentId: 1 },
    );
    repository.addTask(
      { id: 3, text: "Book a lesson", status: "doing" },
      { parentId: 2 },
    );

    const read = await readNotNextActionReasons(3);

    expect(read.reasons).toEqual([
      { kind: "parked", source: 2, waitingFor: [] },
    ]);
    expect(read.tasks.get(2)).toEqual({
      id: 2,
      text: "Find a teacher",
      recurring: false,
    });
  });

  it("says it has not reached its start, naming the ancestor task whose start it is and the day", async () => {
    const { repository, readNotNextActionReasons } = setup();
    // Today is the logical day 2026-10-09.
    repository.addTask({
      id: 1,
      text: "Trip",
      status: "todo",
      start: { year: 2026, month: 10, day: 20 },
    });
    repository.addTask(
      {
        id: 2,
        text: "Book the hotel",
        status: "todo",
        start: { year: 2026, month: 10, day: 12 },
      },
      { parentId: 1 },
    );

    const read = await readNotNextActionReasons(2);

    expect(read.reasons).toEqual([
      {
        kind: "notStarted",
        source: 1,
        waitingFor: [],
        startsOn: { year: 2026, month: 10, day: 20 },
      },
    ]);
    expect(read.tasks.get(1)).toEqual({
      id: 1,
      text: "Trip",
      recurring: false,
    });
  });

  it("does not say it has not reached its start when the start preview days already let it in", async () => {
    const { repository, startPreviewDays, readNotNextActionReasons } = setup();
    // Today is the logical day 2026-10-09; the start is 3 days ahead.
    repository.addTask({
      id: 1,
      status: "todo",
      start: { year: 2026, month: 10, day: 12 },
    });

    startPreviewDays.set(2);
    expect((await readNotNextActionReasons(1)).reasons).toEqual([
      {
        kind: "notStarted",
        source: 1,
        waitingFor: [],
        startsOn: { year: 2026, month: 10, day: 12 },
      },
    ]);
    startPreviewDays.set(3);
    expect((await readNotNextActionReasons(1)).reasons).toEqual([]);
  });

  it("lists every reason at once, done ancestor first and start last, nearest first within a kind", async () => {
    const { repository, readNotNextActionReasons } = setup();
    // 1 (done) { 2 (waiting, sequential, depends on 5) { 3, 4 { 6 } } }, 5.
    // 4 depends on 5 too and starts on 12/01; today is 2026-10-09.
    repository.addTask({ id: 1, text: "Move house", status: "done" });
    repository.addTask(
      {
        id: 2,
        text: "Pack",
        status: "waiting",
        sequential: true,
        dependencies: [5],
      },
      { parentId: 1 },
    );
    repository.addTask(
      { id: 3, text: "Buy boxes", status: "todo" },
      { parentId: 2 },
    );
    repository.addTask(
      {
        id: 4,
        text: "Pack the books",
        status: "todo",
        dependencies: [5],
        start: { year: 2026, month: 12, day: 1 },
      },
      { parentId: 2 },
    );
    repository.addTask(
      { id: 6, text: "Sort the books", status: "todo" },
      { parentId: 4 },
    );
    repository.addTask({ id: 5, text: "Rent a van", status: "todo" });

    const read = await readNotNextActionReasons(4);

    expect(read.reasons).toEqual([
      { kind: "doneAncestor", source: 1, waitingFor: [] },
      { kind: "parked", source: 2, waitingFor: [] },
      { kind: "subtasks", source: 4, waitingFor: [6] },
      { kind: "dependencies", source: 4, waitingFor: [5], mode: "all" },
      { kind: "dependencies", source: 2, waitingFor: [5], mode: "all" },
      { kind: "sequential", source: 4, waitingFor: [3] },
      {
        kind: "notStarted",
        source: 4,
        waitingFor: [],
        startsOn: { year: 2026, month: 12, day: 1 },
      },
    ]);
    expect([...read.tasks.keys()].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("returns no reasons for a task neither to do nor in progress, whatever holds it", async () => {
    for (const status of ["inbox", "waiting", "someday", "done"] as const) {
      const { repository, readNotNextActionReasons } = setup();
      repository.addTask({ id: 1, status: "done" });
      repository.addTask(
        {
          id: 2,
          status,
          dependencies: [3],
          start: { year: 2026, month: 12, day: 1 },
        },
        { parentId: 1 },
      );
      repository.addTask({ id: 3, status: "todo" }, { parentId: 2 });

      const read = await readNotNextActionReasons(2);

      expect(read.reasons).toEqual([]);
      expect(read.tasks.size).toBe(0);
    }
  });

  it("returns the reasons with the text of every task they name", async () => {
    const { repository, readNotNextActionReasons } = setup();
    repository.addTask({ id: 1, text: "Write the paper", status: "todo" });
    repository.addTask(
      { id: 2, text: "Write the introduction", status: "todo" },
      { parentId: 1 },
    );
    repository.addTask(
      { id: 3, text: "Collect the data", status: "waiting" },
      { parentId: 1 },
    );

    const read = await readNotNextActionReasons(1);

    expect(read.reasons).toEqual([
      { kind: "subtasks", source: 1, waitingFor: [2, 3] },
    ]);
    expect(read.tasks.get(1)).toEqual({
      id: 1,
      text: "Write the paper",
      recurring: false,
    });
    expect(read.tasks.get(2)).toEqual({
      id: 2,
      text: "Write the introduction",
      recurring: false,
    });
    expect(read.tasks.get(3)).toEqual({
      id: 3,
      text: "Collect the data",
      recurring: false,
    });
  });

  it("returns a dependency delay with its release day and the text of the task it counts from", async () => {
    const { repository, readNotNextActionReasons } = setup();
    // Today is the logical day 2026-10-09.
    repository.addTask({
      id: 1,
      text: "Hang the lamp",
      status: "todo",
      dependencies: [2],
      dependencyDelay: 3,
    });
    repository.addTask(
      { id: 2, text: "Paint the wall", status: "done" },
      {
        completionHistory: {
          kind: "readable",
          history: [
            {
              at: new Date("2026-10-08T12:00:00+08:00"),
              day: { year: 2026, month: 10, day: 8 },
            },
          ],
        },
      },
    );

    const read = await readNotNextActionReasons(1);

    expect(read.reasons).toEqual([
      {
        kind: "dependencyDelay",
        source: 1,
        waitingFor: [],
        countedFrom: 2,
        releasedOn: { year: 2026, month: 10, day: 11 },
      },
    ]);
    expect(read.tasks.get(1)).toEqual({
      id: 1,
      text: "Hang the lamp",
      recurring: false,
    });
    expect(read.tasks.get(2)).toEqual({
      id: 2,
      text: "Paint the wall",
      recurring: false,
    });
  });

  it("counts a dependency delay from the last completion, not a later skip (#91)", async () => {
    const { repository, readNotNextActionReasons } = setup();
    // Today is the logical day 2026-10-09.
    repository.addTask({
      id: 1,
      status: "todo",
      dependencies: [2],
      dependencyDelay: 3,
    });
    repository.addTask(
      { id: 2, status: "done" },
      {
        completionHistory: {
          kind: "readable",
          history: [
            {
              at: new Date("2026-10-07T12:00:00+08:00"),
              day: { year: 2026, month: 10, day: 7 },
            },
            {
              at: new Date("2026-10-08T12:00:00+08:00"),
              day: { year: 2026, month: 10, day: 8 },
              kind: "skip",
            },
          ],
        },
      },
    );

    const read = await readNotNextActionReasons(1);

    expect(read.reasons).toEqual([
      {
        kind: "dependencyDelay",
        source: 1,
        waitingFor: [],
        countedFrom: 2,
        releasedOn: { year: 2026, month: 10, day: 10 },
      },
    ]);
  });

  it("still waits for a recurring dependency that was skipped (#91)", async () => {
    const { repository, readNotNextActionReasons } = setup();
    repository.addTask({ id: 1, status: "todo", dependencies: [2] });
    repository.addTask(
      { id: 2, status: "todo", recurrence: weekly },
      {
        completionHistory: {
          kind: "readable",
          history: [
            {
              at: new Date("2026-10-09T09:00:00+08:00"),
              day: { year: 2026, month: 10, day: 9 },
              kind: "skip",
            },
          ],
        },
      },
    );

    const read = await readNotNextActionReasons(1);

    expect(read.reasons).toEqual([
      { kind: "dependencies", source: 1, waitingFor: [2], mode: "all" },
    ]);
  });

  it("returns no reasons for a task nothing blocks", async () => {
    const { repository, readNotNextActionReasons } = setup();
    repository.addTask({ id: 1 });
    repository.addTask({ id: 2, status: "done" }, { parentId: 1 });

    const read = await readNotNextActionReasons(1);

    expect(read.reasons).toEqual([]);
    expect(read.tasks.size).toBe(0);
  });

  it("returns the task's own dependencies in order, marking the stale ones", async () => {
    const { repository, readNotNextActionReasons } = setup();
    // 7 was dropped: a block, but no longer a task. 8 is gone altogether.
    repository.addTask({ id: 1, dependencies: [2, 7, 3, 8] });
    repository.addTask({ id: 2, text: "Collect the data" });
    repository.addTask({ id: 3, text: "Ask Wang", status: "done" });
    repository.addBlock(7, { text: "Dropped" });

    const read = await readNotNextActionReasons(1);

    expect(read.dependencies).toEqual([
      { id: 2, text: "Collect the data", stale: false, recurring: false },
      { id: 7, text: null, stale: true, recurring: false },
      { id: 3, text: "Ask Wang", stale: false, recurring: false },
      { id: 8, text: null, stale: true, recurring: false },
    ]);
  });

  it("writes nothing when reading, stale dependencies included (ADR 0016)", async () => {
    const { repository, readNotNextActionReasons } = setup();
    repository.addTask({ id: 1, dependencies: [7, 2] });
    repository.addTask({ id: 2 });

    await readNotNextActionReasons(1);

    expect(repository.writeCount()).toBe(0);
    expect((await repository.getTask(1))?.dependencies).toEqual([7, 2]);
  });

  it("returns no reasons for a block that is not a task", async () => {
    const { repository, readNotNextActionReasons } = setup();
    repository.addBlock(1);

    expect((await readNotNextActionReasons(1)).reasons).toEqual([]);
  });

  it("says which of the task's own dependencies are recurring tasks (ADR 0021)", async () => {
    const { repository, readNotNextActionReasons } = setup();
    repository.addTask({ id: 1, dependencies: [2, 3] });
    repository.addTask({ id: 2, text: "Weekly review", recurrence: weekly });
    repository.addTask({ id: 3, text: "Ask Wang" });

    const read = await readNotNextActionReasons(1);

    expect(read.dependencies.map((d) => [d.id, d.recurring])).toEqual([
      [2, true],
      [3, false],
    ]);
  });

  it("says a recurring earlier sibling under a sequential parent is one (ADR 0021)", async () => {
    const { repository, readNotNextActionReasons } = setup();
    repository.addTask({ id: 1, text: "Run the shop", sequential: true });
    repository.addTask(
      { id: 2, text: "Weekly stocktake", status: "todo", recurrence: weekly },
      { parentId: 1 },
    );
    repository.addTask(
      { id: 3, text: "Close the shop", status: "todo" },
      { parentId: 1 },
    );

    const read = await readNotNextActionReasons(3);

    expect(read.reasons).toEqual([
      { kind: "sequential", source: 3, waitingFor: [2] },
    ]);
    expect(read.tasks.get(2)?.recurring).toBe(true);
    expect(read.tasks.get(3)?.recurring).toBe(false);
  });
});

describe("read not-next-action reasons with projects", () => {
  it("says the project it belongs to is not active, with the project status", async () => {
    const { repository, readNotNextActionReasons } = setup();
    repository.addProject({ id: 1, text: "Move house", status: "paused" });
    repository.addTask(
      { id: 2, text: "Pack", status: "todo" },
      { parentId: 1 },
    );

    const read = await readNotNextActionReasons(2);

    expect(read.reasons).toEqual([
      {
        kind: "projectNotActive",
        source: 1,
        waitingFor: [],
        status: "paused",
      },
    ]);
    expect(read.projects.get(1)).toEqual({ id: 1, text: "Move house" });
  });

  it("says the project it belongs to has not reached its start, with the day", async () => {
    const { repository, readNotNextActionReasons } = setup();
    // Today is the logical day 2026-10-09.
    repository.addProject({
      id: 1,
      text: "Year-end trip",
      status: "active",
      start: { year: 2026, month: 10, day: 20 },
    });
    repository.addTask(
      {
        id: 2,
        text: "Book the hotel",
        status: "todo",
        start: { year: 2026, month: 10, day: 12 },
      },
      { parentId: 1 },
    );

    const read = await readNotNextActionReasons(2);

    expect(read.reasons).toEqual([
      {
        kind: "projectNotStarted",
        source: 1,
        waitingFor: [],
        startsOn: { year: 2026, month: 10, day: 20 },
      },
    ]);
    expect(read.projects.get(1)).toEqual({ id: 1, text: "Year-end trip" });
  });

  it("lists the project reasons after the others, and a later start of its own instead of the project's", async () => {
    const { repository, readNotNextActionReasons } = setup();
    repository.addProject({
      id: 1,
      text: "Move house",
      status: "someday",
      start: { year: 2026, month: 10, day: 12 },
    });
    repository.addTask(
      { id: 2, text: "Pack", status: "done" },
      { parentId: 1 },
    );
    repository.addTask(
      {
        id: 3,
        text: "Pack the books",
        status: "todo",
        start: { year: 2026, month: 10, day: 15 },
      },
      { parentId: 2 },
    );

    const read = await readNotNextActionReasons(3);

    expect(read.reasons).toEqual([
      { kind: "doneAncestor", source: 2, waitingFor: [] },
      {
        kind: "notStarted",
        source: 3,
        waitingFor: [],
        startsOn: { year: 2026, month: 10, day: 15 },
      },
      {
        kind: "projectNotActive",
        source: 1,
        waitingFor: [],
        status: "someday",
      },
    ]);
    expect([...read.tasks.keys()].sort()).toEqual([2, 3]);
    expect([...read.projects.keys()]).toEqual([1]);
  });

  it("gives no project reason for a task that belongs to no project", async () => {
    const { repository, readNotNextActionReasons } = setup();
    repository.addProject({ id: 1, text: "Move house", status: "paused" });
    repository.addTask({ id: 2, text: "Pack", status: "todo" });
    repository.addTask({ id: 3, status: "todo" }, { parentId: 2 });

    const read = await readNotNextActionReasons(2);

    expect(read.reasons).toEqual([
      { kind: "subtasks", source: 2, waitingFor: [3] },
    ]);
    expect(read.projects.size).toBe(0);
  });

  it("names the set project of a task, or of its parent task, as the one not active", async () => {
    const { repository, readNotNextActionReasons } = setup();
    repository.addProject({ id: 1, text: "Move house", status: "paused" });
    repository.addTask(
      { id: 2, text: "Pack", status: "todo" },
      { project: [1] },
    );
    repository.addTask(
      { id: 3, text: "Boxes", status: "todo" },
      { parentId: 2 },
    );

    const read = await readNotNextActionReasons(3);

    expect(read.reasons).toEqual([
      {
        kind: "projectNotActive",
        source: 1,
        waitingFor: [],
        status: "paused",
      },
    ]);
    expect(read.projects.get(1)).toEqual({ id: 1, text: "Move house" });
  });
});
