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
   * in the popup otherwise. Kept for this opening of the plugin panel only.
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
}

export const PanelContext = React.createContext<PanelContextValue | undefined>(
  undefined,
);

/** The enclosing plugin panel. Throws outside one. */
export function usePanel(): PanelContextValue {
  const value = React.useContext(PanelContext);
  if (!value) throw new Error("usePanel must be used inside the plugin panel");
  return value;
}
