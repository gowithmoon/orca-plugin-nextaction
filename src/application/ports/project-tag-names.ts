import type { ProjectStatus } from "../../domain/project/project";

/**
 * The names the project tag carries in the notes right now (ADR 0009), for
 * code outside `infra` that has to match what Orca renders (the project
 * status icons, #144). Runtime values, never literals written in that code.
 */
export interface ProjectTagNames {
  /** The project tag's name as it is in the notes. */
  readonly tagName: string;
  /**
   * The project status property and its option names; absent while the
   * property is invalidated (ADR 0008), when every project reads as planning.
   */
  readonly status?: {
    readonly property: string;
    readonly options: Readonly<Record<ProjectStatus, string>>;
  };
}

/** The current project tag names, and word of every change to them. */
export interface ProjectTagNamesSource {
  /** `undefined` while the project tag is paused. */
  current(): ProjectTagNames | undefined;
  /** Calls `listener` after the names may have changed; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}
