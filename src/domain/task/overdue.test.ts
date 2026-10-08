import { describe, expect, it } from "vitest";
import { isOverdue } from "./overdue";

const today = { year: 2026, month: 10, day: 8 };

describe("overdue", () => {
  it("is overdue once its due day has ended", () => {
    expect(
      isOverdue(
        { status: "todo", due: { year: 2026, month: 10, day: 7 } },
        today,
      ),
    ).toBe(true);
    // An earlier year counts even though its month and day are later.
    expect(
      isOverdue(
        { status: "inbox", due: { year: 2025, month: 12, day: 31 } },
        today,
      ),
    ).toBe(true);
  });

  it("is not overdue on its due day or before it", () => {
    expect(
      isOverdue(
        { status: "todo", due: { year: 2026, month: 10, day: 8 } },
        today,
      ),
    ).toBe(false);
    expect(
      isOverdue(
        { status: "todo", due: { year: 2026, month: 11, day: 1 } },
        today,
      ),
    ).toBe(false);
  });

  it("is never overdue without a due day", () => {
    expect(isOverdue({ status: "todo", due: null }, today)).toBe(false);
  });

  it("is never overdue once done", () => {
    expect(
      isOverdue(
        { status: "done", due: { year: 2026, month: 10, day: 1 } },
        today,
      ),
    ).toBe(false);
  });
});
