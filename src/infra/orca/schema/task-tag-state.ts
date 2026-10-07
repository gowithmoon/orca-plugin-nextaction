import type { NoteLanguage, PropertyKey } from "../codec/names";

/**
 * Where the task tag stands after startup; what the task repository reads
 * before touching any task.
 *
 * - `ready`: the tag is in use. Properties in `invalidated` conflict with the
 *   plugin's definition (ADR 0008): read them as empty, refuse to write them.
 *   `language` is the language of the names on the tag (ADR 0009).
 * - `paused`: task features are paused; the repository must neither read nor
 *   write tasks. `starting` until startup finishes; `refused` when a tag of
 *   that name exists, was never taken over here and has conflicting
 *   properties; `failed` when setting up the tag failed.
 */
export type TaskTagState =
  | {
      kind: "ready";
      tagBlockId: number;
      tagName: string;
      language: NoteLanguage;
      invalidated: readonly PropertyKey[];
    }
  | { kind: "paused"; reason: "starting" | "failed" }
  | {
      kind: "paused";
      reason: "refused";
      tagName: string;
      language: NoteLanguage;
      conflicts: readonly PropertyKey[];
    };
