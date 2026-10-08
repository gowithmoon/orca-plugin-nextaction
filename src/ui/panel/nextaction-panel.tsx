// The plugin panel's shell (GLOSSARY: 插件面板, #35 "插件面板""档位与灵活布局"):
// measures its own width to pick a tier, renders the view navigation, the
// current view and, in the wide tier, the side pane. It knows nothing about
// any view's content. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { PanelProps } from "../../orca.d.ts";
import { PanelContext, type PanelContextValue } from "./panel-context";
import { PanelNavigation } from "./panel-navigation";
import type { PanelViews } from "./panel-views";
import { type PanelTier, tierForWidth } from "./tiers";

/** What the plugin panel keeps in its `viewArgs`; Orca spreads them into its props. */
export interface NextActionPanelArgs {
  /** The panel whose button opened the plugin panel (never the covered one). */
  readonly originPanelId: string;
  /**
   * The view the plugin panel replaced when it covered a panel, restored on
   * close. Values keep their original types (editor-sidetool-panel).
   */
  readonly covered?: {
    readonly view: "block" | "journal";
    readonly viewArgs: Record<string, unknown>;
  };
}

export interface NextActionPanelOptions {
  views: PanelViews;
  /** Content of the wide tier's side pane; the pane is empty without it. */
  sidePane?: React.ComponentType;
  /** Shows the refresh button beside the navigation when present. */
  onRefresh?: () => void;
}

/** Follows the element's width; `undefined` until it is first measured. */
function useTier(ref: React.RefObject<HTMLElement>): PanelTier | undefined {
  const [tier, setTier] = React.useState<PanelTier>();
  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    // Measured once before paint, so the first frame already has its tier.
    setTier(tierForWidth(element.getBoundingClientRect().width));
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setTier(tierForWidth(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return tier;
}

/** The panel type's renderer. Each opening starts afresh on the first view. */
export function createNextActionPanel(
  options: NextActionPanelOptions,
): React.ComponentType<PanelProps & Partial<NextActionPanelArgs>> {
  const { views, sidePane: SidePane, onRefresh } = options;

  return function NextActionPanel(props) {
    const root = React.useRef<HTMLDivElement>(null);
    const tier = useTier(root);
    const list = views.list();
    const [currentId, setCurrentId] = React.useState(list[0]?.id);
    const current = list.find((view) => view.id === currentId) ?? list[0];

    const context = React.useMemo<PanelContextValue | undefined>(
      () =>
        tier && {
          panelId: props.panelId,
          originPanelId: props.originPanelId,
          tier,
        },
      [props.panelId, props.originPanelId, tier],
    );

    const View = current?.component;
    return (
      <div className="nextaction-panel" data-tier={tier} ref={root}>
        {context && (
          <PanelContext.Provider value={context}>
            <PanelNavigation
              views={list}
              currentId={current?.id}
              onSelect={setCurrentId}
              onRefresh={onRefresh}
            />
            <div className="nextaction-panel-body">
              <div
                className="nextaction-panel-view"
                role="tabpanel"
                id={current && `${props.panelId}-${current.id}`}
                aria-label={current?.label()}
              >
                {View && <View />}
              </div>
              {tier === "wide" && (
                <aside className="nextaction-panel-side">
                  {SidePane && <SidePane />}
                </aside>
              )}
            </div>
          </PanelContext.Provider>
        )}
      </div>
    );
  };
}
