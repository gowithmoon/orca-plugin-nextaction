// The project details' layout (GLOSSARY: 布局, #166): tree or board, one
// choice for every project. It lives in the plugin instance's memory: each
// load starts from the "project view default layout" setting, and a change
// of that setting overrides it at once (platform/panel-feature.ts). Never
// written with `plugins.setData`.
import { createMemoryStore } from "../../components/memory-store";

export type ProjectLayout = "tree" | "board";

/** The layouts in the order offered (the toolbar, the setting). */
export const projectLayouts: readonly ProjectLayout[] = ["tree", "board"];

/**
 * The layout a setting value names: its English key; anything else (no
 * value, a value from a later version) reads as the tree.
 */
export function projectLayoutFrom(value: unknown): ProjectLayout {
  return projectLayouts.find((layout) => layout === value) ?? "tree";
}

export interface ProjectLayoutStore {
  current(): ProjectLayout;
  set(layout: ProjectLayout): void;
  /** Back to the tree; what unloading does. */
  clear(): void;
  /** Calls `listener` on every change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

export function createProjectLayoutStore(): ProjectLayoutStore {
  const store = createMemoryStore<ProjectLayout>("tree");
  return { ...store, clear: () => store.set("tree") };
}
