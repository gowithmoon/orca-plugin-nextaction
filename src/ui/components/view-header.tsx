// A view's heading: its name and, in the narrow tier only, how many tasks it
// holds. In the other tiers the navigation shows the count (#48), unless the
// view's count differs from the navigation's (a filtered list, #55). A view
// without a toolbar puts its controls at the row's end (the next action
// view's filter button).
import type * as React from "react";
import { usePanel } from "../panel/panel-context";

export function ViewHeader(props: {
  title: string;
  count?: number;
  /** Show the count in every tier, not only the narrow one. */
  countInEveryTier?: boolean;
  /** Controls at the end of the row. */
  actions?: React.ReactNode;
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
      {props.actions && (
        <div className="nextaction-view-header-actions">{props.actions}</div>
      )}
    </header>
  );
}
