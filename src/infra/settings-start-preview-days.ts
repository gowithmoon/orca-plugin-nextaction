// StartPreviewDaysSetting on the plugin settings. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import type { StartPreviewDaysSetting } from "../application/ports/start-preview-days-setting";
import { startPreviewDaysFrom } from "../domain/blocking/start-preview-days";

/**
 * Reads the `number` setting through `read` on every call; a value that is
 * not a whole number from 0 to 14 (or no value) reads as 0.
 */
export function createSettingsStartPreviewDays(
  read: () => unknown,
): StartPreviewDaysSetting {
  return {
    current: () => startPreviewDaysFrom(read()),
  };
}
