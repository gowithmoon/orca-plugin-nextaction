// A view's heading: its name and, in the narrow tier only, how many tasks it
// holds. In the other tiers the navigation shows the count (#48).
import { usePanel } from "../panel/panel-context";

export function ViewHeader(props: { title: string; count?: number }) {
  const { tier } = usePanel();
  const count = tier === "narrow" ? props.count : undefined;
  return (
    <header className="nextaction-view-header">
      <h2 className="nextaction-view-title">{props.title}</h2>
      {count !== undefined && (
        <span className="nextaction-view-count">{count}</span>
      )}
    </header>
  );
}
