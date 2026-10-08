import { describe, expect, it } from "vitest";
import type { Task } from "../../domain/task/task";
import {
  createTaskMenuItems,
  type TaskMenuGroup,
  type TaskMenuItem,
} from "./menu-items";

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

const ids = (groups: readonly TaskMenuGroup[]) =>
  groups.map((group) => group.items.map((entry) => entry.id));

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

  it("marks a group registered as a submenu, and only that group", () => {
    const items = createTaskMenuItems();
    items.register(item("inbox", 10, 0));
    items.register(item("drop", 90, 0));
    items.registerSubmenu(10, { label: (t) => `Status: ${t.status}` });

    const [status, drop] = items.arrange(task);
    expect(status?.submenu?.label(task)).toBe("Status: todo");
    expect(drop?.submenu).toBeUndefined();
  });

  it("refuses a second submenu for the same group", () => {
    const items = createTaskMenuItems();
    items.registerSubmenu(10, { label: () => "a" });

    expect(() => items.registerSubmenu(10, { label: () => "b" })).toThrow(/10/);
  });
});
