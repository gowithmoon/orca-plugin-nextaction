// What to do when the task tag name changes in the settings (ADR 0002). Pure;
// the settings subscription, debounce and `renameAlias` live in platform.
import type { TaskTagCache } from "./task-tag-cache";

export interface RenameInput {
  /** The task tag in use. */
  current: TaskTagCache;
  /** The raw value now in the settings. */
  requested: unknown;
  /**
   * The block whose alias is the trimmed requested name, if any; looked up by
   * the caller before planning.
   */
  newNameOwner: number | undefined;
}

export type RenamePlan =
  | { kind: "rename"; from: string; to: string }
  /**
   * The settings already hold the current name. Also what the plugin's own
   * write to the settings comes back as (plugin-lifecycle-settings spike).
   */
  | { kind: "none" }
  /** The new name is not allowed: write `tagName` back and tell the user. */
  | { kind: "revert"; reason: "empty"; tagName: string }
  | { kind: "revert"; reason: "taken"; tagName: string; requested: string };

export function planRename(input: RenameInput): RenamePlan {
  const { tagName } = input.current;
  const name =
    typeof input.requested === "string" ? input.requested.trim() : "";
  if (name === tagName) return { kind: "none" };
  if (name === "") return { kind: "revert", reason: "empty", tagName };
  // What renameAlias does onto a name that is already an alias is not
  // measured, so any owner counts, even a second alias of the tag itself.
  if (input.newNameOwner !== undefined) {
    return { kind: "revert", reason: "taken", tagName, requested: name };
  }
  return { kind: "rename", from: tagName, to: name };
}
