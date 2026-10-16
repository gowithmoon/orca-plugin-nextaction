// How the full review's steps show (GLOSSARY: 回顾, 完整回顾): each step's
// label, list or own page, and card actions, keyed by the step ids. Their
// order is the domain's (domain/review/review-steps.ts): the one list the
// step bar, "Previous / Next" and each step's page follow.
// A step with neither `list` nor `ownPage` is not built yet: the step bar
// shows it unavailable and "Previous / Next" pass over it. The summary has
// its own page (#101); look back's list is the tasks planned but not done,
// the view adding its completions and skips above it (#102).
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type { ReviewStepKey } from "../../../application/usecases/read-review";
import {
  type FullReviewStepId,
  fullReviewStepIds,
} from "../../../domain/review/review-steps";
import { t } from "../../../shared/l10n/l10n";

export type { FullReviewStepId };

/** A card's own action in a step, an icon button beside "open in notes". */
export type ReviewCardAction =
  /** Marks the task reviewed (GLOSSARY: 标记已回顾), when it can be. */
  | "markReviewed"
  /** Adds the task to today's My Day (GLOSSARY: 我的一天). */
  | "addToMyDay"
  /** A waiting task back to todo. */
  | "backToTodo"
  /** A someday task to todo. */
  | "activate"
  /** Drops the task (GLOSSARY: 放弃). */
  | "drop"
  /** Opens the review popup (#103). */
  | "changeReviewInterval"
  /**
   * A menu of quick due dates: tomorrow, next Monday, a day picked, none
   * (the overdue step, #100).
   */
  | "reschedule";

/** What a step that lists tasks shows. */
export interface ReviewStepList {
  /** The read's list. */
  readonly key: ReviewStepKey;
  /**
   * The cards' own actions, in the order shown. "Mark reviewed" is offered
   * in every step (#99): placed last unless the step places it.
   */
  readonly actions: readonly ReviewCardAction[];
  /**
   * A card kept after it left the step says its new status ("Changed to
   * …"); `false` only fades it, where a task leaves for reasons besides its
   * status (the next actions) or keeps its status (marked reviewed).
   */
  readonly keptStatusShown: boolean;
  /** An empty list's icon and title. */
  readonly emptyIcon: string;
  readonly empty: () => string;
  /** A line under it, when the title alone does not say enough. */
  readonly emptyDetail?: () => string;
}

export interface FullReviewStep {
  readonly id: FullReviewStepId;
  readonly label: () => string;
  /** Absent while the step is not built, or when it has its own page. */
  readonly list?: ReviewStepList;
  /** The step shows its own page rather than a list (the summary, #101). */
  readonly ownPage?: true;
}

/** Whether the step can be opened: it lists tasks or has its own page. */
export function isAvailable(step: FullReviewStep): boolean {
  return step.list !== undefined || step.ownPage === true;
}

/** Each step's display, by step id. */
const stepDisplays: Readonly<
  Record<FullReviewStepId, Omit<FullReviewStep, "id">>
> = {
  inbox: {
    label: () => t("Inbox"),
    list: {
      key: "inbox",
      // Clarifying is the task panel's, opened by a click on the card, as
      // in the inbox view.
      actions: [],
      keptStatusShown: true,
      emptyIcon: "ti ti-inbox",
      empty: () => t("Inbox is clear"),
    },
  },
  lookBack: {
    label: () => t("Look back"),
    // The tasks planned but not done; the view shows the completions and
    // skips above them (#102).
    list: {
      key: "lookBack",
      actions: ["addToMyDay"],
      keptStatusShown: true,
      emptyIcon: "ti ti-sun",
      empty: () => t("Nothing planned was left undone"),
    },
  },
  overdue: {
    label: () => t("Overdue tasks"),
    list: {
      key: "overdue",
      actions: ["reschedule", "addToMyDay"],
      // Only faded: a new due date leaves the status as it was, and the
      // card shows the new date itself.
      keptStatusShown: false,
      emptyIcon: "ti ti-calendar-check",
      empty: () => t("No overdue tasks"),
    },
  },
  dueSoon: {
    label: () => t("Due in the next 7 days"),
    list: {
      key: "dueSoon",
      actions: ["addToMyDay"],
      // A task leaves by its due date as often as by its status.
      keptStatusShown: false,
      emptyIcon: "ti ti-calendar",
      empty: () => t("Nothing due in the next 7 days"),
    },
  },
  nextActions: {
    label: () => t("Next actions"),
    list: {
      key: "nextActions",
      actions: ["addToMyDay"],
      keptStatusShown: false,
      emptyIcon: "ti ti-player-play",
      empty: () => t("Nothing to do right now"),
    },
  },
  waiting: {
    label: () => t("Waiting"),
    list: {
      key: "waiting",
      actions: ["backToTodo"],
      keptStatusShown: true,
      emptyIcon: "ti ti-hourglass",
      empty: () => t("No waiting tasks"),
    },
  },
  // Not built yet: its own page of project rows (#161).
  projects: { label: () => t("Projects") },
  someday: {
    label: () => t("Someday"),
    list: {
      key: "someday",
      actions: ["activate", "drop"],
      keptStatusShown: true,
      emptyIcon: "ti ti-cloud",
      empty: () => t("No someday tasks"),
    },
  },
  dueForReview: {
    label: () => t("Tasks due for review"),
    list: dueForReviewList(),
  },
  summary: { label: () => t("Summary"), ownPage: true },
};

/** The full review's steps, in the domain's order. */
export const fullReviewSteps: readonly FullReviewStep[] = fullReviewStepIds.map(
  (id) => ({ id, ...stepDisplays[id] }),
);

/**
 * The tasks due for review: the full review's step, and the list "only the
 * tasks due for review" shows.
 */
export function dueForReviewList(): ReviewStepList {
  return {
    key: "dueForReview",
    actions: ["markReviewed", "changeReviewInterval"],
    // Only faded: marking reviewed or changing the plan leaves the status
    // as it was, so "Changed to" would mislead.
    keptStatusShown: false,
    emptyIcon: "ti ti-list-check",
    empty: () => t("No tasks due for review"),
    emptyDetail: () =>
      t(
        "Tasks with a review interval or a review-on day show here once their day comes.",
      ),
  };
}

/** The card actions shown, "Mark reviewed" among them. */
export function cardActions(list: ReviewStepList): readonly ReviewCardAction[] {
  return list.actions.includes("markReviewed")
    ? list.actions
    : [...list.actions, "markReviewed"];
}

/** The step's definition. */
export function fullReviewStep(id: FullReviewStepId): FullReviewStep {
  const step = fullReviewSteps.find((candidate) => candidate.id === id);
  if (!step) throw new Error(`unknown review step ${id}`);
  return step;
}

/**
 * The nearest step that can be opened before (`-1`) or after (`1`) `id`;
 * `undefined` when there is none.
 */
export function adjacentStep(
  id: FullReviewStepId,
  direction: -1 | 1,
): FullReviewStep | undefined {
  const at = fullReviewSteps.findIndex((step) => step.id === id);
  for (
    let index = at + direction;
    index >= 0 && index < fullReviewSteps.length;
    index += direction
  ) {
    const step = fullReviewSteps[index];
    if (step && isAvailable(step)) return step;
  }
  return undefined;
}

/** Where a full review starts: the first step that can be opened. */
export function firstStep(): FullReviewStepId {
  return fullReviewSteps.find(isAvailable)?.id ?? "inbox";
}
