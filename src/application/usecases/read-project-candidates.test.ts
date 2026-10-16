import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import {
  createReadProjectCandidates,
  matchingProjectCandidates,
} from "./read-project-candidates";

function setup() {
  const repository = createInMemoryTaskRepository();
  const readProjectCandidates = createReadProjectCandidates({ repository });
  return { repository, readProjectCandidates };
}

describe("read project candidates", () => {
  it("offers every project not done, in note order, with its status", async () => {
    const { repository, readProjectCandidates } = setup();
    repository.addProject({ id: 11, text: "Trip", status: "paused" });
    repository.addProject({ id: 10, text: "Move house", status: "active" });
    repository.addProject({ id: 12, text: "Old site", status: "done" });

    expect(await readProjectCandidates()).toEqual([
      { id: 11, text: "Trip", status: "paused" },
      { id: 10, text: "Move house", status: "active" },
    ]);
  });

  it("leaves out the task's own block when it is also a project", async () => {
    const { repository, readProjectCandidates } = setup();
    repository.addTask({ id: 1, text: "Both" });
    repository.addProject({ id: 1 });
    repository.addProject({ id: 10, text: "Move house" });

    const offered = await readProjectCandidates(1);

    expect(offered.map((candidate) => candidate.id)).toEqual([10]);
  });

  it("also offers a done project filled in as the task's, in note order", async () => {
    const { repository, readProjectCandidates } = setup();
    repository.addProject({ id: 11, text: "Trip", status: "active" });
    repository.addProject({ id: 12, text: "Old site", status: "done" });
    repository.addProject({ id: 13, text: "Older site", status: "done" });
    repository.addProject({ id: 10, text: "Move house", status: "planning" });

    expect(await readProjectCandidates(undefined, 12)).toEqual([
      { id: 11, text: "Trip", status: "active" },
      { id: 12, text: "Old site", status: "done" },
      { id: 10, text: "Move house", status: "planning" },
    ]);
  });

  it("matches the candidates by every word of the search, ignoring case", () => {
    const candidates = [
      { id: 10, text: "Move house", status: "active" as const },
      { id: 11, text: "House warming party", status: "planning" as const },
      { id: 12, text: "Year-end trip", status: "someday" as const },
    ];

    expect(
      matchingProjectCandidates(candidates, "house").map((c) => c.id),
    ).toEqual([10, 11]);
    expect(
      matchingProjectCandidates(candidates, "PARTY house").map((c) => c.id),
    ).toEqual([11]);
    expect(
      matchingProjectCandidates(candidates, "  ").map((c) => c.id),
    ).toEqual([10, 11, 12]);
  });
});
