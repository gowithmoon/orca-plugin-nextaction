// The current time for the timeline's current time line (#84): read again
// once a minute by a timer the component owns, released with it
// (docs/ARCHITECTURE.md §4, the exception for component timers). Verified by
// hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";

/** How often the time is read again. */
const everyMs = 60_000;

/** The current time by `now`, re-rendering once a minute. */
export function useNow(now: () => Date): Date {
  const [at, setAt] = React.useState(now);
  React.useEffect(() => {
    setAt(now());
    const timer = setInterval(() => setAt(now()), everyMs);
    return () => clearInterval(timer);
  }, [now]);
  return at;
}
