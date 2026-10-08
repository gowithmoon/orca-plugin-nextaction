import type { TaskStatus } from "../../domain/task/task";

/**
 * The tabler icon of each status (from the tabler-icons font Orca ships):
 * its class for components that take one (the task menu, the task card), its
 * code point for the status icon style sheet, which draws it with CSS
 * `content`, and its Orca colour variable, shared by the icon in the notes
 * and in the plugin panel. Colours are preliminary; tuned after looking at
 * them in Orca (#30).
 */
export const statusIcons: Record<
  TaskStatus,
  { className: string; codePoint: string; color: string }
> = {
  inbox: {
    className: "ti ti-inbox",
    codePoint: "\\eac4",
    color: "var(--orca-color-text-2)",
  },
  todo: {
    className: "ti ti-circle",
    codePoint: "\\ea6b",
    color: "var(--orca-color-text-blue)",
  },
  doing: {
    className: "ti ti-progress",
    codePoint: "\\fa0d",
    color: "var(--orca-color-text-yellow)",
  },
  waiting: {
    className: "ti ti-hourglass",
    codePoint: "\\ef93",
    // No purple variable has been observed; falls back to the muted colour.
    color: "var(--orca-color-text-purple, var(--orca-color-text-2))",
  },
  someday: {
    className: "ti ti-cloud",
    codePoint: "\\ea76",
    color: "var(--orca-color-text-2)",
  },
  done: {
    className: "ti ti-circle-check",
    codePoint: "\\ea67",
    color: "var(--orca-color-text-green)",
  },
};
