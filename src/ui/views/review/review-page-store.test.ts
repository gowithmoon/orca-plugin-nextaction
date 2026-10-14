import { describe, expect, it } from "vitest";
import { createReviewPageStore } from "./review-page-store";

describe("review page store", () => {
  it("opening a step from the start page begins a full review on that step", () => {
    const store = createReviewPageStore();

    store.openFullReviewStep("overdue");

    expect(store.current()).toEqual({
      kind: "full",
      step: "overdue",
      opened: ["overdue"],
    });
  });

  it("opening a step during a full review moves to it and keeps the steps already opened", () => {
    const store = createReviewPageStore();
    store.set({
      kind: "full",
      step: "lookBack",
      opened: ["inbox", "lookBack"],
    });

    store.openFullReviewStep("overdue");

    expect(store.current()).toEqual({
      kind: "full",
      step: "overdue",
      opened: ["inbox", "lookBack", "overdue"],
    });
  });
});
