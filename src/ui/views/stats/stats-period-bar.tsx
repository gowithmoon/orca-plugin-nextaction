// The stats view's period switcher (GLOSSARY: 统计周期, #135): the scale's
// buttons, paging back and forward (forward no further than the current
// period), "Back to this week (month, year)" once paged away, and the
// period's title. Every control is a native button with a readable label,
// so the keyboard reaches all of them. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import type { StatsPaging } from "../../../domain/stats/stats-paging";
import {
  type StatsScale,
  statsScales,
} from "../../../domain/stats/stats-period";
import type { CalendarDate } from "../../../domain/task/task";
import { t } from "../../../shared/l10n/l10n";
import { periodTitle, scaleName } from "./stats-period-text";

function previousLabel(scale: StatsScale): string {
  switch (scale) {
    case "week":
      return t("Previous week");
    case "month":
      return t("Previous month");
    case "year":
      return t("Previous year");
  }
}

function nextLabel(scale: StatsScale): string {
  switch (scale) {
    case "week":
      return t("Next week");
    case "month":
      return t("Next month");
    case "year":
      return t("Next year");
  }
}

function backLabel(scale: StatsScale): string {
  switch (scale) {
    case "week":
      return t("Back to this week");
    case "month":
      return t("Back to this month");
    case "year":
      return t("Back to this year");
  }
}

export function StatsPeriodBar(props: {
  period: {
    readonly scale: StatsScale;
    readonly first: CalendarDate;
    readonly last: CalendarDate;
  };
  paging: StatsPaging;
  today: CalendarDate;
  /**
   * The scale chosen, as its store holds it now: while a read for another
   * scale is under way it is not yet the period's.
   */
  chosen: StatsScale;
  /** Chooses `scale`; choosing the one chosen changes nothing. */
  onScale: (scale: StatsScale) => void;
  /** Reads the period holding `anchor`; none for the current period. */
  onPage: (anchor: CalendarDate | undefined) => void;
}) {
  const { Button, Tooltip } = orca.components;
  const { period, paging } = props;
  const { scale } = period;
  const { next } = paging;
  return (
    <div className="nextaction-stats-period-bar">
      <fieldset
        className="nextaction-stats-scales"
        aria-label={t("Stats period")}
      >
        {statsScales.map((choice) => (
          <button
            key={choice}
            type="button"
            className="nextaction-stats-scale"
            aria-pressed={choice === props.chosen}
            onClick={() => props.onScale(choice)}
          >
            {scaleName(choice)}
          </button>
        ))}
      </fieldset>
      <div className="nextaction-stats-pager">
        <Tooltip text={previousLabel(scale)}>
          <Button
            variant="plain"
            aria-label={previousLabel(scale)}
            onClick={() => props.onPage(paging.previous)}
          >
            <i className="ti ti-chevron-left" aria-hidden="true" />
          </Button>
        </Tooltip>
        <h3 className="nextaction-stats-period-title" aria-live="polite">
          {periodTitle(period, props.today)}
        </h3>
        <Tooltip text={nextLabel(scale)}>
          <Button
            variant="plain"
            aria-label={nextLabel(scale)}
            disabled={!next}
            onClick={() => next && props.onPage(next)}
          >
            <i className="ti ti-chevron-right" aria-hidden="true" />
          </Button>
        </Tooltip>
        {!paging.current && (
          <Button variant="outline" onClick={() => props.onPage(undefined)}>
            {backLabel(scale)}
          </Button>
        )}
      </div>
    </div>
  );
}
