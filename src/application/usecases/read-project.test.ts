import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createReadProject } from "./read-project";

function setup() {
  const repository = createInMemoryTaskRepository();
  const readProject = createReadProject({ repository });
  return { repository, readProject };
}

describe("read a project", () => {
  it("reads a project with its project status", async () => {
    const { repository, readProject } = setup();
    repository.addProject({ id: 10, text: "Move house", status: "paused" });

    expect(await readProject(10)).toMatchObject({
      id: 10,
      text: "Move house",
      status: "paused",
    });
  });

  it("a block that is not a project reads as none", async () => {
    const { repository, readProject } = setup();
    repository.addBlock(7);
    repository.addTask({ id: 1 });

    expect(await readProject(7)).toBeNull();
    expect(await readProject(1)).toBeNull();
    expect(await readProject(99)).toBeNull();
  });

  it("while the project tag is paused, no block reads as a project", async () => {
    const { repository, readProject } = setup();
    repository.addProject({ id: 10, text: "Move house" });
    repository.pauseProjectTag(true);

    expect(await readProject(10)).toBeNull();
  });
});
