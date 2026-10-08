import { describe, expect, it } from "vitest";
import type { Task } from "../../domain/task/task";
import { createTaskMenuItems, type TaskMenuItem } from "./menu-items";

const task = { id: 1, status: "todo" } as Task;

const item = (
  id: string,
  group: number,
  order: number,
  extra: Partial<TaskMenuItem> = {},
): TaskMenuItem => ({
  id,
  group,
  order,
  label: () => id,
  run: async () => {},
  ...extra,
});

const ids = (groups: readonly (readonly TaskMenuItem[])[]) =>
  groups.map((group) => group.map((entry) => entry.id));

describe("task menu items", () => {
  it("arranges items by group, then by order within a group", () => {
    const items = createTaskMenuItems();
    items.register(item("drop", 90, 0));
    items.register(item("done", 10, 50));
    items.register(item("inbox", 10, 0));
    items.register(item("panel", 20, 0));

    expect(ids(items.arrange(task))).toEqual([
      ["inbox", "done"],
      ["panel"],
      ["drop"],
    ]);
  });

  it("leaves out items hidden for the task, and groups left empty", () => {
    const items = createTaskMenuItems();
    items.register(item("inbox", 10, 0));
    items.register(
      item("only-done", 20, 0, { isShownFor: (t) => t.status === "done" }),
    );
    items.register(item("drop", 90, 0, { isShownFor: () => true }));

    expect(ids(items.arrange(task))).toEqual([["inbox"], ["drop"]]);
  });

  it("refuses a second item with the same identifier", () => {
    const items = createTaskMenuItems();
    items.register(item("drop", 90, 0));

    expect(() => items.register(item("drop", 10, 0))).toThrow(/drop/);
  });
});
