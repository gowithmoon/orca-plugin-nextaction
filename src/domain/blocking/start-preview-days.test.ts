import { describe, expect, it } from "vitest";
import { startPreviewDaysFrom } from "./start-preview-days";

describe("startPreviewDaysFrom", () => {
  it("keeps a whole number of days from 0 to 14", () => {
    expect(startPreviewDaysFrom(0)).toBe(0);
    expect(startPreviewDaysFrom(3)).toBe(3);
    expect(startPreviewDaysFrom(14)).toBe(14);
  });

  it("reads anything else as 0: not a whole number, out of range, or empty", () => {
    for (const value of [
      1.5,
      -1,
      15,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "3",
      "",
      null,
      undefined,
    ]) {
      expect(startPreviewDaysFrom(value)).toBe(0);
    }
  });
});
