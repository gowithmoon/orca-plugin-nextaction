// What the shared tag mechanism (startup, alignment, takeover, rename, cache
// and state) needs to know about one plugin tag. Each tag provides its own;
// the mechanism exists once (#141).
import type { BlockProperty } from "../../../orca.d.ts";
import type { NameMatch, NoteLanguage } from "../codec/names";

/** A property definition as written to the tag block with `setProperties`. */
export type PropertyDefinition = Required<
  Pick<BlockProperty, "name" | "type" | "pos">
> &
  Pick<BlockProperty, "typeArgs">;

/** The structure and note-facing names of one plugin tag (ADR 0008, 0009). */
export interface TagSchema<K extends string> {
  /** The tag's property keys, in display order; the index is the `pos`. */
  keys: readonly K[];
  /** The tag name used when the settings hold none (ADR 0002). */
  defaultNames: Record<NoteLanguage, string>;
  /** A property's name on the tag in `language`. */
  propertyName(key: K, language: NoteLanguage): string;
  /** Which of the tag's properties a name stands for, and in which language. */
  findPropertyKey(name: string): NameMatch<K> | undefined;
  /** Every property definition of the tag called `tagName`, in `keys` order. */
  definitions(language: NoteLanguage, tagName: string): PropertyDefinition[];
}
