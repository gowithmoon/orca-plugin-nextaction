// Use case: quick capture (GLOSSARY: 快速捕获).

import type { TaskId } from "../../domain/task/task";
import type { Clock } from "../ports/clock";
import type {
  InitialProperties,
  TaskRepository,
} from "../ports/task-repository";

/** What a quick capture did. `empty`: the text was blank, nothing written. */
export type QuickCaptureResult =
  | { kind: "captured"; id: TaskId }
  | { kind: "empty" };

/**
 * Creates an inbox task from `text` (trimmed) at the end of today's journal,
 * with the `initial` properties given, in one undo; blank text writes nothing,
 * properties or not. A 所属项目 (#151) that is no longer a project is left
 * out, as the task panel does (set-project-of-task). Errors are thrown as
 * they are, for `ui` to report; a failed write leaves no task.
 */
export type QuickCapture = (
  text: string,
  initial?: InitialProperties,
) => Promise<QuickCaptureResult>;

export function createQuickCapture(deps: {
  repository: TaskRepository;
  clock: Clock;
}): QuickCapture {
  return async (text, initial) => {
    const trimmed = text.trim();
    if (trimmed === "") return { kind: "empty" };
    const id = await deps.repository.appendTaskToJournal(
      trimmed,
      deps.clock.now(),
      await withProjectStillThere(deps.repository, initial),
    );
    return { kind: "captured", id };
  };
}

/** `initial` without its project when that block is no longer a project. */
async function withProjectStillThere(
  repository: TaskRepository,
  initial: InitialProperties | undefined,
): Promise<InitialProperties | undefined> {
  if (initial?.project === undefined) return initial;
  const { projects = [] } = await repository.readTaskGraph();
  if (projects.some((item) => item.project.id === initial.project)) {
    return initial;
  }
  const { project: _gone, ...rest } = initial;
  return rest;
}
