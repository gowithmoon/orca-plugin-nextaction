// The My Day view's layout (GLOSSARY: 布局, #197): the timeline layout, the
// list or the quadrants (GLOSSARY: 四象限, #198). It lives in the plugin
// instance's memory: each load starts from the "My Day default layout"
// setting, and a change of that setting overrides it at once
// (platform/panel-feature.ts). Never written with `plugins.setData`.
import { createMemoryStore } from "../../components/memory-store";

/** The layouts in the order offered (the header's switch, the setting). */
export const myDayLayouts = ["timeline", "list", "matrix"] as const;

export type MyDayLayout = (typeof myDayLayouts)[number];

/**
 * The layout a setting value names: its English key; anything else (no
 * value, a value from a later version) reads as the timeline layout.
 */
export function myDayLayoutFrom(value: unknown): MyDayLayout {
  return myDayLayouts.find((layout) => layout === value) ?? "timeline";
}

export interface MyDayLayoutStore {
  current(): MyDayLayout;
  set(layout: MyDayLayout): void;
  /** Back to the timeline layout; what unloading does. */
  clear(): void;
  /** Calls `listener` on every change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

export function createMyDayLayoutStore(): MyDayLayoutStore {
  const store = createMemoryStore<MyDayLayout>("timeline");
  return { ...store, clear: () => store.set("timeline") };
}
