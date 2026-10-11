// Which page of the review view shows (GLOSSARY: 回顾视图, #98), and a full
// review's progress (#99): its step, the steps opened and when it started.
// It lives in the plugin instance's memory, as the views' filters:
// switching views and closing the plugin panel keep it; unloading clears it
// (platform/panel-feature.ts), and it is never written with
// `plugins.setData`.
import { createMemoryStore } from "../../components/memory-store";
import type { FullReviewStepId } from "./review-steps";

export type ReviewPage =
  /** The entries: a full review, or only the tasks due for review. */
  | { readonly kind: "start" }
  /** Only the tasks due for review: their list and "Back", no step bar. */
  | { readonly kind: "dueForReview" }
  /** A full review (GLOSSARY: 完整回顾) under way. */
  | {
      readonly kind: "full";
      /** The step shown. */
      readonly step: FullReviewStepId;
      /** Every step shown so far in this full review, the current one too. */
      readonly opened: readonly FullReviewStepId[];
      /** When it started. */
      readonly startedAt: Date;
    };

const start: ReviewPage = { kind: "start" };

export interface ReviewPageStore {
  current(): ReviewPage;
  set(page: ReviewPage): void;
  /** Back to the start page; a full review under way is given up. */
  clear(): void;
  /** Calls `listener` on every change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

export function createReviewPageStore(): ReviewPageStore {
  const store = createMemoryStore(start);
  return { ...store, clear: () => store.set(start) };
}
