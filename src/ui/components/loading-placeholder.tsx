// What shows while a view or the task panel reads: nothing at first, then
// grey bars in the panel's own colours. Orca's `Skeleton` paints a fixed
// light grey, a white flash in a dark theme; and most reads end before the
// delay, so switching views shows no placeholder at all. Verified by hand in
// Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import { t } from "../../shared/l10n/l10n";

/** How long a read may take before the placeholder shows. */
const delayMs = 200;

/** `false` until `delayMs` after the first render. */
function useDelayPassed(): boolean {
  const [passed, setPassed] = React.useState(false);
  React.useEffect(() => {
    const timer = setTimeout(() => setPassed(true), delayMs);
    return () => clearTimeout(timer);
  }, []);
  return passed;
}

/** A title bar and a line of text, breathing. */
function Bars() {
  return (
    <div className="nextaction-skeleton" aria-hidden="true">
      <div className="nextaction-skeleton-title" />
      <div className="nextaction-skeleton-text" />
    </div>
  );
}

/** A list's placeholder: three cards. */
export function TaskListPlaceholder() {
  const passed = useDelayPassed();
  return (
    <div
      className="nextaction-task-list"
      role="status"
      aria-label={t("Loading tasks")}
    >
      {passed &&
        [0, 1, 2].map((key) => (
          <div key={key} className="nextaction-task-card-placeholder">
            <Bars />
          </div>
        ))}
    </div>
  );
}

/** The task panel's placeholder. */
export function TaskPlaceholder() {
  const passed = useDelayPassed();
  return (
    <div role="status" aria-label={t("Loading the task")}>
      {passed && <Bars />}
    </div>
  );
}
