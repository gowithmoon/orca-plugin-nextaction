// LastFullReviewStore on `plugins.setData` (plugin-data-moment-store).
// Without it the review reads as never completed.
import type { LastFullReviewStore } from "../../application/ports/last-full-review";
import { createPluginDataMoment } from "./plugin-data-moment-store";

/**
 * The store for the load of `pluginName()`; `undefined` while not loaded,
 * when it reads as no moment and refuses to write.
 */
export function createPluginDataLastFullReview(
  pluginName: () => string | undefined,
): LastFullReviewStore {
  return createPluginDataMoment(
    pluginName,
    "lastFullReview",
    "the last full review",
  );
}
