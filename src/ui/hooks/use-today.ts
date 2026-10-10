// The current logical day for a view that stays open across the day boundary
// (#83): checked once a minute by a timer the component owns, released with
// it (docs/ARCHITECTURE.md §4, the exception for component timers). Verified
// by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { CalendarDate } from "../../domain/task/task";
import { compareDays } from "../../domain/time/calendar-days";

/** How often the day is checked. */
const checkEveryMs = 60_000;

/**
 * The current logical day by `today`, re-rendering when it changes: past the
 * day boundary, or after the day boundary setting moved it. The same object
 * is returned while the day stays, so effects depending on it do not rerun.
 */
export function useToday(today: () => CalendarDate): CalendarDate {
  const [day, setDay] = React.useState(today);
  React.useEffect(() => {
    const check = () =>
      setDay((shown) => {
        const now = today();
        return compareDays(now, shown) === 0 ? shown : now;
      });
    check();
    const timer = setInterval(check, checkEveryMs);
    return () => clearInterval(timer);
  }, [today]);
  return day;
}
