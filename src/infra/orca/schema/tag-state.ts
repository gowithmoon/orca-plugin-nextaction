import type { NoteLanguage, PropertyKey } from "../codec/names";
import type { ProjectPropertyKey } from "../codec/project-names";

/**
 * Where a plugin tag stands after startup; what the code using the tag reads
 * before touching any tagged block. `K` are the tag's property keys. Each tag
 * has its own state (#141).
 *
 * - `ready`: the tag is in use. Properties in `invalidated` conflict with the
 *   plugin's definition (ADR 0008): read them as empty, refuse to write them.
 *   `language` is the language of the names on the tag (ADR 0009).
 * - `paused`: the tag's features are paused; nothing may read or write its
 *   blocks. `starting` until startup finishes; `refused` when a tag of that
 *   name exists, was never taken over here and has conflicting properties;
 *   `failed` when setting up the tag failed.
 */
export type TagState<K extends string> =
  | {
      kind: "ready";
      tagBlockId: number;
      tagName: string;
      language: NoteLanguage;
      invalidated: readonly K[];
    }
  | { kind: "paused"; reason: "starting" | "failed" }
  | {
      kind: "paused";
      reason: "refused";
      tagName: string;
      language: NoteLanguage;
      conflicts: readonly K[];
    };

/** The task tag's state; what the task repository reads. */
export type TaskTagState = TagState<PropertyKey>;

/**
 * The project tag's state (#143). While it is paused every task reads as
 * belonging to no project; task features go on.
 */
export type ProjectTagState = TagState<ProjectPropertyKey>;
