import { describe, expect, it } from "vitest";
import { createAllTasksFilterStore } from "./all-tasks-filter-store";

describe("all tasks filter store", () => {
  it("showing only one status chooses just that status and clears the other filters and the search", () => {
    const store = createAllTasksFilterStore();
    store.set({
      filter: {
        statuses: ["todo", "waiting"],
        contexts: { values: ["home"], none: true },
        tags: { values: ["errand"], none: false },
        importance: [7],
        urgency: [1],
      },
      search: "bank",
    });

    store.showOnlyStatus("waiting");

    expect(store.current()).toEqual({
      filter: {
        statuses: ["waiting"],
        contexts: { values: [], none: false },
        tags: { values: [], none: false },
        importance: [],
        urgency: [],
      },
      search: "",
    });
  });
});
