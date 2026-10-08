// What every part of an open plugin panel can know about it.
import * as React from "react";
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
