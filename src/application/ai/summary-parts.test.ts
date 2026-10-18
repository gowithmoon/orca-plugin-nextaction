import { describe, expect, it } from "vitest";
import { summaryParts } from "./summary-parts";

describe("summary parts", () => {
  it("reads each part's name line and the list items below it", () => {
    expect(
      summaryParts(
        "This period\n- You finished **two** tasks.\n- You skipped one.\nWorth noting\n- Pay the rent is overdue",
      ),
    ).toEqual([
      {
        heading: "This period",
        items: ["You finished **two** tasks.", "You skipped one."],
      },
      { heading: "Worth noting", items: ["Pay the rent is overdue"] },
    ]);
  });

  it("ignores blank lines, between parts and at the ends", () => {
    expect(
      summaryParts("\n  \nThis period\n\n- One\n   \nWorth noting\n- Two\n\n"),
    ).toEqual([
      { heading: "This period", items: ["One"] },
      { heading: "Worth noting", items: ["Two"] },
    ]);
  });

  it("puts items written before any part name into a part with no name", () => {
    expect(summaryParts("- One\n- Two\nWorth noting\n- Three")).toEqual([
      { heading: "", items: ["One", "Two"] },
      { heading: "Worth noting", items: ["Three"] },
    ]);
  });

  it("takes items marked with * or • as well as -, and indented ones", () => {
    expect(summaryParts("This period\n* One\n  • Two\n\t- Three")).toEqual([
      { heading: "This period", items: ["One", "Two", "Three"] },
    ]);
  });

  it("drops an item left empty, such as a lone - the user left while editing", () => {
    expect(summaryParts("This period\n- One\n- \n-\n•")).toEqual([
      { heading: "This period", items: ["One"] },
    ]);
  });
});
