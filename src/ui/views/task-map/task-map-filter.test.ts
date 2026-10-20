import { describe, expect, it } from "vitest";
import type { TaskMapEndpoint } from "../../../application/usecases/read-task-map";
import {
  chosenTaskMapFilters,
  endpointMarkers,
  noTaskMapFilter,
  revealed,
} from "./task-map-filter";

describe("revealing an endpoint's other end", () => {
  it("adds its area to the areas chosen and shows done tasks, taking nothing away", () => {
    const input = { ...noTaskMapFilter, projects: [1], showUnrelated: true };

    expect(
      revealed(input, [{ kind: "area", area: "none" }, { kind: "showDone" }]),
    ).toEqual({ projects: [1, "none"], showDone: true, showUnrelated: true });
  });

  it("adds no area while every area shows, nor one already chosen", () => {
    expect(
      revealed(noTaskMapFilter, [{ kind: "area", area: 3 }]).projects,
    ).toEqual([]);
    expect(
      revealed({ ...noTaskMapFilter, projects: [3] }, [
        { kind: "area", area: 3 },
      ]).projects,
    ).toEqual([3]);
  });
});

describe("the task map filter's count", () => {
  it("counts the project filter and each toggle turned on", () => {
    expect(chosenTaskMapFilters(noTaskMapFilter)).toBe(0);
    expect(
      chosenTaskMapFilters({
        projects: ["none"],
        showDone: true,
        showUnrelated: true,
      }),
    ).toBe(3);
  });
});

describe("endpoint markers", () => {
  it("groups the endpoints by the node they are on, then by side, in read order", () => {
    const endpoint = (at: number, side: "in" | "out", other: number) =>
      ({
        at,
        side,
        other: { id: other, text: "" },
        reveal: [{ kind: "showDone" }],
      }) satisfies TaskMapEndpoint;
    const a = endpoint(1, "in", 5);
    const b = endpoint(2, "out", 6);
    const c = endpoint(1, "in", 7);
    const d = endpoint(1, "out", 8);

    const markers = endpointMarkers([a, b, c, d]);

    expect(markers.get(1)).toEqual({ in: [a, c], out: [d] });
    expect(markers.get(2)).toEqual({ in: [], out: [b] });
    expect(markers.has(3)).toBe(false);
  });
});
