// The project list's collapsed groups (#155). They live in the plugin
// instance's memory, like the all tasks view's collapsed nodes: switching
// views and closing the plugin panel keep them; unloading clears them
// (platform/panel-feature.ts), and they are never written with
// `plugins.setData`. The done group is collapsed by default, every other
// expanded; the store records the groups turned the other way. The review's
// projects step has a store of its own, every group expanded by default
// (#161).
import type { ProjectStatus } from "../../../domain/project/project";
import { createMemoryStore } from "../../components/memory-store";

export interface ProjectGroupsStore {
  /** The groups turned from their default; a new set after every change. */
  current(): ReadonlySet<ProjectStatus>;
  /** Collapses the group if expanded, expands it if collapsed. */
  toggle(status: ProjectStatus): void;
  /** Back to every group's default; what unloading does. */
  clear(): void;
  /** Calls `listener` on every change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

/**
 * Whether the group of `status` is collapsed, given the store's `turned`
 * set and the groups collapsed by default: the project list's done group
 * unless told otherwise (the review's projects step expands every group by
 * default, #161).
 */
export function isGroupCollapsed(
  turned: ReadonlySet<ProjectStatus>,
  status: ProjectStatus,
  collapsedByDefault: readonly ProjectStatus[] = ["done"],
): boolean {
  return collapsedByDefault.includes(status) !== turned.has(status);
}

export function createProjectGroupsStore(): ProjectGroupsStore {
  const store = createMemoryStore<ReadonlySet<ProjectStatus>>(new Set());
  return {
    current: store.current,
    toggle(status) {
      const next = new Set(store.current());
      if (!next.delete(status)) next.add(status);
      store.set(next);
    },
    clear() {
      if (store.current().size > 0) store.set(new Set());
    },
    subscribe: store.subscribe,
  };
}
