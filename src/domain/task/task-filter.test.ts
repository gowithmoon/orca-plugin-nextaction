import { describe, expect, it } from "vitest";
import { filterChoosesAny } from "./task-filter";

const nothing = { values: [], none: false };

describe("filterChoosesAny", () => {
  it("chooses nothing when no dimension is given or every one is empty", () => {
    expect(filterChoosesAny({})).toBe(false);
    expect(
      filterChoosesAny({ contexts: nothing, labels: nothing, importance: [] }),
    ).toBe(false);
  });

  it("chooses something with a value, (None) or an importance level", () => {
    expect(
      filterChoosesAny({ contexts: { values: ["home"], none: false } }),
    ).toBe(true);
    expect(filterChoosesAny({ labels: { values: [], none: true } })).toBe(true);
    expect(filterChoosesAny({ importance: [7] })).toBe(true);
  });
});
