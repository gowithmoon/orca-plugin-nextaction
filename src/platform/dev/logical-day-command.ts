// Development builds only (#28): a command that prints the day boundary and
// the current logical day to the console, to check the setting by hand until
// a use case reads it.
import type { Clock } from "../../application/ports/clock";
import type { DayBoundarySetting } from "../../application/ports/day-boundary-setting";
import { logicalDay } from "../../domain/time/logical-day";
import { t } from "../../shared/l10n/l10n";
import type { Registry } from "../registry";

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Registers `<pluginName>.debug.currentLogicalDay`. Run it from the command
 * palette, or from the console:
 * `orca.commands.invokeCommand("<pluginName>.debug.currentLogicalDay")`.
 */
export function registerLogicalDayCommand(
  registry: Registry,
  dayBoundary: DayBoundarySetting,
  clock: Clock,
): void {
  registry.command(
    "debug.currentLogicalDay",
    () => {
      const boundary = dayBoundary.current();
      const day = logicalDay(clock.now(), boundary);
      console.log(
        `[nextaction] day boundary ${boundary.hours}:${pad(boundary.minutes)}, logical day ${day.year}-${pad(day.month)}-${pad(day.day)}`,
      );
    },
    t("Print the current logical day (debug)"),
  );
}
