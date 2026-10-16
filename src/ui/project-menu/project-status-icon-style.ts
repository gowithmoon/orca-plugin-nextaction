import type { ProjectTagNames } from "../../application/ports/project-tag-names";
import {
  type ProjectStatus,
  projectStatuses,
} from "../../domain/project/project";
import { iconSelector } from "../task-menu/orca-dom";
import { iconFontDeclarations } from "../task-menu/status-icon-style";
import { projectStatusIcons } from "./project-status-icons";

const iconRule = (selector: string, status: ProjectStatus) =>
  `${selector} {\n  content: "${projectStatusIcons[status].codePoint}";\n  color: ${projectStatusIcons[status].color};\n}`;

/**
 * The style sheet for the project status icons (#144), built as the status
 * icons' is: a base rule draws planning on every block with the project tag,
 * one rule per project status overrides it, so an empty or unknown project
 * status shows as planning, as the plugin reads it. A block that also
 * carries the task tag (`taskTagName`, while task features run) is left to
 * the status icon: it shows the task's.
 */
export function projectStatusIconCss(
  names: ProjectTagNames,
  taskTagName: string | undefined,
): string {
  const base = iconSelector(names.tagName, undefined, taskTagName);
  const rules = [
    `${base} {\n${iconFontDeclarations}\n}`,
    iconRule(base, "planning"),
  ];
  const status = names.status;
  if (status) {
    for (const key of projectStatuses) {
      if (key === "planning") continue;
      const selector = iconSelector(
        names.tagName,
        { property: status.property, value: status.options[key] },
        taskTagName,
      );
      rules.push(iconRule(selector, key));
    }
  }
  return rules.join("\n\n");
}
