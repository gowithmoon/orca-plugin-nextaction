import type { TaskStatus } from "../../domain/task/task";

/**
 * The names the task tag carries in the notes right now (ADR 0009), for code
 * outside `infra` that has to match what Orca renders (e.g. the status icons).
 * They are runtime values, never literals written in that code.
 */
export interface TaskTagNames {
  /** The task tag's name as it is in the notes. */
  readonly tagName: string;
  /**
   * The status property and its option names; absent while the property is
   * invalidated (ADR 0008), when every task reads as inbox.
   */
  readonly status?: {
    readonly property: string;
    readonly options: Readonly<Record<TaskStatus, string>>;
  };
}

/** The current task tag names, and word of every change to them. */
export interface TaskTagNamesSource {
  /** `undefined` while task features are paused. */
  current(): TaskTagNames | undefined;
  /** Calls `listener` after the names may have changed; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}
