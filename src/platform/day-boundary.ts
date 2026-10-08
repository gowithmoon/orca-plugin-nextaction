import type { DayBoundarySetting } from "../application/ports/day-boundary-setting";
import { createSettingsDayBoundary } from "../infra/settings-day-boundary";
import type { FeatureContext } from "./bootstrap";

/**
 * The day boundary for use cases, read from the settings of this load on
 * every use, so a change applies at once.
 */
export function dayBoundaryFrom({
  settings,
}: FeatureContext): DayBoundarySetting {
  return createSettingsDayBoundary(() => settings().dayBoundary);
}
