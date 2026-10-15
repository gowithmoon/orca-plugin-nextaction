// The all tasks view's collapsed nodes (#67). They live in the plugin
// instance's memory, like the next action view's filter: switching views and
// closing the plugin panel keep them; unloading clears them
// (platform/panel-feature.ts), and they are never written with
// `plugins.setData`. A node no longer in the tree has no effect.
//
// A task node is expanded and a project row collapsed by default (#147); the
// store records the nodes turned the other way. A block both a task and a
// project has a node of each kind, each with its own key.
import type { AllTasksNode } from "../../../application/usecases/read-all-tasks";
import { createMemoryStore } from "../../components/memory-store";

/** Identifies a node across reads: its kind and its block. */
export type CollapseKey = `task:${number}` | `project:${number}`;

export function collapseKey(node: AllTasksNode): CollapseKey {
  switch (node.kind) {
    case "task":
      return `task:${node.task.id}`;
    case "project":
      return `project:${node.project.id}`;
  }
}

/** A project row starts collapsed; a task node, expanded. */
function collapsedByDefault(key: CollapseKey): boolean {
  return key.startsWith("project:");
}

export interface AllTasksCollapseStore {
  /** The nodes turned from their default; a new set after every change. */
  current(): ReadonlySet<CollapseKey>;
  /** Collapses the node if expanded, expands it if collapsed. */
  toggle(key: CollapseKey): void;
  /** Collapses every one of `keys` ("collapse all"). */
  collapse(keys: readonly CollapseKey[]): void;
  /** Expands every one of `keys` ("expand all"). */
  expand(keys: readonly CollapseKey[]): void;
  /** Back to every node's default; what unloading does. */
  clear(): void;
  /** Calls `listener` on every change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

/** Whether the node of `key` is collapsed, given the store's `turned` set. */
export function isCollapsed(
  turned: ReadonlySet<CollapseKey>,
  key: CollapseKey,
): boolean {
  return collapsedByDefault(key) !== turned.has(key);
}

export function createAllTasksCollapseStore(): AllTasksCollapseStore {
  const store = createMemoryStore<ReadonlySet<CollapseKey>>(new Set());
  /** Sets every one of `keys` to `collapsed`. */
  const setAll = (keys: readonly CollapseKey[], collapsed: boolean) => {
    const turned = store.current();
    if (keys.every((key) => isCollapsed(turned, key) === collapsed)) return;
    const next = new Set(turned);
    for (const key of keys) {
      if (collapsedByDefault(key) === collapsed) next.delete(key);
      else next.add(key);
    }
    store.set(next);
  };
  return {
    current: store.current,
    toggle(key) {
      const next = new Set(store.current());
      if (!next.delete(key)) next.add(key);
      store.set(next);
    },
    collapse: (keys) => setAll(keys, true),
    expand: (keys) => setAll(keys, false),
    clear() {
      if (store.current().size > 0) store.set(new Set());
    },
    subscribe: store.subscribe,
  };
}
