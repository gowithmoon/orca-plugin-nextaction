import { describe, expect, it } from "vitest";
import { taskSearchFilter } from "./task-search-filter";

describe("task search filter", () => {
  it("finds a task by a word only in its option label, as Orca's default match did", () => {
    // A page task: no text, its label is its alias (shownText).
    const candidates = [{ id: 7, text: "", searchText: "" }];
    const options = [{ value: "7", label: "Quarterly report" }];

    const found = taskSearchFilter(candidates, options)("quarterly");

    expect(found).toEqual([{ value: "7", label: "Quarterly report" }]);
  });

  it("still finds a task by its text and search text, and leaves out the rest", () => {
    const candidates = [
      { id: 1, text: "Call the bank", searchText: "" },
      { id: 2, text: "Water plants", searchText: "garden" },
    ];
    const options = [
      { value: "1", label: "Call the bank" },
      { value: "2", label: "Water plants" },
    ];

    expect(taskSearchFilter(candidates, options)("garden")).toEqual([
      { value: "2", label: "Water plants" },
    ]);
  });
});
