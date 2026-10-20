import { describe, expect, it } from "vitest";
import { type MapDropOver, mapDrop } from "./map-drop";

// Task 4's card at 100, 200, 240 wide, 60 high, in a plain column.
const card: MapDropOver = {
  task: 4,
  rect: { x: 100, y: 200, width: 240, height: 60 },
  inSequence: false,
};
const inChain: MapDropOver = { ...card, inSequence: true };

describe("task map drop", () => {
  it("in a plain column, puts the task before a card dropped near its top", () => {
    expect(mapDrop(7, { x: 300, y: 210 }, card)).toEqual({
      id: 7,
      target: 4,
      placement: "before",
    });
  });

  it("in a plain column, puts the task after a card dropped near its bottom, wherever across it", () => {
    expect(mapDrop(7, { x: 110, y: 250 }, card)).toEqual({
      id: 7,
      target: 4,
      placement: "after",
    });
  });

  it("makes the task the last subtask of a card dropped on its middle", () => {
    expect(mapDrop(7, { x: 110, y: 230 }, card)).toEqual({
      id: 7,
      target: 4,
      placement: "lastChild",
    });
  });

  it("in a sequential chain, puts the task before a card dropped near its left edge, wherever up or down", () => {
    expect(mapDrop(7, { x: 110, y: 255 }, inChain)).toEqual({
      id: 7,
      target: 4,
      placement: "before",
    });
  });

  it("in a sequential chain, puts the task after a card dropped near its right edge", () => {
    expect(mapDrop(7, { x: 330, y: 205 }, inChain)).toEqual({
      id: 7,
      target: 4,
      placement: "after",
    });
  });

  it("in a sequential chain, makes the task the last subtask of a card dropped near its top or bottom but not its sides", () => {
    expect(mapDrop(7, { x: 220, y: 202 }, inChain)).toEqual({
      id: 7,
      target: 4,
      placement: "lastChild",
    });
  });

  it("keeps the edges of a tall parent task's box narrow: well inside it, the task becomes its last subtask", () => {
    const box: MapDropOver = {
      task: 3,
      rect: { x: 0, y: 0, width: 300, height: 400 },
      inSequence: false,
    };
    expect(mapDrop(7, { x: 50, y: 40 }, box)).toEqual({
      id: 7,
      target: 3,
      placement: "lastChild",
    });
    expect(mapDrop(7, { x: 50, y: 10 }, box)).toEqual({
      id: 7,
      target: 3,
      placement: "before",
    });
    expect(mapDrop(7, { x: 50, y: 392 }, box)).toEqual({
      id: 7,
      target: 3,
      placement: "after",
    });
  });
});
