// Which project the projects view has open (#156): `null` shows the project
// list. It lives in the plugin instance's memory, like the other views'
// stores: switching views and closing the plugin panel keep it; unloading
// clears it (platform/panel-feature.ts), and it is never written with
// `plugins.setData`.
import type { ProjectId } from "../../../domain/project/project";
import { createMemoryStore } from "../../components/memory-store";

export interface OpenProjectStore {
  current(): ProjectId | null;
  /** Opens the project details of `id`; `null` goes back to the list. */
  set(id: ProjectId | null): void;
  /** Back to the list; what unloading does. */
  clear(): void;
  /** Calls `listener` on every change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

export function createOpenProjectStore(): OpenProjectStore {
  const store = createMemoryStore<ProjectId | null>(null);
  return {
    current: store.current,
    set: store.set,
    clear: () => store.set(null),
    subscribe: store.subscribe,
  };
}
