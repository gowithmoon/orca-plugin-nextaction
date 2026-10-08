import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createChangeStatus } from "./change-status";

describe("change status", () => {
  it("writes the chosen status", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 20, status: "todo" });
    const changeStatus = createChangeStatus({ repository });

    expect(await changeStatus(20, "doing")).toEqual({ kind: "changed" });
    expect((await repository.getTask(20))?.status).toBe("doing");
    expect(repository.writeCount()).toBe(1);
  });

  it("writes nothing when the task already is in the chosen status", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 21, status: "waiting" });
    const changeStatus = createChangeStatus({ repository });

    expect(await changeStatus(21, "waiting")).toEqual({ kind: "unchanged" });
    expect(repository.writeCount()).toBe(0);
  });

  it("treats a task with an empty or unknown status as inbox", async () => {
    const repository = createInMemoryTaskRepository();
    // How the codec reads a status the notes do not hold as an option.
    repository.addTask({
      id: 22,
      status: "inbox",
      anomalies: [{ property: "status", value: "Blocked" }],
    });
    const changeStatus = createChangeStatus({ repository });

    expect(await changeStatus(22, "inbox")).toEqual({ kind: "unchanged" });
    expect(repository.writeCount()).toBe(0);
  });

  it("writes the chosen status to a task with an unknown status", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 23,
      status: "inbox",
      anomalies: [{ property: "status", value: null }],
    });
    const changeStatus = createChangeStatus({ repository });

    expect(await changeStatus(23, "todo")).toEqual({ kind: "changed" });
    expect((await repository.getTask(23))?.status).toBe("todo");
  });

  it("throws when the write fails (e.g. the status property is invalidated), changing nothing", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 24, status: "doing" });
    const failure = new Error("the status property is invalidated");
    repository.failWrites(failure);
    const changeStatus = createChangeStatus({ repository });

    await expect(changeStatus(24, "done")).rejects.toBe(failure);
    expect((await repository.getTask(24))?.status).toBe("doing");
  });
});
