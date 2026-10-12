import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createInMemoryReminderCheckpoint } from "../../../tests/in-memory-reminder-checkpoint";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createRecordingReminderNotifier } from "../../../tests/recording-reminder-notifier";
import { createCheckReminders } from "./check-reminders";

const at = (local: string) => new Date(`${local}+08:00`);
const list = (...moments: Date[]) =>
  ({ kind: "list", reminders: moments }) as const;

describe("check reminders (GLOSSARY: 提醒, 错过的提醒)", () => {
  it("notifies every reminder after the checkpoint up to now, once", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 1,
      text: "Call the bank",
      status: "waiting",
      reminders: list(at("2026-10-10T09:00:00"), at("2026-10-12T09:00:00")),
    });
    repository.addTask({
      id: 2,
      text: "Send the report",
      status: "todo",
      reminders: list(at("2026-10-11T09:00:00")),
    });
    const clock = createFixedClock(at("2026-10-12T10:00:00"));
    const notifier = createRecordingReminderNotifier();
    const checkReminders = createCheckReminders({
      repository,
      clock,
      checkpoint: createInMemoryReminderCheckpoint(at("2026-10-09T18:00:00")),
      notifier,
    });

    await checkReminders();
    clock.set(at("2026-10-12T10:05:00"));
    await checkReminders();

    expect(notifier.notices).toEqual([
      { taskId: 1, text: "Call the bank" },
      { taskId: 2, text: "Send the report" },
      { taskId: 1, text: "Call the bank" },
    ]);
  });

  it("without a checkpoint, starts from now and catches nothing up", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 1,
      text: "Call the bank",
      status: "todo",
      reminders: list(at("2026-10-11T09:00:00"), at("2026-10-12T10:00:00")),
    });
    const checkpoint = createInMemoryReminderCheckpoint(null);
    const notifier = createRecordingReminderNotifier();
    await createCheckReminders({
      repository,
      clock: createFixedClock(at("2026-10-12T10:00:00")),
      checkpoint,
      notifier,
    })();

    expect(notifier.notices).toEqual([]);
    expect(checkpoint.current()).toEqual(at("2026-10-12T10:00:00"));
  });

  it("writes the checkpoint as now and returns the next wake-up", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 1,
      status: "todo",
      reminders: list(at("2026-10-12T09:30:00"), at("2026-10-15T09:00:00")),
    });
    repository.addTask({
      id: 2,
      status: "done",
      reminders: list(at("2026-10-13T09:00:00")),
    });
    const checkpoint = createInMemoryReminderCheckpoint(
      at("2026-10-12T09:00:00"),
    );
    const checkReminders = createCheckReminders({
      repository,
      clock: createFixedClock(at("2026-10-12T10:00:00")),
      checkpoint,
      notifier: createRecordingReminderNotifier(),
    });

    expect(await checkReminders()).toEqual(at("2026-10-15T09:00:00"));
    expect(checkpoint.current()).toEqual(at("2026-10-12T10:00:00"));
  });

  it("returns none when no reminder is to come", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, status: "todo" });
    const checkReminders = createCheckReminders({
      repository,
      clock: createFixedClock(at("2026-10-12T10:00:00")),
      checkpoint: createInMemoryReminderCheckpoint(at("2026-10-12T09:00:00")),
      notifier: createRecordingReminderNotifier(),
    });

    expect(await checkReminders()).toBeNull();
  });
});
