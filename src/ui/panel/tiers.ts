// Layout tiers of the plugin panel (#35 "档位与灵活布局"). The panel measures
// its own width; the tier switches structure (navigation form, side pane).
// Thresholds are tuned after use in Orca; changing them is not a design change.

export type PanelTier = "narrow" | "medium" | "wide";

/** Widths in px: below `medium` is narrow, from `wide` on is wide. */
export const panelTierWidths = { medium: 520, wide: 720 } as const;

/** The wide tier's side pane: a share of the panel's width, within bounds (px). */
export const sidePaneWidth = { ratio: 0.42, min: 300, max: 440 } as const;

export function tierForWidth(width: number): PanelTier {
  if (width < panelTierWidths.medium) return "narrow";
  if (width < panelTierWidths.wide) return "medium";
  return "wide";
}
