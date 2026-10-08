import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createConvertToTask } from "./convert-to-task";

describe("convert to task", () => {
  it("converts a block into an inbox task with default values", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addBlock(10, { text: "Call the plumber" });
    const convertToTask = createConvertToTask({ repository });

    expect(await convertToTask(10)).toEqual({ kind: "converted", id: 10 });
    expect(await repository.getTask(10)).toEqual({
      id: 10,
      text: "Call the plumber",
      status: "inbox",
      importance: 4,
      effort: 4,
      start: null,
      due: null,
      contexts: [],
      labels: [],
      note: null,
      anomalies: [],
    });
  });

  it("leaves a task as it is and writes nothing", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 11, status: "done", importance: 6 },
      {
        pluginProperties: {
          completions: { kind: "present", data: { entries: [] } },
        },
      },
    );
    const convertToTask = createConvertToTask({ repository });
    const before = await repository.getTask(11);

    expect(await convertToTask(11)).toEqual({ kind: "already-task", id: 11 });
    expect(repository.writeCount()).toBe(0);
    expect(await repository.getTask(11)).toEqual(before);
    expect(await repository.readPluginBlockProperty(11, "completions")).toEqual(
      { kind: "present", data: { entries: [] } },
    );
  });

  it("refuses a block that cannot be converted, giving the reason", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addBlock(12, { notConvertible: "journal-or-orphan" });
    repository.addBlock(13, { notConvertible: "task-tag" });
    const convertToTask = createConvertToTask({ repository });

    expect(await convertToTask(12)).toEqual({
      kind: "not-convertible",
      reason: "journal-or-orphan",
    });
    expect(await convertToTask(13)).toEqual({
      kind: "not-convertible",
      reason: "task-tag",
    });
    expect(repository.writeCount()).toBe(0);
    expect(await repository.getTask(12)).toBeNull();
  });

  it("clears the plugin block properties left from an earlier task", async () => {
    const repository = createInMemoryTaskRepository();
    // The task tag was removed in Orca; the completion history stayed.
    repository.addBlock(14, {
      pluginProperties: {
        completions: { kind: "present", data: { entries: [{ at: "x" }] } },
        damaged: { kind: "unreadable", reason: "unknown version 9" },
      },
    });
    const convertToTask = createConvertToTask({ repository });

    await convertToTask(14);

    expect(await repository.readPluginBlockProperty(14, "completions")).toEqual(
      { kind: "absent" },
    );
    expect(await repository.readPluginBlockProperty(14, "damaged")).toEqual({
      kind: "absent",
    });
  });

  it("throws when the write fails, leaving the block as it was", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addBlock(15, {
      pluginProperties: {
        completions: { kind: "present", data: { entries: [] } },
      },
    });
    const failure = new Error("Orca is gone");
    repository.failWrites(failure);
    const convertToTask = createConvertToTask({ repository });

    await expect(convertToTask(15)).rejects.toBe(failure);
    expect(await repository.getTask(15)).toBeNull();
    repository.failWrites(undefined);
    // Still a non-task holding the old property, so converting clears it.
    expect(await convertToTask(15)).toEqual({ kind: "converted", id: 15 });
  });
});
