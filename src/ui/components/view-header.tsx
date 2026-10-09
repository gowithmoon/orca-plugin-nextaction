// A view's heading: its name and, in the narrow tier only, how many tasks it
// holds. In the other tiers the navigation shows the count (#48), unless the
// view's count differs from the navigation's (a filtered list, #55).
import { usePanel } from "../panel/panel-context";

export function ViewHeader(props: {
  title: string;
  count?: number;
  /** Show the count in every tier, not only the narrow one. */
  countInEveryTier?: boolean;
}) {
  const { tier } = usePanel();
  const count =
    tier === "narrow" || props.countInEveryTier ? props.count : undefined;
  return (
    <header className="nextaction-view-header">
      <h2 className="nextaction-view-title">{props.title}</h2>
      {count !== undefined && (
        <span className="nextaction-view-count">{count}</span>
      )}
    </header>
  );
}
