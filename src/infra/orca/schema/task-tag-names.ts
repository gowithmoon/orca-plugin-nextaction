import type { TaskTagNames } from "../../../application/ports/task-tag-names";
import { taskStatuses } from "../../../domain/task/task";
import { propertyName, statusName } from "../codec/names";
import type { TaskTagState } from "./task-tag-state";

/**
 * The names the tag carries in the notes for a given tag state: none while
 * paused, no status names while the status property is invalidated (it then
 * reads as inbox, as in the codec).
 */
export function taskTagNamesFor(state: TaskTagState): TaskTagNames | undefined {
  if (state.kind !== "ready") return undefined;
  const { tagName, language } = state;
  if (state.invalidated.includes("status")) return { tagName };
  return {
    tagName,
    status: {
      property: propertyName("status", language),
      options: Object.fromEntries(
        taskStatuses.map((key) => [key, statusName(key, language)]),
      ) as Record<(typeof taskStatuses)[number], string>,
    },
  };
}
