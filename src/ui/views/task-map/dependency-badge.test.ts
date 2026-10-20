import { describe, expect, it } from "vitest";
import type { TaskMapDependencyEdge } from "../../../application/usecases/read-task-map";
import type { DependencyMode, TaskId } from "../../../domain/task/task";
import { dependencyBadges } from "./dependency-badge";

/** A node on the map: its task's mode, its delay as read. */
function node(
  id: TaskId,
  input: { dependencyMode?: DependencyMode; dependencyDelay?: number } = {},
) {
  return {
    task: { id, dependencyMode: input.dependencyMode ?? "all" },
    dependencyDelay: input.dependencyDelay ?? 0,
  };
}

/** A plain dependency drawn from `from` to `to`. */
function arrow(from: TaskId, to: TaskId): TaskMapDependencyEdge {
  return { from, to, any: false, conflict: false, cycle: false };
}

describe("task map dependency badges", () => {
  it("gives no badge to a task no dependency arrow comes into, even with a delay (its dependencies stale or off the map)", () => {
    const badges = dependencyBadges(
      [node(1), node(2, { dependencyMode: "any", dependencyDelay: 3 })],
      [],
    );
    expect(badges.size).toBe(0);
  });

  it("gives a dependent in mode all with no delay a quiet badge, shown only on hover", () => {
    const badges = dependencyBadges([node(1), node(2)], [arrow(1, 2)]);
    expect([...badges]).toEqual([[2, { any: false, delay: 0, quiet: true }]]);
  });

  it("shows any, always, when the dependency mode is any", () => {
    const badges = dependencyBadges(
      [node(1), node(2), node(3, { dependencyMode: "any" })],
      [arrow(1, 3), arrow(2, 3)],
    );
    expect(badges.get(3)).toEqual({ any: true, delay: 0, quiet: false });
  });

  it("shows the dependency delay, always, when it is set", () => {
    const badges = dependencyBadges(
      [node(1), node(2, { dependencyDelay: 3 })],
      [arrow(1, 2)],
    );
    expect(badges.get(2)).toEqual({ any: false, delay: 3, quiet: false });
  });

  it("shows both any and the delay when both are set, one badge for the task however many arrows come in", () => {
    const badges = dependencyBadges(
      [
        node(1),
        node(2),
        node(3, { dependencyMode: "any", dependencyDelay: 2 }),
      ],
      [arrow(1, 3), arrow(2, 3)],
    );
    expect([...badges]).toEqual([[3, { any: true, delay: 2, quiet: false }]]);
  });
});
