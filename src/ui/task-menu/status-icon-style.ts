import type { TaskTagNames } from "../../application/ports/task-tag-names";
import type { TaskStatus } from "../../domain/task/task";
import { iconSelector } from "./orca-dom";
import { statusIcons } from "./status-icons";

/**
 * Orca colour variables per status, for the icons in `statusIcons`.
 * Preliminary; tuned after looking at them in Orca (#30).
 */
const colors: Record<TaskStatus, string> = {
  inbox: "var(--orca-color-text-2)",
  todo: "var(--orca-color-text-blue)",
  doing: "var(--orca-color-text-yellow)",
  // No purple variable has been observed; falls back to the muted colour.
  waiting: "var(--orca-color-text-purple, var(--orca-color-text-2))",
  someday: "var(--orca-color-text-2)",
  done: "var(--orca-color-text-green)",
};

const iconRule = (selector: string, status: TaskStatus) =>
  `${selector} {\n  content: "${statusIcons[status].codePoint}";\n  color: ${colors[status]};\n}`;

/**
 * The style sheet for the status icons. A base rule draws the inbox icon on
 * every block with the task tag; one rule per status overrides it, so an
 * empty or unknown status shows as inbox, as the plugin reads it. Without
 * status names (the property is invalidated) every task shows as inbox.
 */
export function statusIconCss(names: TaskTagNames): string {
  const base = iconSelector(names.tagName);
  const rules = [
    `${base} {
  font-family: "tabler-icons";
  font-style: normal;
  font-weight: normal;
  font-variant: normal;
  text-transform: none;
  -webkit-font-smoothing: antialiased;
  display: inline-block;
  line-height: 1;
  margin-right: var(--orca-spacing-md);
  font-size: calc(.25rem + var(--orca-block-line-height) / var(--orca-lineheight-md));
  translate: 0 .125rem;
}`,
    iconRule(base, "inbox"),
  ];
  const status = names.status;
  if (status) {
    for (const key of Object.keys(statusIcons) as TaskStatus[]) {
      if (key === "inbox") continue;
      const selector = iconSelector(names.tagName, {
        property: status.property,
        value: status.options[key],
      });
      rules.push(iconRule(selector, key));
    }
  }
  return rules.join("\n\n");
}
