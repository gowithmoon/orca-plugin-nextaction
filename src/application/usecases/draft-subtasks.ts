// Use case: draft the subtasks of a task with the AI (GLOSSARY: 拆分子任务,
// #202). The AI may ask once first; what it gives is a draft for the user
// to edit in the window, nothing is written here (ADR 0026).

import type { TaskId, TaskStatus } from "../../domain/task/task";
import {
  type AiStart,
  nonBlank,
  type Parsed,
  startDraft,
  type ToolSpec,
} from "../ai/conversation";
import { outlineText, withoutTasks } from "../ai/outline-text";
import type { ReadPromptContext } from "../ai/prompt-context";
import {
  proposeSubtasksTool,
  type SplitMaterial,
  splitMessages,
} from "../ai/prompts";
import type { AiChat } from "../ports/ai-chat";
import type { TaskRepository } from "../ports/task-repository";
import { createReadProjectOfTask } from "./read-project-of-task";

/** One subtask the AI drafted. */
export interface SubtaskDraftItem {
  readonly title: string;
  /** Why the AI is unsure about it; absent when it is sure. */
  readonly uncertain?: string;
}

/** The AI's draft for the window to show and the user to edit. */
export interface SubtaskDraft {
  /** In the suggested order of doing them; may be empty. */
  readonly items: readonly SubtaskDraftItem[];
  /** Why the task need not be split further; absent when it should be. */
  readonly notSplittable?: string;
}

/**
 * Asks the AI for a draft of task `id`'s subtasks. Fails, having written
 * nothing, when the block is not a task, with `AiDraftFailedError` when the
 * AI gives nothing usable after the retries, `AiRequestFailedError` when a
 * request gets no reply, and `AiCancelledError` once `signal` aborts.
 */
export type DraftSubtasks = (
  id: TaskId,
  signal: AbortSignal,
) => Promise<AiStart<SubtaskDraft>>;

/** Status names as the AI reads them. */
const statusText: Record<TaskStatus, string> = {
  inbox: "inbox",
  todo: "to do",
  doing: "doing",
  waiting: "waiting",
  someday: "someday",
  done: "done",
};

/** `propose_subtasks`' arguments (#201 拆分子任务). */
export function parseSubtaskDraft(args: unknown): Parsed<SubtaskDraft> {
  const record =
    typeof args === "object" && args !== null
      ? (args as Record<string, unknown>)
      : {};
  if (!Array.isArray(record.items)) {
    return { ok: false, reason: "items must be an array" };
  }
  const items: SubtaskDraftItem[] = [];
  for (const item of record.items) {
    const fields =
      typeof item === "object" && item !== null
        ? (item as Record<string, unknown>)
        : {};
    const title = nonBlank(fields.title);
    if (title === undefined) {
      return {
        ok: false,
        reason: "every item needs a title that is not empty",
      };
    }
    const uncertain = nonBlank(fields.uncertain);
    items.push({ title, ...(uncertain !== undefined && { uncertain }) });
  }
  const notSplittable = nonBlank(record.notSplittable);
  if (items.length === 0 && notSplittable === undefined) {
    return {
      ok: false,
      reason: "give at least one item, or say in notSplittable why not",
    };
  }
  return {
    ok: true,
    value: { items, ...(notSplittable !== undefined && { notSplittable }) },
  };
}

const proposeSpec: ToolSpec<SubtaskDraft> = {
  tool: proposeSubtasksTool,
  parse: parseSubtaskDraft,
};

export function createDraftSubtasks(deps: {
  repository: TaskRepository;
  chat: AiChat;
  /** Today, the interface language and the AI instructions, per request. */
  promptContext: ReadPromptContext;
}): DraftSubtasks {
  const readProjectOfTask = createReadProjectOfTask(deps);

  const material = async (id: TaskId): Promise<SplitMaterial> => {
    const { tasks } = await deps.repository.readTaskGraph();
    const self = tasks.find((item) => item.task.id === id);
    if (!self) throw new Error(`block ${id} is not a task`);
    const outline = await deps.repository.readOutline(id);
    const parent = tasks.find((item) => item.task.id === self.parentId);
    const subtasks = tasks
      .filter((item) => item.parentId === id)
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        text: item.task.text,
        status: statusText[item.task.status],
      }));
    const { project } = await readProjectOfTask(id);
    const goal =
      project && (await deps.repository.getProject(project.id))?.goal;
    return {
      task: self.task.text,
      content: outlineText(withoutTasks(outline?.children ?? [])),
      subtasks,
      parentTask: parent ? parent.task.text : null,
      project: project ? { text: project.text, goal: goal ?? null } : null,
    };
  };

  return async (id, signal) => {
    const split = await material(id);
    const context = await deps.promptContext();
    return startDraft(
      deps.chat,
      splitMessages(split, context),
      proposeSpec,
      signal,
    );
  };
}
