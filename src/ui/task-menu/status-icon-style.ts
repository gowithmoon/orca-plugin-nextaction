import type { TaskTagNames } from "../../application/ports/task-tag-names";
import type { TaskStatus } from "../../domain/task/task";
import { iconSelector } from "./orca-dom";

/**
 * Tabler icon code points (the `ti-*` classes, from the tabler-icons font
 * Orca ships) and Orca colour variables, per status. Preliminary; tuned
 * after looking at them in Orca (#30).
 */
const icons: Record<TaskStatus, { glyph: string; color: string }> = {
  inbox: { glyph: "\\eac4", color: "var(--orca-color-text-2)" }, // ti-inbox
  todo: { glyph: "\\ea6b", color: "var(--orca-color-text-blue)" }, // ti-circle
  doing: { glyph: "\\fa0d", color: "var(--orca-color-text-yellow)" }, // ti-progress
  // No purple variable has been observed; falls back to the muted colour.
  waiting: {
    glyph: "\\ef93",
    color: "var(--orca-color-text-purple, var(--orca-color-text-2))",
  }, // ti-hourglass
  someday: { glyph: "\\ea76", color: "var(--orca-color-text-2)" }, // ti-cloud
  done: { glyph: "\\ea67", color: "var(--orca-color-text-green)" }, // ti-circle-check
};

const iconRule = (selector: string, status: TaskStatus) =>
  `${selector} {\n  content: "${icons[status].glyph}";\n  color: ${icons[status].color};\n}`;

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
    for (const key of Object.keys(icons) as TaskStatus[]) {
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
