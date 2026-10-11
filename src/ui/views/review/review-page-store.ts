// Which page of the review view shows (GLOSSARY: 回顾视图, #98). It lives in
// the plugin instance's memory, as the views' filters: switching views and
// closing the plugin panel keep it; unloading clears it
// (platform/panel-feature.ts), and it is never written with
// `plugins.setData`. A full review's progress (its step, the steps opened)
// joins it as another page later.
import { createMemoryStore } from "../../components/memory-store";

export type ReviewPage =
  /** The entries: only the tasks due for review (a full review later). */
  | { readonly kind: "start" }
  /** Only the tasks due for review: their list and "Back", no step bar. */
  | { readonly kind: "dueForReview" };

const start: ReviewPage = { kind: "start" };

export interface ReviewPageStore {
  current(): ReviewPage;
  set(page: ReviewPage): void;
  /** Back to the start page. */
  clear(): void;
  /** Calls `listener` on every change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

export function createReviewPageStore(): ReviewPageStore {
  const store = createMemoryStore(start, (a, b) => a.kind === b.kind);
  return { ...store, clear: () => store.set(start) };
}
