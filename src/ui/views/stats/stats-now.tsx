// The stats view's header numbers (GLOSSARY: 统计视图, #134): the next
// actions, the doing, the waiting and the overdue tasks now, whatever
// period is looked at. Each is a button that jumps to the view listing them
// (#133): the next action view; the all tasks view showing only that
// status; the review's overdue step. Two rows of two in the narrow tier, one
// row otherwise. It shows the stats query's data, so it follows every task
// change with the rest of the view. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import type { ReadStatsResult } from "../../../application/usecases/read-stats";
import { t } from "../../../shared/l10n/l10n";
import { useViewQuery, type ViewQuery } from "../../hooks/use-view-query";
import { usePanel } from "../../panel/panel-context";
import type { AllTasksFilterStore } from "../all-tasks/all-tasks-filter-store";
import type { ReviewPageStore } from "../review/review-page-store";

/** The presets the numbers jump with, set in the target views' stores. */
export interface StatsNowDeps {
  readonly allTasksFilter: Pick<AllTasksFilterStore, "showOnlyStatus">;
  readonly reviewPage: Pick<ReviewPageStore, "openFullReviewStep">;
}

interface NowNumber {
  readonly key: keyof ReadStatsResult["now"];
  readonly label: string;
  readonly icon: string;
  /** Jumps to the view listing these tasks. */
  readonly show: () => void;
}

export function StatsNow(props: {
  query: ViewQuery<ReadStatsResult>;
  deps: StatsNowDeps;
}) {
  const { tier, showView } = usePanel();
  const state = useViewQuery(props.query);
  // Loading, paused and failed show in the period below.
  if (state.kind !== "loaded") return null;
  const { now } = state.data;
  const { allTasksFilter, reviewPage } = props.deps;
  const numbers: readonly NowNumber[] = [
    {
      key: "nextActions",
      label: t("Next actions"),
      icon: "ti ti-player-play",
      show: () => showView("next-action"),
    },
    {
      key: "doing",
      label: t("Doing"),
      icon: "ti ti-progress",
      show: () => {
        allTasksFilter.showOnlyStatus("doing");
        showView("all-tasks");
      },
    },
    {
      key: "waiting",
      label: t("Waiting"),
      icon: "ti ti-hourglass",
      show: () => {
        allTasksFilter.showOnlyStatus("waiting");
        showView("all-tasks");
      },
    },
    {
      key: "overdue",
      label: t("Overdue"),
      icon: "ti ti-alert-circle",
      show: () => {
        reviewPage.openFullReviewStep("overdue");
        showView("review");
      },
    },
  ];
  return (
    <ul
      className={`nextaction-stats-now nextaction-stats-now-${tier}`}
      aria-label={t("How things stand now")}
    >
      {numbers.map((number) => (
        <li key={number.key}>
          <button
            type="button"
            className="nextaction-stats-now-item"
            aria-label={t("${label}: ${count}", {
              label: number.label,
              count: String(now[number.key]),
            })}
            onClick={number.show}
          >
            <span className="nextaction-stats-now-count">
              {now[number.key]}
            </span>
            <span className="nextaction-stats-now-label">
              <i className={number.icon} aria-hidden="true" />
              {number.label}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
