// A task's chain on the task map (#218): what the map highlights when a card
// is selected. From the task, along the tasks waiting for it (GLOSSARY: 它阻
// 塞的任务) to the end, and the other way along what it waits for to the
// end; the two walks never meet halfway, so a task waiting for one of the
// tasks it waits for is not in it. Pure, over the read map (read-task-map.ts).
import type { TaskId } from "../../domain/task/task";
import type { TaskMapEdge, TaskMapNode, TaskMapRead } from "./read-task-map";

export interface TaskMapChain {
  /** The task and every task reached, either way. */
  readonly tasks: ReadonlySet<TaskId>;
  /** The edges walked: dependency and sequence edges, as the read has them. */
  readonly edges: readonly TaskMapEdge[];
}

/** One step of a walk: the task reached, and the edge drawn for it, if any. */
interface Step {
  readonly task: TaskId;
  readonly edge?: TaskMapEdge;
}

export function taskMapChain(read: TaskMapRead, id: TaskId): TaskMapChain {
  const down = new Map<TaskId, Step[]>();
  const up = new Map<TaskId, Step[]>();
  const link = (from: TaskId, to: TaskId, edge?: TaskMapEdge) => {
    const after = down.get(from) ?? [];
    after.push({ task: to, edge });
    down.set(from, after);
    const before = up.get(to) ?? [];
    before.push({ task: from, edge });
    up.set(to, before);
  };
  for (const edge of read.dependencyEdges) link(edge.from, edge.to, edge);
  for (const edge of read.sequenceEdges) link(edge.from, edge.to, edge);
  // A parent task waits for each of its subtasks: no edge drawn for it.
  const nest = (node: TaskMapNode) => {
    for (const child of node.children) {
      link(child.task.id, node.task.id);
      nest(child);
    }
  };
  for (const area of read.areas) area.tasks.forEach(nest);

  const tasks = new Set<TaskId>([id]);
  const edges = new Set<TaskMapEdge>();
  const walk = (steps: ReadonlyMap<TaskId, readonly Step[]>) => {
    const seen = new Set<TaskId>([id]);
    const queue = [id];
    for (let at = queue.shift(); at !== undefined; at = queue.shift()) {
      for (const step of steps.get(at) ?? []) {
        if (step.edge) edges.add(step.edge);
        tasks.add(step.task);
        // A cycle comes back to a task seen: the walk ends there.
        if (seen.has(step.task)) continue;
        seen.add(step.task);
        queue.push(step.task);
      }
    }
  };
  walk(down);
  walk(up);
  return { tasks, edges: [...edges] };
}
