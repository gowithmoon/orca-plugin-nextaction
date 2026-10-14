// The stats view's scale as the user chose it (GLOSSARY: 统计周期, #135):
// week, month or year. It lives in the plugin instance's memory, like the
// other views' filters: switching views and closing the plugin panel keep
// it; unloading puts it back to the week (platform/panel-feature.ts), and it
// is never written with `plugins.setData`.
import type { StatsScale } from "../../../domain/stats/stats-period";
import { createMemoryStore } from "../../components/memory-store";

export interface StatsScaleStore {
  current(): StatsScale;
  set(scale: StatsScale): void;
  /** Back to the week. */
  clear(): void;
  /** Calls `listener` on every change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

export function createStatsScaleStore(): StatsScaleStore {
  const store = createMemoryStore<StatsScale>("week");
  return { ...store, clear: () => store.set("week") };
}
