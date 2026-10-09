// The plugin panel's view navigation: one item per registered view, the
// current one highlighted, and a slot for the refresh button on the right.
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import { t } from "../../shared/l10n/l10n";
import { usePanel } from "./panel-context";
import type { PanelView } from "./panel-views";

const noCount = (): number | undefined => undefined;

function NavigationItem(props: {
  view: PanelView;
  current: boolean;
  onSelect: (id: string) => void;
}) {
  const { view, current, onSelect } = props;
  const { panelId, tier } = usePanel();
  const { Tooltip } = orca.components;
  // Stable per view, so the same hook runs on every render.
  const useCount = view.useCount ?? noCount;
  const count = useCount();
  const label = view.label();

  const item = (
    <button
      type="button"
      role="tab"
      className="nextaction-panel-nav-item"
      aria-selected={current}
      aria-controls={current ? `${panelId}-${view.id}` : undefined}
      aria-label={count === undefined ? label : `${label} ${count}`}
      onClick={() => onSelect(view.id)}
    >
      <i className={view.icon} aria-hidden="true" />
      <span className="nextaction-panel-nav-label">{label}</span>
      {count !== undefined && (
        <span className="nextaction-panel-nav-count" aria-hidden="true">
          {count}
        </span>
      )}
    </button>
  );
  // In the narrow tier only the current item shows its name.
  return tier === "narrow" && !current ? (
    <Tooltip text={label} defaultPlacement="bottom">
      {item}
    </Tooltip>
  ) : (
    item
  );
}

export function PanelNavigation(props: {
  views: readonly PanelView[];
  currentId: string | undefined;
  onSelect: (id: string) => void;
  onRefresh?: () => void;
}) {
  const { Button, Tooltip } = orca.components;
  return (
    <div className="nextaction-panel-header">
      <div
        className="nextaction-panel-nav"
        role="tablist"
        aria-label={t("Views")}
      >
        {props.views.map((view) => (
          <NavigationItem
            key={view.id}
            view={view}
            current={view.id === props.currentId}
            onSelect={props.onSelect}
          />
        ))}
      </div>
      <div className="nextaction-panel-actions">
        {props.onRefresh && (
          <Tooltip text={t("Refresh")} defaultPlacement="bottom">
            <Button
              variant="plain"
              aria-label={t("Refresh")}
              onClick={props.onRefresh}
            >
              <i className="ti ti-refresh" aria-hidden="true" />
            </Button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
