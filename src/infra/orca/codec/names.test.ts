import { describe, expect, it } from "vitest";
import {
  findPropertyKey,
  findStatusKey,
  noteLanguageFor,
  propertyName,
  statusName,
} from "./names";

// The table in spec #16, "写进笔记的名称".
const propertyTable = [
  ["status", "状态", "Status"],
  ["importance", "重要性", "Importance"],
  ["effort", "工作量", "Effort"],
  ["start", "开始日期", "Start"],
  ["due", "截止日期", "Due"],
  ["context", "上下文", "Context"],
  ["label", "标记", "Label"],
  ["note", "备注", "Notes"],
] as const;

const statusTable = [
  ["inbox", "收集箱", "Inbox"],
  ["todo", "待开始", "Todo"],
  ["doing", "进行中", "Doing"],
  ["waiting", "等待中", "Waiting"],
  ["someday", "将来/也许", "Someday"],
  ["done", "已完成", "Done"],
] as const;

describe("names written into notes", () => {
  it.each(propertyTable)("property %s is %s / %s", (key, zh, en) => {
    expect(propertyName(key, "zh")).toBe(zh);
    expect(propertyName(key, "en")).toBe(en);
    expect(findPropertyKey(zh)).toEqual({ key, language: "zh" });
    expect(findPropertyKey(en)).toEqual({ key, language: "en" });
  });

  it.each(statusTable)("status option %s is %s / %s", (key, zh, en) => {
    expect(statusName(key, "zh")).toBe(zh);
    expect(statusName(key, "en")).toBe(en);
    expect(findStatusKey(zh)).toEqual({ key, language: "zh" });
    expect(findStatusKey(en)).toEqual({ key, language: "en" });
  });

  it.each([
    ["zh-CN", "zh"],
    ["zh", "zh"],
    ["en", "en"],
    ["en-US", "en"],
    ["ja", "en"],
  ] as const)(
    "interface locale %s names new things in %s",
    (locale, language) => {
      expect(noteLanguageFor(locale)).toBe(language);
    },
  );

  it("does not recognise names outside the table", () => {
    expect(findPropertyKey("Note")).toBeUndefined();
    expect(findPropertyKey("状态 ")).toBeUndefined();
    expect(findStatusKey("Cancelled")).toBeUndefined();
  });
});
