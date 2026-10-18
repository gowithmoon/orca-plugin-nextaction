import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import type { OutlineBlock } from "../ports/task-repository";
import { createCreateExtractedTasks } from "./create-extracted-tasks";

function setup() {
  const repository = createInMemoryTaskRepository();
  const clock = createFixedClock("2026-10-18T09:00:00+08:00");
  const createExtractedTasks = createCreateExtractedTasks({
    repository,
    clock,
  });
  return { repository, clock, createExtractedTasks };
}

/** A block's outline as nested texts: where every block is, in note order. */
function shape(block: OutlineBlock | null): unknown {
  if (!block) return null;
  return block.children.length === 0
    ? block.text
    : { [block.text]: block.children.map(shape) };
}

/** Every task in note order, with its status and dates. */
async function tasksInOrder(
  repository: ReturnType<typeof createInMemoryTaskRepository>,
) {
  const { tasks } = await repository.readTaskGraph();
  return [...tasks]
    .sort((a, b) => a.position - b.position)
    .map((item) => ({
      text: item.task.text,
      status: item.task.status,
      start: item.task.start,
      due: item.task.due,
    }));
}

const report = {
  title: "Send the report",
  start: { year: 2026, month: 10, day: 20 },
  due: { year: 2026, month: 10, day: 23 },
};
const call = { title: "Call Wang", start: null, due: null };

/** Meeting notes with two selected blocks, the second with a child. */
function addMeeting(
  repository: ReturnType<typeof createInMemoryTaskRepository>,
) {
  repository.addBlock(1, { text: "Meeting notes" });
  repository.addBlock(2, { text: "Wang sends the quote", parentId: 1 });
  repository.addBlock(3, { text: "Report by Friday", parentId: 1 });
  repository.addBlock(4, { text: "Below it", parentId: 3 });
  repository.addBlock(5, { text: "Later note", parentId: 1 });
}

describe("create the extracted tasks: below the selection", () => {
  it("creates them as inbox tasks right after the last selected block, at its level, in the draft's order, with their dates, in one write", async () => {
    const { repository, createExtractedTasks } = setup();
    addMeeting(repository);

    const result = await createExtractedTasks([2, 3], "below", [call, report]);

    expect(result).toEqual({ kind: "created", count: 2 });
    expect(shape(await repository.readOutline(1))).toEqual({
      "Meeting notes": [
        "Wang sends the quote",
        { "Report by Friday": ["Below it"] },
        "Call Wang",
        "Send the report",
        "Later note",
      ],
    });
    expect(await tasksInOrder(repository)).toEqual([
      { text: "Call Wang", status: "inbox", start: null, due: null },
      {
        text: "Send the report",
        status: "inbox",
        start: report.start,
        due: report.due,
      },
    ]);
    expect(repository.writeCount()).toBe(1);
  });
});

describe("create the extracted tasks: names", () => {
  it("trims the names and skips the blank ones", async () => {
    const { repository, createExtractedTasks } = setup();
    addMeeting(repository);

    const result = await createExtractedTasks([3], "below", [
      { ...call, title: "  Call Wang " },
      { ...call, title: "   " },
      { ...report, title: "" },
    ]);

    expect(result).toEqual({ kind: "created", count: 1 });
    expect((await tasksInOrder(repository)).map((t) => t.text)).toEqual([
      "Call Wang",
    ]);
  });

  it("writes nothing when every name is blank", async () => {
    const { repository, createExtractedTasks } = setup();
    addMeeting(repository);

    const result = await createExtractedTasks([3], "journal", [
      { ...call, title: " " },
    ]);

    expect(result).toEqual({ kind: "empty" });
    expect(repository.writeCount()).toBe(0);
  });
});

describe("create the extracted tasks: as children", () => {
  it("creates them after the last selected block's existing children, in the draft's order", async () => {
    const { repository, createExtractedTasks } = setup();
    addMeeting(repository);

    await createExtractedTasks([2, 3], "children", [call, report]);

    expect(shape(await repository.readOutline(1))).toEqual({
      "Meeting notes": [
        "Wang sends the quote",
        {
          "Report by Friday": ["Below it", "Call Wang", "Send the report"],
        },
        "Later note",
      ],
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("makes them subtasks when the last selected block is a task", async () => {
    const { repository, createExtractedTasks } = setup();
    repository.addTask({ id: 1, text: "Prepare the move" });

    await createExtractedTasks([1], "children", [call]);

    const { tasks } = await repository.readTaskGraph();
    const created = tasks.find((item) => item.task.text === "Call Wang");
    expect(created?.parentId).toBe(1);
  });
});

describe("create the extracted tasks: in today's journal", () => {
  it("creates them at the end of the journal of the calendar day, not the logical day", async () => {
    const { repository, clock, createExtractedTasks } = setup();
    addMeeting(repository);
    // Before the default day boundary (05:00): the logical day is still the
    // 17th, but the journal is the 18th's (ADR 0005).
    clock.set("2026-10-18T03:00:00+08:00");

    await createExtractedTasks([2, 3], "journal", [call, report]);

    const { tasks } = await repository.readTaskGraph();
    const created = [...tasks]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        text: item.task.text,
        journal: repository.journalOf(item.task.id),
      }));
    const day18 = { year: 2026, month: 10, day: 18 };
    expect(created).toEqual([
      { text: "Call Wang", journal: day18 },
      { text: "Send the report", journal: day18 },
    ]);
    expect(repository.writeCount()).toBe(1);
  });
});
