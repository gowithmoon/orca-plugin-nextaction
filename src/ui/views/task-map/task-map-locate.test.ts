import { describe, expect, it } from "vitest";
import type { TaskMapPlace } from "../../../application/usecases/find-on-task-map";
import type { TaskMapInput } from "../../../application/usecases/read-task-map";
import { chosenFilter, leftTaskMap, showOnTaskMap } from "./task-map-locate";
import { createTaskMapStores } from "./task-map-stores";

const shown: TaskMapInput = {
  projects: [3],
  showDone: true,
  showUnrelated: false,
};

function located(place: Partial<TaskMapPlace> = {}) {
  const stores = createTaskMapStores();
  stores.collapsed.toggle("project:3");
  showOnTaskMap(stores, 7, {
    input: shown,
    project: 3,
    parents: [5, 6],
    ...place,
  });
  return stores;
}

describe("showing a task on the task map", () => {
  it("selects and locates it, expands its boxes for now and relaxes the filter, the collapse state kept", () => {
    const stores = located();

    expect(stores.selected.current()).toBe(7);
    expect(stores.locate.current()).toBe(7);
    expect([...stores.expanded.current()]).toEqual([
      "project:3",
      "task:5",
      "task:6",
    ]);
    expect(stores.filter.current()).toEqual(shown);
    expect([...stores.collapsed.current()]).toEqual(["project:3"]);
  });

  it("puts the filter back on leaving the map, and forgets the boxes expanded", () => {
    const stores = located();

    leftTaskMap(stores);

    expect(stores.filter.current()).toEqual({
      projects: [],
      showDone: false,
      showUnrelated: false,
    });
    expect(stores.expanded.current().size).toBe(0);
  });

  it("keeps a filter changed since", () => {
    const stores = located();
    const chosen = { ...shown, showUnrelated: true };
    stores.filter.set(chosen);

    leftTaskMap(stores);

    expect(stores.filter.current()).toBe(chosen);
  });

  it("puts back the filter from before the first of several, not the one in between", () => {
    const stores = located();
    showOnTaskMap(stores, 8, {
      input: { ...shown, showUnrelated: true },
      project: null,
      parents: [],
    });

    leftTaskMap(stores);

    expect(stores.filter.current()).toEqual({
      projects: [],
      showDone: false,
      showUnrelated: false,
    });
  });

  it("relaxes the next one from the filter chosen, not from the one relaxed", () => {
    const stores = located();

    expect(chosenFilter(stores)).toEqual({
      projects: [],
      showDone: false,
      showUnrelated: false,
    });
    const chosen = { ...shown, showUnrelated: true };
    stores.filter.set(chosen);
    expect(chosenFilter(stores)).toBe(chosen);
  });
});
