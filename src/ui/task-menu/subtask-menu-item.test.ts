import { describe, expect, it } from "vitest";
import type { Task, TaskStatus } from "../../domain/task/task";
import { createTaskMenuItems } from "./menu-items";
import { registerSubtaskMenuItem } from "./subtask-menu-item";

const shownIds = (status: TaskStatus) => {
  const items = createTaskMenuItems();
  registerSubtaskMenuItem(items, () => {});
  return items
    .arrange({ id: 1, status } as Task)
    .flatMap((group) => group.items.map((item) => item.id));
};

describe("create subtask menu item", () => {
  it.each(["inbox", "todo", "doing", "waiting", "someday"] as const)(
    "shows for a task that is %s",
    (status) => {
      expect(shownIds(status)).toEqual(["createSubtask"]);
    },
  );

  it("does not show for a done task", () => {
    expect(shownIds("done")).toEqual([]);
  });
});
