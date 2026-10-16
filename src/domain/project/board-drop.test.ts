import { describe, expect, it } from "vitest";
import { boardStatusDrop } from "./board-drop";

describe("boardStatusDrop", () => {
  it("changes the status to the column's when the task is in another status", () => {
    expect(boardStatusDrop("todo", "doing")).toEqual({
      kind: "status",
      status: "doing",
    });
  });

  it("writes nothing when the task already has the column's status", () => {
    expect(boardStatusDrop("waiting", "waiting")).toBeNull();
  });

  it("changes a done task back to an open status", () => {
    expect(boardStatusDrop("done", "inbox")).toEqual({
      kind: "status",
      status: "inbox",
    });
  });
});
