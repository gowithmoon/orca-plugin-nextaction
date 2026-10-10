import { describe, expect, it } from "vitest";
import type { Task } from "./task";
import { filterChoosesAny, filterLets } from "./task-filter";

const nothing = { values: [], none: false };

function task(set: Partial<Task> = {}): Task {
  return {
    id: 1,
    text: "task",
    status: "todo",
    importance: 4,
    urgency: 4,
    effort: 4,
    start: null,
    due: null,
    contexts: [],
    labels: [],
    note: null,
    sequential: false,
    dependencies: [],
    dependencyMode: "all",
    created: new Date("2026-01-01T00:00:00Z"),
    anomalies: [],
    ...set,
  };
}

describe("filterChoosesAny", () => {
  it("chooses nothing when no dimension is given or every one is empty", () => {
    expect(filterChoosesAny({})).toBe(false);
    expect(
      filterChoosesAny({
        contexts: nothing,
        labels: nothing,
        importance: [],
        urgency: [],
      }),
    ).toBe(false);
  });

  it("chooses something with a value, (None), an importance or an urgency level", () => {
    expect(
      filterChoosesAny({ contexts: { values: ["home"], none: false } }),
    ).toBe(true);
    expect(filterChoosesAny({ labels: { values: [], none: true } })).toBe(true);
    expect(filterChoosesAny({ importance: [7] })).toBe(true);
    expect(filterChoosesAny({ urgency: [1] })).toBe(true);
  });
});

describe("filterLets by urgency", () => {
  it("lets through a task at any one of the chosen levels, and only those", () => {
    const chosen = { urgency: [1, 5, 7] as const };
    const lets = [1, 2, 3, 4, 5, 6, 7].map((urgency) =>
      filterLets(chosen, task({ urgency: urgency as Task["urgency"] })),
    );
    expect(lets).toEqual([true, false, false, false, true, false, true]);
  });

  it("lets every task through with no urgency chosen", () => {
    expect(filterLets({ urgency: [] }, task({ urgency: 7 }))).toBe(true);
    expect(filterLets({}, task({ urgency: 1 }))).toBe(true);
  });

  it("needs contexts, labels and importance to let the task through as well", () => {
    const filter = {
      contexts: { values: ["office"], none: false },
      labels: { values: ["q4"], none: false },
      importance: [6] as const,
      urgency: [6] as const,
    };
    const fits = {
      contexts: ["office"],
      labels: ["q4"],
      importance: 6,
      urgency: 6,
    } as const;
    expect(filterLets(filter, task(fits))).toBe(true);
    expect(filterLets(filter, task({ ...fits, urgency: 5 }))).toBe(false);
    expect(filterLets(filter, task({ ...fits, contexts: ["home"] }))).toBe(
      false,
    );
    expect(filterLets(filter, task({ ...fits, labels: [] }))).toBe(false);
    expect(filterLets(filter, task({ ...fits, importance: 7 }))).toBe(false);
  });
});
