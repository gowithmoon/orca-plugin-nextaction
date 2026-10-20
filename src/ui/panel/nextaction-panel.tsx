// The plugin panel's shell (GLOSSARY: 插件面板, #35 "插件面板""档位与灵活布局"):
// measures its own width to pick a tier, renders the view navigation, the
// current view and, in the wide tier, the side pane (unless the view does
// without it, as the board does). It knows nothing about
// any view's content. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { NoteCursorSource } from "../../application/ports/note-cursor";
import type { TaskId } from "../../domain/task/task";
import type { PanelProps } from "../../orca.d.ts";
import { t } from "../../shared/l10n/l10n";
import type { MemoryStore } from "../components/memory-store";
import { PanelPopupLayer } from "../components/popup-layer";
import { NoteCursorContext } from "../drag/card-drag";
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
  /**
   * The task panel in the wide tier's side pane, showing the selected task;
   * not while the view does without it (`useWithoutSidePane`).
   */
  sidePane: React.ComponentType<TaskPanelSidePaneProps>;
  /** The task panel as a popup, for the selected task when there is no side pane. */
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
  /** Orca's cursor data in a note panel, for dragging cards into the notes (#122). */
  noteCursors: NoteCursorSource;
  /**
   * A view asked for from outside the plugin panel (#221: "Show in task
   * map"): shown when set, or when the panel opens while it is set, then
   * cleared. Its preset is in the view's own store already.
   */
  viewRequest: MemoryStore<string | null>;
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
 * Shows the selected task in the popup while `inPopup`: a popup open when
 * the side pane comes back (the panel widens into the wide tier, the view
 * stops doing without it) gives way to the side pane, the task
 * unchanged. Closing the popup (or the task going away) clears the
 * selection; the plugin panel closing takes its popup with it.
 */
function useSelectionPopup(
  openPopup: OpenTaskPanelPopup,
  inPopup: boolean,
  taskId: TaskId | undefined,
  clear: () => void,
  select: (taskId: TaskId) => void,
) {
  React.useEffect(() => {
    if (!inPopup || taskId === undefined) return;
    // Picking another task inside the popup selects it: the popup then
    // follows the selection, as for a card.
    return openPopup(taskId, clear, select);
  }, [openPopup, inPopup, taskId, clear, select]);
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
    noteCursors,
    viewRequest,
  } = options;

  return function NextActionPanel(props) {
    const root = React.useRef<HTMLDivElement>(null);
    const tier = useTier(root);
    useActivated(props.active, onActivated);
    const list = views.list();
    const [currentId, setCurrentId] = React.useState(
      () => viewRequest.current() ?? list[0]?.id,
    );
    const current = list.find((view) => view.id === currentId) ?? list[0];
    // Only for this opening: nothing is selected when it opens (#42).
    const [selectedTaskId, setSelectedTaskId] = React.useState<TaskId>();
    /**
     * The task selected when one was opened in the notes from inside the
     * plugin panel: it stays selected, but does not move into the popup when
     * a new note panel narrows the plugin panel. The popup would cover the
     * block the user went to see. Selecting a task again lifts it.
     */
    const [heldFromPopup, setHeldFromPopup] = React.useState<TaskId>();
    /** How many parts of the view do without the side pane right now. */
    const [withoutCount, setWithoutCount] = React.useState(0);
    const withoutSidePane = React.useCallback(() => {
      setWithoutCount((count) => count + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        setWithoutCount((count) => count - 1);
      };
    }, []);
    const sidePane = tier === "wide" && withoutCount === 0;
    // Losing the side pane (narrowing out of the wide tier, opening the
    // board) does not pop the selected task up: a popup the user did not ask
    // for covers the view they were making room for. The task stays selected
    // (and back in the side pane when it returns); selecting a task opens the
    // popup.
    const [shownSidePane, setShownSidePane] = React.useState(sidePane);
    if (sidePane !== shownSidePane) {
      setShownSidePane(sidePane);
      if (!sidePane) setHeldFromPopup(selectedTaskId);
    }
    const selected = React.useRef(selectedTaskId);
    selected.current = selectedTaskId;
    const selectTask = React.useCallback((taskId: TaskId) => {
      setHeldFromPopup(undefined);
      setSelectedTaskId(taskId);
    }, []);
    const clearSelection = React.useCallback(
      () => setSelectedTaskId(undefined),
      [],
    );
    const openedInNotes = React.useCallback(
      () => setHeldFromPopup(selected.current),
      [],
    );
    // Read when called, so the views' context keeps the same `showView`.
    const shownId = React.useRef(current?.id);
    shownId.current = current?.id;
    /**
     * Another view: the selection ends with the view it was made in. The
     * selected task was a card of that view's list; carried over, the new
     * view would keep it as a faded card it never listed, and the side pane
     * would show a task no card in sight is marked for. Unsaved text in the
     * task panel is saved as the form goes away. The navigation and the views
     * (`usePanel().showView`) both switch through it; an unknown view changes
     * nothing.
     */
    const showView = React.useCallback((id: string) => {
      if (id === shownId.current) return;
      if (!views.list().some((view) => view.id === id)) return;
      setHeldFromPopup(undefined);
      setSelectedTaskId(undefined);
      setCurrentId(id);
    }, []);
    const requested = React.useSyncExternalStore(
      viewRequest.subscribe,
      viewRequest.current,
    );
    React.useEffect(() => {
      if (requested === null) return;
      showView(requested);
      viewRequest.set(null);
    }, [requested, showView]);
    /**
     * A navigation item clicked: another view shows; the current one is told
     * it was clicked again (`PanelView.onReselect`), the selection kept.
     */
    const selectFromNavigation = React.useCallback(
      (id: string) => {
        if (id !== shownId.current) return showView(id);
        views
          .list()
          .find((view) => view.id === id)
          ?.onReselect?.();
      },
      [showView],
    );
    useSelectionPopup(
      openPopup,
      tier !== undefined && !sidePane,
      selectedTaskId === heldFromPopup ? undefined : selectedTaskId,
      clearSelection,
      selectTask,
    );

    const context = React.useMemo<PanelContextValue | undefined>(
      () =>
        tier && {
          panelId: props.panelId,
          originPanelId: props.originPanelId,
          tier,
          selectedTaskId,
          selectTask,
          openedInNotes,
          showView,
          withoutSidePane,
        },
      [
        props.panelId,
        props.originPanelId,
        tier,
        selectedTaskId,
        selectTask,
        openedInNotes,
        showView,
        withoutSidePane,
      ],
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
            <NoteCursorContext.Provider value={noteCursors}>
              <PanelPopupLayer>
                <PanelNavigation
                  views={list}
                  currentId={current?.id}
                  onSelect={selectFromNavigation}
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
                  {sidePane && (
                    <aside
                      className="nextaction-panel-side"
                      aria-label={t("Task panel")}
                    >
                      <SidePane
                        taskId={selectedTaskId}
                        onClose={clearSelection}
                        onSelectTask={selectTask}
                      />
                    </aside>
                  )}
                </div>
              </PanelPopupLayer>
            </NoteCursorContext.Provider>
          </PanelContext.Provider>
        )}
      </div>
    );
  };
}
