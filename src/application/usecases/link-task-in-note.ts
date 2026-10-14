// Use case: write a link to a task into the notes (#122 "用例：把任务链接写进笔记"),
// where its card was dropped. Nothing is refused (Orca itself tells of a
// mirror inside its own subtree) and no task relation changes (ADR 0003):
// it only puts a reference or a mirror in the notes.
import type { NoteDropPlan } from "../../domain/blocking/note-drop";
import type { TaskId } from "../../domain/task/task";
import type { NoteTarget, TaskRepository } from "../ports/task-repository";

/** A task card dropped on a block in a note panel. */
export interface NoteLink {
  readonly id: TaskId;
  readonly plan: NoteDropPlan;
  readonly target: NoteTarget;
}

/**
 * Writes the link as `plan` says at `target`, both handed on as they are.
 * Errors are thrown as they are, for `ui` to report.
 */
export type LinkTaskInNote = (link: NoteLink) => Promise<void>;

export function createLinkTaskInNote(deps: {
  repository: TaskRepository;
}): LinkTaskInNote {
  return (link) =>
    deps.repository.linkTaskInNote(link.id, link.plan, link.target);
}
