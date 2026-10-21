// The plugin panel's view navigation: one item per registered view, the
// current one highlighted, and a slot for the refresh button on the right.
// Names are never cut short (#225): the navigation measures its items and
// folds them to their icons from the last one back, as far as its width
// needs, the current one named while any is.
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import { t } from "../../shared/l10n/l10n";
import { usePanel } from "./panel-context";
import type { PanelView } from "./panel-views";

const noCount = (): number | undefined => undefined;

/**
 * How far the navigation folds: the first `named` items keep their names,
 * the rest show their icons; the current item keeps its name too while
 * `currentNamed`. Every item is named when `named` is all of them.
 */
interface NavigationFit {
  readonly named: number;
  readonly currentNamed: boolean;
}

const allNamed: NavigationFit = {
  named: Number.POSITIVE_INFINITY,
  currentNamed: true,
};

function NavigationItem(props: {
  view: PanelView;
  current: boolean;
  iconOnly: boolean;
  onSelect: (id: string) => void;
}) {
  const { view, current, iconOnly, onSelect } = props;
  const { panelId } = usePanel();
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
      data-icon-only={iconOnly || undefined}
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
  // An item showing only its icon has its name as a tooltip.
  return iconOnly ? (
    <Tooltip text={label} defaultPlacement="bottom">
      {item}
    </Tooltip>
  ) : (
    item
  );
}

/**
 * An item's two widths, out of sight: named, in the current item's weight
 * whichever is current so switching views never refolds, and icon only.
 */
function MeasuredItem(props: { view: PanelView }) {
  const { view } = props;
  const useCount = view.useCount ?? noCount;
  const count = useCount();
  return (
    <>
      <span className="nextaction-panel-nav-item" data-measure="named">
        <i className={view.icon} />
        <span className="nextaction-panel-nav-label">{view.label()}</span>
        {count !== undefined && (
          <span className="nextaction-panel-nav-count">{count}</span>
        )}
      </span>
      <span
        className="nextaction-panel-nav-item"
        data-measure="icon"
        data-icon-only
      >
        <i className={view.icon} />
      </span>
    </>
  );
}

/**
 * How far items of these widths fold to fit in `available` pixels: the
 * fewest folded. Room is kept for the widest folded item's name, so the
 * fold holds whichever item is current and switching views never refolds.
 */
function fitFor(
  named: readonly number[],
  icons: readonly number[],
  gap: number,
  available: number,
): NavigationFit {
  const count = named.length;
  const gaps = gap * Math.max(count - 1, 0);
  const width = (index: number, kept: number) =>
    index < kept ? (named[index] ?? 0) : (icons[index] ?? 0);
  const total = (kept: number) => {
    let sum = gaps;
    let widestName = 0;
    for (let index = 0; index < count; index++) {
      sum += width(index, kept);
      if (index >= kept) {
        widestName = Math.max(
          widestName,
          (named[index] ?? 0) - (icons[index] ?? 0),
        );
      }
    }
    return sum + widestName;
  };
  for (let kept = count; kept >= 0; kept--) {
    if (total(kept) <= available) return { named: kept, currentNamed: true };
  }
  return { named: 0, currentNamed: false };
}

/**
 * The fold the navigation needs, worked out before paint and again whenever
 * its width or its items' widths (a count, the language) change.
 */
function useNavigationFit(
  nav: React.RefObject<HTMLElement>,
  measure: React.RefObject<HTMLElement>,
): NavigationFit {
  const [fit, setFit] = React.useState<NavigationFit>(allNamed);
  React.useLayoutEffect(() => {
    const navElement = nav.current;
    const measureElement = measure.current;
    if (!navElement || !measureElement) return;
    const widths = (kind: string) =>
      [...measureElement.querySelectorAll(`[data-measure="${kind}"]`)].map(
        (element) => Math.ceil(element.getBoundingClientRect().width),
      );
    const update = () => {
      const gap = Number.parseFloat(getComputedStyle(navElement).columnGap);
      const next = fitFor(
        widths("named"),
        widths("icon"),
        Number.isNaN(gap) ? 0 : gap,
        navElement.getBoundingClientRect().width,
      );
      // Unchanged, the navigation does not render again.
      setFit((fit) =>
        fit.named === next.named && fit.currentNamed === next.currentNamed
          ? fit
          : next,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(navElement);
    observer.observe(measureElement);
    return () => observer.disconnect();
  }, [nav, measure]);
  return fit;
}

export function PanelNavigation(props: {
  views: readonly PanelView[];
  currentId: string | undefined;
  onSelect: (id: string) => void;
  onRefresh?: () => void;
}) {
  const { Button, Tooltip } = orca.components;
  const nav = React.useRef<HTMLDivElement>(null);
  const measure = React.useRef<HTMLDivElement>(null);
  const fit = useNavigationFit(nav, measure);
  return (
    <div className="nextaction-panel-header">
      <div
        ref={nav}
        className="nextaction-panel-nav"
        role="tablist"
        aria-label={t("Views")}
      >
        {props.views.map((view, index) => {
          const current = view.id === props.currentId;
          const named = index < fit.named || (current && fit.currentNamed);
          return (
            <NavigationItem
              key={view.id}
              view={view}
              current={current}
              iconOnly={!named}
              onSelect={props.onSelect}
            />
          );
        })}
        <div
          ref={measure}
          className="nextaction-panel-nav-measure"
          aria-hidden="true"
        >
          {props.views.map((view) => (
            <MeasuredItem key={view.id} view={view} />
          ))}
        </div>
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
