// Use case: the projects offered as a task's 所属项目 (#146, GLOSSARY: 所属项目):
// every project not done, with its project status for its icon, matched by
// the words searched for. The task panel offers them; quick capture (#151)
// offers the same.
import type { ProjectId, ProjectStatus } from "../../domain/project/project";
import type { TaskId } from "../../domain/task/task";
import { matchesSearch } from "../../domain/task/task-search";
import type { TaskRepository } from "../ports/task-repository";

/** A project that can be picked as a task's 所属项目. */
export interface ProjectCandidate {
  readonly id: ProjectId;
  /** As the notes hold it; may be empty. */
  readonly text: string;
  readonly status: ProjectStatus;
}

/**
 * The project candidates, in note order, from one read: none done, and not
 * the block of task `id` (a block both task and project is not its own
 * task's project, ADR 0025). Errors are thrown as they are.
 */
export type ReadProjectCandidates = (
  id?: TaskId,
) => Promise<ProjectCandidate[]>;

export function createReadProjectCandidates(deps: {
  repository: TaskRepository;
}): ReadProjectCandidates {
  return async (id) => {
    const snapshot = await deps.repository.readTaskGraph();
    return [...(snapshot.projects ?? [])]
      .filter(
        (item) => item.project.status !== "done" && item.project.id !== id,
      )
      .sort((a, b) => a.position - b.position)
      .map(({ project }) => ({
        id: project.id,
        text: project.text,
        status: project.status,
      }));
  };
}

/**
 * The candidates whose text holds every word of `search`, ignoring case, as
 * a task is searched for (`matchesSearch`); all of them for no words.
 */
export function matchingProjectCandidates<C extends ProjectCandidate>(
  candidates: readonly C[],
  search: string,
): C[] {
  return candidates.filter((candidate) =>
    matchesSearch(search, { text: candidate.text, searchText: "" }),
  );
}
