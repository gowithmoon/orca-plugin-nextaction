import type { DayBoundary } from "../../domain/time/logical-day";

/**
 * The day boundary the user has set. Read on every use, so a change in the
 * settings applies without restarting the plugin.
 */
export interface DayBoundarySetting {
  current(): DayBoundary;
}
