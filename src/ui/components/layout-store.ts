// A view's layout (GLOSSARY: 布局): one of a fixed list, the first being the
// fallback. Shared by the project details (#166) and the My Day view (#197).
// It lives in the plugin instance's memory: each load starts from the
// view's default layout setting, and a change of that setting overrides it
// at once (platform/panel-feature.ts). Never written with `plugins.setData`.
import { createMemoryStore } from "./memory-store";

export interface LayoutStore<Layout extends string> {
  /** The layouts in the order offered (the switch, the setting). */
  readonly layouts: readonly Layout[];
  /**
   * The layout a setting value names: its English key; anything else (no
   * value, a value from a later version) reads as the first layout.
   */
  from(value: unknown): Layout;
  current(): Layout;
  set(layout: Layout): void;
  /** Back to the first layout; what unloading does. */
  clear(): void;
  /** Calls `listener` on every change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

/** A store over `layouts`, starting at, and falling back to, the first. */
export function createLayoutStore<Layout extends string>(
  layouts: readonly [Layout, ...Layout[]],
): LayoutStore<Layout> {
  const fallback = layouts[0];
  const store = createMemoryStore<Layout>(fallback);
  return {
    ...store,
    layouts,
    from: (value) => layouts.find((layout) => layout === value) ?? fallback,
    clear: () => store.set(fallback),
  };
}
