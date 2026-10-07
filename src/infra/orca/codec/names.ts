// The only place, besides t(), where names written into notes appear
// (ADR 0009). Code uses the English keys; names are converted here.

/** The language of names written into notes, fixed when the tag is created. */
export type NoteLanguage = "zh" | "en";

export const propertyKeys = [
  "status",
  "importance",
  "effort",
  "start",
  "due",
  "context",
  "label",
  "note",
] as const;
export type PropertyKey = (typeof propertyKeys)[number];

export const statusKeys = [
  "inbox",
  "todo",
  "doing",
  "waiting",
  "someday",
  "done",
] as const;
export type StatusKey = (typeof statusKeys)[number];

type NameTable<K extends string> = Record<K, Record<NoteLanguage, string>>;

const propertyNames: NameTable<PropertyKey> = {
  status: { zh: "状态", en: "Status" },
  importance: { zh: "重要性", en: "Importance" },
  effort: { zh: "工作量", en: "Effort" },
  start: { zh: "开始时间", en: "Start" },
  due: { zh: "截止时间", en: "Due" },
  context: { zh: "上下文", en: "Context" },
  label: { zh: "标记", en: "Label" },
  note: { zh: "备注", en: "Notes" },
};

const statusNames: NameTable<StatusKey> = {
  inbox: { zh: "收集箱", en: "Inbox" },
  todo: { zh: "待开始", en: "Todo" },
  doing: { zh: "进行中", en: "Doing" },
  waiting: { zh: "等待中", en: "Waiting" },
  someday: { zh: "将来/也许", en: "Someday" },
  done: { zh: "已完成", en: "Done" },
};

/** The task tag name used when the settings hold none (ADR 0002). */
export const defaultTagNames: Record<NoteLanguage, string> = {
  zh: "任务",
  en: "Task",
};

/**
 * The language for names of things the plugin creates, from Orca's interface
 * locale. Only "zh-CN" has been observed (plugin-lifecycle-settings spike);
 * any other locale is treated as English.
 */
export function noteLanguageFor(locale: string): NoteLanguage {
  return locale.toLowerCase().startsWith("zh") ? "zh" : "en";
}

const languages: readonly NoteLanguage[] = ["zh", "en"];

export interface NameMatch<K extends string> {
  key: K;
  language: NoteLanguage;
}

function findKey<K extends string>(
  table: NameTable<K>,
  keys: readonly K[],
  name: string,
): NameMatch<K> | undefined {
  for (const key of keys) {
    for (const language of languages) {
      if (table[key][language] === name) return { key, language };
    }
  }
  return undefined;
}

export function propertyName(key: PropertyKey, language: NoteLanguage) {
  return propertyNames[key][language];
}

export function statusName(key: StatusKey, language: NoteLanguage) {
  return statusNames[key][language];
}

/** Which plugin property a name in the notes stands for, and in which language. */
export function findPropertyKey(name: string) {
  return findKey(propertyNames, propertyKeys, name);
}

/** Which status option a name in the notes stands for, and in which language. */
export function findStatusKey(name: string) {
  return findKey(statusNames, statusKeys, name);
}
