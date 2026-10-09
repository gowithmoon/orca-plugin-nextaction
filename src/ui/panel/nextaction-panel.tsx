// The plugin panel's shell (GLOSSARY: 插件面板, #35 "插件面板""档位与灵活布局"):
// measures its own width to pick a tier, renders the view navigation, the
// current view and, in the wide tier, the side pane. It knows nothing about
// any view's content. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { TaskId } from "../../domain/task/task";
import type { PanelProps } from "../../orca.d.ts";
import { t } from "../../shared/l10n/l10n";
import type { OpenTaskPanelPopup } from "../task-panel/task-panel-popup";
import type { TaskPanelSidePaneProps } from "../task-panel/task-panel-side-pane";
import { type EditorHost, HiddenEditor } from "./hidden-editor";
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
  /** The task panel in the wide tier's side pane, showing the selected task. */
  sidePane: React.ComponentType<TaskPanelSidePaneProps>;
  /** The task panel as a popup, for the selected task in the other tiers. */
  openPopup: OpenTaskPanelPopup;
  /** The refresh button beside the navigation. */
  onRefresh: () => void;
  /** The block of the editor the panel hides, so it can write (plugin-panel-writes). */
  editorHost: EditorHost;
  /**
   * The plugin panel became the active panel again (not when it opens: it
   * opens active, and its views read then).
   */
  onActivated: () => void;
}

/** Calls `onActivated` each time `active` turns true after the first render. */
function useActivated(active: boolean, onActivated: () => void) {
  const previous = React.useRef(active);
  React.useEffect(() => {
    if (active && !previous.current) onActivated();
    previous.current = active;
  }, [active, onActivated]);
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

/**
 * Shows the selected task in the popup while `inPopup`: across a tier change
 * the popup and the side pane take over from each other, the task unchanged.
 * Closing the popup (or the task going away) clears the selection; the
 * plugin panel closing takes its popup with it.
 */
function useSelectionPopup(
  openPopup: OpenTaskPanelPopup,
  inPopup: boolean,
  taskId: TaskId | undefined,
  clear: () => void,
) {
  React.useEffect(() => {
    if (!inPopup || taskId === undefined) return;
    return openPopup(taskId, clear);
  }, [openPopup, inPopup, taskId, clear]);
}

/** The panel type's renderer. Each opening starts afresh on the first view. */
export function createNextActionPanel(
  options: NextActionPanelOptions,
): React.ComponentType<PanelProps & Partial<NextActionPanelArgs>> {
  const {
    views,
    sidePane: SidePane,
    openPopup,
    onRefresh,
    onActivated,
    editorHost,
  } = options;

  return function NextActionPanel(props) {
    const root = React.useRef<HTMLDivElement>(null);
    const tier = useTier(root);
    useActivated(props.active, onActivated);
    const list = views.list();
    const [currentId, setCurrentId] = React.useState(list[0]?.id);
    const current = list.find((view) => view.id === currentId) ?? list[0];
    // Only for this opening: nothing is selected when it opens (#42).
    const [selectedTaskId, setSelectedTaskId] = React.useState<TaskId>();
    const clearSelection = React.useCallback(
      () => setSelectedTaskId(undefined),
      [],
    );
    useSelectionPopup(
      openPopup,
      tier !== undefined && tier !== "wide",
      selectedTaskId,
      clearSelection,
    );

    const context = React.useMemo<PanelContextValue | undefined>(
      () =>
        tier && {
          panelId: props.panelId,
          originPanelId: props.originPanelId,
          tier,
          selectedTaskId,
          selectTask: setSelectedTaskId,
        },
      [props.panelId, props.originPanelId, tier, selectedTaskId],
    );

    const View = current?.component;
    return (
      <div className="nextaction-panel" data-tier={tier} ref={root}>
        <HiddenEditor
          panelId={props.panelId}
          active={props.active}
          host={editorHost}
        />
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
                <aside
                  className="nextaction-panel-side"
                  aria-label={t("Task panel")}
                >
                  <SidePane taskId={selectedTaskId} onClose={clearSelection} />
                </aside>
              )}
            </div>
          </PanelContext.Provider>
        )}
      </div>
    );
  };
}
