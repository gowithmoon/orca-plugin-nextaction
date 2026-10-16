import { describe, expect, it } from "vitest";
import {
  findProjectPropertyKey,
  findProjectStatusKey,
  projectPropertyName,
  projectStatusName,
} from "./project-names";

// The table in #140, "项目标签的结构", named as ADR 0009 says.
const propertyTable = [
  ["status", "项目状态", "Project status"],
  ["goal", "目标", "Goal"],
  ["start", "开始日期", "Start"],
  ["due", "截止日期", "Due"],
  ["importance", "重要性", "Importance"],
  ["urgency", "紧急度", "Urgency"],
] as const;

const statusTable = [
  ["planning", "规划中", "Planning"],
  ["active", "进行中", "Active"],
  ["paused", "暂停中", "Paused"],
  ["someday", "将来/也许", "Someday"],
  ["done", "已完成", "Done"],
] as const;

describe("project tag names written into notes", () => {
  it.each(propertyTable)("property %s is %s / %s", (key, zh, en) => {
    expect(projectPropertyName(key, "zh")).toBe(zh);
    expect(projectPropertyName(key, "en")).toBe(en);
    expect(findProjectPropertyKey(zh)).toEqual({ key, language: "zh" });
    expect(findProjectPropertyKey(en)).toEqual({ key, language: "en" });
  });

  it.each(statusTable)("project status %s is %s / %s", (key, zh, en) => {
    expect(projectStatusName(key, "zh")).toBe(zh);
    expect(projectStatusName(key, "en")).toBe(en);
    expect(findProjectStatusKey(zh)).toEqual({ key, language: "zh" });
    expect(findProjectStatusKey(en)).toEqual({ key, language: "en" });
  });

  it("does not take a task tag property name for one of its own", () => {
    expect(findProjectPropertyKey("状态")).toBeUndefined();
    expect(findProjectPropertyKey("Effort")).toBeUndefined();
  });
});
