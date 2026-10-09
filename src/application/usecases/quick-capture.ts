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
 * with the `initial` properties given; blank text writes nothing, properties
 * or not. Errors are thrown as they are, for `ui` to report.
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
      initial,
    );
    return { kind: "captured", id };
  };
}
