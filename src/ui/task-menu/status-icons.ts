import type { TaskStatus } from "../../domain/task/task";

/**
 * The tabler icon of each status (from the tabler-icons font Orca ships):
 * its class for components that take one (the task menu), and its code point
 * for the status icon style sheet, which draws it with CSS `content`.
 */
export const statusIcons: Record<
  TaskStatus,
  { className: string; codePoint: string }
> = {
  inbox: { className: "ti ti-inbox", codePoint: "\\eac4" },
  todo: { className: "ti ti-circle", codePoint: "\\ea6b" },
  doing: { className: "ti ti-progress", codePoint: "\\fa0d" },
  waiting: { className: "ti ti-hourglass", codePoint: "\\ef93" },
  someday: { className: "ti ti-cloud", codePoint: "\\ea76" },
  done: { className: "ti ti-circle-check", codePoint: "\\ea67" },
};
