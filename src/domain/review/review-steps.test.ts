import { describe, expect, it } from "vitest";
import { fullReviewStepIds } from "./review-steps";

describe("the full review's steps", () => {
  it("run in the glossary's order, the summary last", () => {
    expect(fullReviewStepIds).toEqual([
      "inbox",
      "lookBack",
      "overdue",
      "dueSoon",
      "nextActions",
      "waiting",
      "projects",
      "someday",
      "dueForReview",
      "summary",
    ]);
  });
});
