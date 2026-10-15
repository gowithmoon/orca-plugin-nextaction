import type { ProjectStatus } from "../../domain/project/project";
import { statusIcons } from "../task-menu/status-icons";

/**
 * The tabler icon of each project status (GLOSSARY: 项目状态图标; #144): the
 * folder family, so it never looks like a task's status icon. Its class for
 * components that take one (the project menu, the project row), its code
 * point for the style sheet that draws it with CSS `content`, and the
 * colour of the task status of the like kind (planning as todo, active as
 * doing, paused as waiting; #140).
 */
export const projectStatusIcons: Record<
  ProjectStatus,
  { className: string; codePoint: string; color: string }
> = {
  planning: {
    className: "ti ti-folder",
    codePoint: "\\eaad",
    color: statusIcons.todo.color,
  },
  active: {
    className: "ti ti-folder-bolt",
    codePoint: "\\f90c",
    color: statusIcons.doing.color,
  },
  paused: {
    className: "ti ti-folder-pause",
    codePoint: "\\f915",
    color: statusIcons.waiting.color,
  },
  someday: {
    className: "ti ti-folder-question",
    codePoint: "\\f917",
    color: statusIcons.someday.color,
  },
  done: {
    className: "ti ti-folder-check",
    codePoint: "\\f90e",
    color: statusIcons.done.color,
  },
};
