import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createMoveToQuadrant } from "./move-to-quadrant";

describe("move to quadrant", () => {
  it("raises both values to 5 moving from not important, not urgent to important and urgent, in one write", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 10, status: "todo", importance: 2, urgency: 3 });
    const moveToQuadrant = createMoveToQuadrant({ repository });

    await moveToQuadrant(10, "importantUrgent");

    expect(await repository.getTask(10)).toMatchObject({
      status: "todo",
      importance: 5,
      urgency: 5,
    });
    expect(repository.writeCount()).toBe(1);
  });

  it.each([
    ["importantNotUrgent", { importance: 5, urgency: 3 }],
    ["urgentNotImportant", { importance: 2, urgency: 5 }],
    ["notImportantNotUrgent", { importance: 2, urgency: 3 }],
  ] as const)(
    "from not important, not urgent (2, 3) to %s writes %o",
    async (target, ratings) => {
      const repository = createInMemoryTaskRepository();
      repository.addTask({ id: 11, importance: 2, urgency: 3 });
      const moveToQuadrant = createMoveToQuadrant({ repository });

      await moveToQuadrant(11, target);

      expect(await repository.getTask(11)).toMatchObject(ratings);
    },
  );

  it.each([
    ["importantNotUrgent", { importance: 7, urgency: 4 }],
    ["urgentNotImportant", { importance: 4, urgency: 6 }],
    ["notImportantNotUrgent", { importance: 4, urgency: 4 }],
  ] as const)(
    "from important and urgent (7, 6) to %s lowers to 4 only the value that crosses: %o",
    async (target, ratings) => {
      const repository = createInMemoryTaskRepository();
      repository.addTask({ id: 12, importance: 7, urgency: 6 });
      const moveToQuadrant = createMoveToQuadrant({ repository });

      await moveToQuadrant(12, target);

      expect(await repository.getTask(12)).toMatchObject(ratings);
      expect(repository.writeCount()).toBe(1);
    },
  );

  it("between the two diagonal quadrants rewrites both, raising one and lowering the other", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 13, importance: 6, urgency: 1 });
    const moveToQuadrant = createMoveToQuadrant({ repository });

    await moveToQuadrant(13, "urgentNotImportant");

    expect(await repository.getTask(13)).toMatchObject({
      importance: 4,
      urgency: 5,
    });
    expect(repository.writeCount()).toBe(1);
  });

  it.each([
    [7, 5, "importantUrgent"],
    [6, 1, "importantNotUrgent"],
    [1, 5, "urgentNotImportant"],
    [3, 4, "notImportantNotUrgent"],
  ] as const)(
    "importance %s and urgency %s moved to their own %s write nothing",
    async (importance, urgency, target) => {
      const repository = createInMemoryTaskRepository();
      repository.addTask({ id: 14, importance, urgency });
      const moveToQuadrant = createMoveToQuadrant({ repository });

      await moveToQuadrant(14, target);

      expect(await repository.getTask(14)).toMatchObject({
        importance,
        urgency,
      });
      expect(repository.writeCount()).toBe(0);
    },
  );

  it("judges an importance or urgency outside 1–7 as 4", async () => {
    const repository = createInMemoryTaskRepository();
    // What the notes hold, unread: values a hand edit can leave (task.ts).
    repository.addTask({
      id: 15,
      importance: 9 as never,
      urgency: 0 as never,
    });
    const moveToQuadrant = createMoveToQuadrant({ repository });

    await moveToQuadrant(15, "notImportantNotUrgent");
    expect(repository.writeCount()).toBe(0);

    await moveToQuadrant(15, "importantNotUrgent");
    expect(await repository.getTask(15)).toMatchObject({
      importance: 5,
      urgency: 0,
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("throws a failed write as it is, for ui to report", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 16, importance: 2, urgency: 2 });
    repository.failWrites(new Error("disk full"));
    const moveToQuadrant = createMoveToQuadrant({ repository });

    await expect(moveToQuadrant(16, "importantUrgent")).rejects.toThrow(
      "disk full",
    );
  });
});
