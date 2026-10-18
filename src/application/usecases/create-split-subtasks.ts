// Use case: write the subtasks the user confirmed in the "Split into
// subtasks" window (GLOSSARY: 拆分子任务, #202), in one undo.
import { sequentialCycle } from "../../domain/blocking/dependency-cycles";
import type { TaskId } from "../../domain/task/task";
import type { TaskRepository, TaskWrite } from "../ports/task-repository";
import { DependencyCycleError } from "./dependency-cycle-error";

/** What the user confirmed: the subtasks' names in order, and sequential. */
export interface ConfirmedSplit {
  /** As edited in the window; blank ones are left out. */
  readonly titles: readonly string[];
  /** Switch the parent task's sequential on as well (GLOSSARY: 顺序执行). */
  readonly sequential: boolean;
}

/** What writing the split did. `empty`: no name was left, nothing written. */
export type CreateSplitSubtasksResult =
  | { kind: "created"; count: number }
  | { kind: "empty" };

/**
 * Creates the confirmed subtasks of task `parentId`, todo, as its last child
 * blocks in their order, with no 所属项目 of their own (the parent decides
 * it), and switches the parent's sequential on when asked: all in one undo.
 * Names are trimmed; blank ones are skipped. Fails, writing nothing, with
 * `DependencyCycleError` when switching sequential on would make a dependency
 * cycle, or when the parent is not a task or the write fails.
 */
export type CreateSplitSubtasks = (
  parentId: TaskId,
  confirmed: ConfirmedSplit,
) => Promise<CreateSplitSubtasksResult>;

export function createCreateSplitSubtasks(deps: {
  repository: TaskRepository;
}): CreateSplitSubtasks {
  return async (parentId, confirmed) => {
    const titles = confirmed.titles
      .map((title) => title.trim())
      .filter((title) => title !== "");
    if (titles.length === 0) return { kind: "empty" };
    const snapshot = await deps.repository.readTaskGraph();
    const parent = snapshot.tasks.find((item) => item.task.id === parentId);
    if (!parent) throw new Error(`block ${parentId} is not a task`);
    const also: TaskWrite[] = [];
    if (confirmed.sequential && !parent.task.sequential) {
      // The new subtasks depend on nothing and nothing on them: only the
      // existing ones can make a cycle, as when the task panel switches it on.
      const cycle = sequentialCycle(snapshot, parentId);
      if (cycle) {
        const task = (id: TaskId) => ({
          id,
          text:
            snapshot.tasks.find((item) => item.task.id === id)?.task.text ?? "",
        });
        throw new DependencyCycleError({
          kind: "sequential",
          waiting: task(cycle.waiting),
          waitingFor: task(cycle.waitingFor),
        });
      }
      also.push({ id: parentId, changes: { sequential: true } });
    }
    await deps.repository.createTasks(
      { kind: "lastChild", blockId: parentId },
      titles.map((text) => ({ text, status: "todo" })),
      also,
    );
    return { kind: "created", count: titles.length };
  };
}
