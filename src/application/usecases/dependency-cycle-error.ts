// The write would make a dependency cycle (GLOSSARY: 循环依赖, #60), so it
// was refused: thrown by setting dependencies and by switching sequential on.
import type { TaskId } from "../../domain/task/task";

/** A task the refusal names, with its text for the notice. */
export interface CycleTask {
  readonly id: TaskId;
  /** As the notes hold it; may be empty. */
  readonly text: string;
}

/** What the refused write would have made wait for what. */
export type RefusedCycle =
  /** Depending on `targets` (in the order given) would make a cycle. */
  | { readonly kind: "dependencies"; readonly targets: readonly CycleTask[] }
  /**
   * Turning sequential on would make `waiting` (a later subtask, or a task
   * below one) wait for the earlier subtask `waitingFor`, which already waits
   * for it.
   */
  | {
      readonly kind: "sequential";
      readonly waiting: CycleTask;
      readonly waitingFor: CycleTask;
    };

/** Nothing was written; `ui` tells the user why. */
export class DependencyCycleError extends Error {
  override name = "DependencyCycleError";

  constructor(readonly cycle: RefusedCycle) {
    super("The change would make a dependency cycle");
  }
}
