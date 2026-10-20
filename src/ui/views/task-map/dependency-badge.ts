// The dependency badges on the task map (#220): one per dependent, at the
// entry where its dependency arrows come in. A badge shows "Any" and
// "+N days" when set; with neither it is quiet, shown only while the pointer
// is on the card. A click on it opens the popover editing the dependency
// mode and delay (dependency-popover.tsx).
import type {
  TaskMapEdge,
  TaskMapNode,
} from "../../../application/usecases/read-task-map";
import type { TaskId } from "../../../domain/task/task";

export interface DependencyBadge {
  /** Shows "Any": the dependency mode is any. */
  readonly any: boolean;
  /** Shows "+N days" when above 0: the dependency delay as read. */
  readonly delay: number;
  /** Neither shown: the badge appears only while hovering over the card. */
  readonly quiet: boolean;
}

/** What a badge needs of a node: its task's ID and mode, its delay. */
export type DependencyBadgeNode = {
  readonly task: Pick<TaskMapNode["task"], "id" | "dependencyMode">;
} & Pick<TaskMapNode, "dependencyDelay">;

/**
 * The badges, by dependent: every node at least one dependency arrow comes
 * into, one badge however many come in. A task none comes into (its
 * dependencies stale or not on the map) has none: there is no entry for it.
 */
export function dependencyBadges(
  nodes: readonly DependencyBadgeNode[],
  dependencyEdges: readonly TaskMapEdge[],
): Map<TaskId, DependencyBadge> {
  const entered = new Set(dependencyEdges.map((edge) => edge.to));
  const out = new Map<TaskId, DependencyBadge>();
  for (const node of nodes) {
    if (!entered.has(node.task.id)) continue;
    const any = node.task.dependencyMode === "any";
    const delay = node.dependencyDelay;
    out.set(node.task.id, { any, delay, quiet: !any && delay === 0 });
  }
  return out;
}
