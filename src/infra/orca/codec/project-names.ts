// The project tag's names written into notes (ADR 0009, #143). Code uses
// the English keys; names are converted here, as for the task tag (names.ts).
import {
  type ProjectStatus,
  projectStatuses,
} from "../../../domain/project/project";
import { findKey, type NameTable, type NoteLanguage } from "./names";

export const projectPropertyKeys = [
  "status",
  "goal",
  "start",
  "due",
  "importance",
  "urgency",
] as const;
export type ProjectPropertyKey = (typeof projectPropertyKeys)[number];

const projectPropertyNames: NameTable<ProjectPropertyKey> = {
  // Not "状态": a block with both tags shows both, and "状态" alone means a
  // task's status (GLOSSARY: 项目状态).
  status: { zh: "项目状态", en: "Project status" },
  goal: { zh: "目标", en: "Goal" },
  start: { zh: "开始日期", en: "Start" },
  due: { zh: "截止日期", en: "Due" },
  importance: { zh: "重要性", en: "Importance" },
  urgency: { zh: "紧急度", en: "Urgency" },
};

const projectStatusNames: NameTable<ProjectStatus> = {
  planning: { zh: "规划中", en: "Planning" },
  active: { zh: "进行中", en: "Active" },
  paused: { zh: "暂停中", en: "Paused" },
  someday: { zh: "将来/也许", en: "Someday" },
  done: { zh: "已完成", en: "Done" },
};

/** The project tag name used when the settings hold none (ADR 0002). */
export const defaultProjectTagNames: Record<NoteLanguage, string> = {
  zh: "项目",
  en: "Project",
};

export function projectPropertyName(
  key: ProjectPropertyKey,
  language: NoteLanguage,
) {
  return projectPropertyNames[key][language];
}

export function projectStatusName(key: ProjectStatus, language: NoteLanguage) {
  return projectStatusNames[key][language];
}

/** Which project tag property a name stands for, and in which language. */
export function findProjectPropertyKey(name: string) {
  return findKey(projectPropertyNames, projectPropertyKeys, name);
}

/** Which project status option a name stands for, and in which language. */
export function findProjectStatusKey(name: string) {
  return findKey(projectStatusNames, projectStatuses, name);
}
