import type { ProjectTagNames } from "../../../application/ports/project-tag-names";
import {
  type ProjectStatus,
  projectStatuses,
} from "../../../domain/project/project";
import { projectPropertyName, projectStatusName } from "../codec/project-names";
import type { ProjectTagState } from "./tag-state";

/**
 * The names the project tag carries in the notes for a given tag state
 * (#144): none while paused, no project status names while that property is
 * invalidated (it then reads as planning, as in the codec).
 */
export function projectTagNamesFor(
  state: ProjectTagState,
): ProjectTagNames | undefined {
  if (state.kind !== "ready") return undefined;
  const { tagName, language } = state;
  if (state.invalidated.includes("status")) return { tagName };
  return {
    tagName,
    status: {
      property: projectPropertyName("status", language),
      options: Object.fromEntries(
        projectStatuses.map((key) => [key, projectStatusName(key, language)]),
      ) as Record<ProjectStatus, string>,
    },
  };
}
