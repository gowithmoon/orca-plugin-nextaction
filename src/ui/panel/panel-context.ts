// What every part of an open plugin panel can know about it.
import * as React from "react";
import type { TaskId } from "../../domain/task/task";
import type { PanelTier } from "./tiers";

export interface PanelContextValue {
  /** The plugin panel's own Orca panel ID. */
  readonly panelId: string;
  /**
   * The panel the plugin panel was opened from: never the covered one. It may
   * have been closed or navigated elsewhere since.
   */
  readonly originPanelId: string | undefined;
  readonly tier: PanelTier;
  /**
   * The task open in the task panel (#42): in the side pane in the wide tier,
   * in the popup otherwise or while a part of the view does without the side
   * pane (`useWithoutSidePane`). Kept for this opening of the plugin panel
   * only.
   */
  readonly selectedTaskId: TaskId | undefined;
  /** Opens task `taskId` in the task panel, replacing the one selected. */
  readonly selectTask: (taskId: TaskId) => void;
  /**
   * A task was opened in the notes from inside the plugin panel (a card, the
   * side pane): the selection stays, but does not move into the popup if the
   * plugin panel narrows now. The popup would cover the block.
   */
  readonly openedInNotes: () => void;
  /**
   * Shows the view registered as `viewId`, as its navigation item does: the
   * selection ends with the view it was made in. The current view or an
   * unknown one changes nothing. A view that jumps with a preset sets it in
   * the target view's store first (`showOnlyStatus`, `openFullReviewStep`).
   */
  readonly showView: (viewId: string) => void;
  /**
   * Hides the side pane, even in the wide tier, until the returned function
   * is called: the selected task shows in the popup instead. Each call counts;
   * the pane comes back once all are released.
   */
  readonly withoutSidePane: () => () => void;
}

export const PanelContext = React.createContext<PanelContextValue | undefined>(
  undefined,
);

/**
 * While `active`, the plugin panel shows no side pane: for layouts that need
 * the width (the board, later the Gantt chart), whose tasks open in the
 * popup. Released before paint, so the pane never flashes in.
 */
export function useWithoutSidePane(active: boolean): void {
  const { withoutSidePane } = usePanel();
  React.useLayoutEffect(
    () => (active ? withoutSidePane() : undefined),
    [active, withoutSidePane],
  );
}

/** The enclosing plugin panel. Throws outside one. */
export function usePanel(): PanelContextValue {
  const value = React.useContext(PanelContext);
  if (!value) throw new Error("usePanel must be used inside the plugin panel");
  return value;
}
