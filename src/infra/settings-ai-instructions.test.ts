import { describe, expect, it } from "vitest";
import { createSettingsAiInstructions } from "./settings-ai-instructions";

const readAs = (value: unknown) =>
  createSettingsAiInstructions(() => value).current();

describe("the AI instructions block setting", () => {
  it.each([
    ["a block ID", "123", 123],
    ["a block ID in a block reference", "((123))", 123],
    ["a block ID with spaces around it", "  123 ", 123],
    ["a block reference with spaces around it", " ((45))  ", 45],
  ])("reads %s", (_, value, id) => {
    expect(readAs(value)).toBe(id);
  });

  it.each([
    ["no value", undefined],
    ["an empty value", ""],
    ["only spaces", "   "],
    ["a number that is not a string", 123],
    ["words", "my instructions"],
    ["an ID followed by words", "123 abc"],
    ["a reference left open", "((123"],
    ["a reference with one bracket", "(123)"],
    ["a negative number", "-5"],
    ["a decimal", "1.5"],
    ["zero", "0"],
    ["two IDs", "12 34"],
  ])("reads %s as not set", (_, value) => {
    expect(readAs(value)).toBeNull();
  });
});
