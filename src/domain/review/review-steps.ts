// The full review's steps (GLOSSARY: 回顾, 完整回顾), in the glossary's order.
// How each step shows is the view's (ui/views/review/review-steps.ts).

/** Every step of a full review, in order: the summary last. */
export const fullReviewStepIds = [
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
] as const;

export type FullReviewStepId = (typeof fullReviewStepIds)[number];
