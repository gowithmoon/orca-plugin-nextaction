import {
  type ChangeSignal,
  createChangeSignal,
  type Schedule,
} from "../shared/change-signal";
import type { FeatureModule } from "./bootstrap";
import type { Registry } from "./registry";

/** Edits stop for this long before views read again (#35). */
const settleMs = 150;
/** An undo or redo is fully applied only about 2 s later (tag-operations). */
const lateMs = 2000;

/**
 * Editor commands after which tasks may have changed (ADR 0007). Review this
 * list when Orca is upgraded.
 */
const editCommands = [
  "core.editor.setBlocksContent",
  "core.editor.setRefData",
  "core.editor.insertTag",
  "core.editor.removeTag",
  "core.editor.setProperties",
  "core.editor.deleteBlocks",
  "core.editor.moveBlocks",
];
/** Commands whose effect lands after they return (tag-operations). */
const lateCommands = ["core.editor.undo", "core.editor.redo"];

/**
 * The plugin's one task change signal (ADR 0007, #38). The plugin's own
 * writes report to `changes.changed`; this feature adds Orca's after-command
 * hooks. The hooks only say "may have changed": their arguments are not read.
 * Load it before every feature that writes or listens. Verified by hand in
 * Orca (docs/ARCHITECTURE.md §5).
 */
export function createTaskChangesFeature(): {
  feature: FeatureModule;
  changes: ChangeSignal;
} {
  // Timers belong to the current load, so unload clears them. Outside a
  // load nothing is scheduled: no view is open to hear it.
  let registry: Registry | undefined;
  const schedule: Schedule = (fn, ms) =>
    registry ? registry.timeout(fn, ms) : () => {};
  const changes = createChangeSignal({ schedule, settleMs, lateMs });

  const feature: FeatureModule = (context) => {
    const loaded = context.registry;
    registry = loaded;
    // Recorded first, so it is released last: after every hook is gone.
    loaded.add(`${context.pluginName}.taskChanges`, () => {
      if (registry === loaded) registry = undefined;
    });
    const changed = () => changes.changed();
    const changedLate = () => changes.changed({ late: true });
    for (const command of editCommands) loaded.afterCommand(command, changed);
    for (const command of lateCommands) {
      loaded.afterCommand(command, changedLate);
    }
  };
  return { feature, changes };
}
