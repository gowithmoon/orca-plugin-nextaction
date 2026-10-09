import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import {
  TaskFeaturesPausedError,
  type TaskRepository,
} from "../ports/task-repository";
import { createReadInbox } from "./read-inbox";

describe("read inbox", () => {
  it("returns only the tasks in the inbox", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, status: "inbox" });
    repository.addTask({ id: 2, status: "todo" });
    repository.addTask({ id: 3, status: "done" });
    repository.addTask({ id: 4, status: "inbox" });
    repository.addBlock(5);
    const readInbox = createReadInbox({ repository });

    expect((await readInbox()).map((task) => task.id)).toEqual([1, 4]);
  });

  it("also returns tasks whose status is empty or unknown in the notes", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 6,
      status: "inbox",
      anomalies: [{ property: "status", value: null }],
    });
    repository.addTask({
      id: 7,
      status: "inbox",
      anomalies: [{ property: "status", value: "my own option" }],
    });
    const readInbox = createReadInbox({ repository });

    expect((await readInbox()).map((task) => task.id)).toEqual([6, 7]);
  });

  it("puts the earliest created first, and the lower ID first when created together", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 20, created: new Date("2026-10-07T09:00:00Z") });
    repository.addTask({ id: 31, created: new Date("2026-10-01T09:00:00Z") });
    repository.addTask({ id: 12, created: new Date("2026-10-07T09:00:00Z") });
    repository.addTask({ id: 8, created: new Date("2026-10-09T09:00:00Z") });
    const readInbox = createReadInbox({ repository });

    expect((await readInbox()).map((task) => task.id)).toEqual([31, 12, 20, 8]);
  });

  it("keeps the task given as `keep` after it left the inbox, in its capture-order place", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 40,
      status: "inbox",
      created: new Date("2026-10-01T09:00:00Z"),
    });
    repository.addTask({
      id: 41,
      status: "inbox",
      created: new Date("2026-10-03T09:00:00Z"),
    });
    repository.addTask({
      id: 42,
      status: "todo",
      created: new Date("2026-10-02T09:00:00Z"),
    });
    repository.addTask({
      id: 43,
      status: "done",
      created: new Date("2026-10-02T10:00:00Z"),
    });
    const readInbox = createReadInbox({ repository });

    expect((await readInbox({ keep: 42 })).map((task) => task.id)).toEqual([
      40, 42, 41,
    ]);
  });

  it("does not list the task given as `keep` once it is no longer a task", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 50, status: "inbox" });
    repository.addTask({ id: 51, status: "todo" });
    await repository.dropTask(51);
    const readInbox = createReadInbox({ repository });

    expect((await readInbox({ keep: 51 })).map((task) => task.id)).toEqual([
      50,
    ]);
  });

  it("returns an empty list when there are no tasks", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addBlock(9);
    const readInbox = createReadInbox({ repository });

    expect(await readInbox()).toEqual([]);
  });

  it("throws the error as it is while task features are paused", async () => {
    const paused = new TaskFeaturesPausedError("the task tag is starting");
    const repository: TaskRepository = {
      ...createInMemoryTaskRepository(),
      queryTasks: () => Promise.reject(paused),
    };
    const readInbox = createReadInbox({ repository });

    await expect(readInbox()).rejects.toBe(paused);
  });
});
