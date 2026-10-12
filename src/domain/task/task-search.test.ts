import { describe, expect, it } from "vitest";
import { matchesSearch } from "./task-search";

describe("search match", () => {
  it("needs every word searched for to appear", () => {
    const task = { text: "Call the plumber", searchText: "" };
    expect(matchesSearch("Call plumber", task)).toBe(true);
    expect(matchesSearch("Call electrician", task)).toBe(false);
  });

  it("ignores case", () => {
    const task = { text: "Call the Plumber", searchText: "" };
    expect(matchesSearch("PLUMBER call", task)).toBe(true);
  });

  it("finds a word in the search text as well as in the task's text", () => {
    // As Orca keeps it: the text with the tag and its property values.
    const task = {
      text: "Call the plumber",
      searchText: "Call the plumber #Task,Todo,Zhang San\n",
    };
    expect(matchesSearch("zhang", task)).toBe(true);
    expect(matchesSearch("plumber zhang", task)).toBe(true);
    expect(matchesSearch("plumber li", task)).toBe(false);
  });

  it("falls back to the task's text when the search text is empty", () => {
    const task = { text: "Call the plumber", searchText: "" };
    expect(matchesSearch("plumber", task)).toBe(true);
    expect(matchesSearch("zhang", task)).toBe(false);
  });

  it("lets every task through when nothing is searched for", () => {
    const task = { text: "", searchText: "" };
    expect(matchesSearch("", task)).toBe(true);
    expect(matchesSearch("  \t ", task)).toBe(true);
  });
});
