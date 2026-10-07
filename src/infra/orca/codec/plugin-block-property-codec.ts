// Plugin block properties: JSON block properties named `nextaction.<key>`
// (docs/ARCHITECTURE.md §4, block-properties-json). Every value carries a
// version number, `{ v: 1, ... }`, so its format can evolve.

/** The fixed prefix; it does not follow the plugin directory name. */
const prefix = "nextaction.";

/** What reading one plugin block property found. */
export type PluginPropertyRead =
  | { kind: "present"; data: Record<string, unknown> }
  | { kind: "absent" }
  /**
   * Something is stored, but not in a format this plugin reads (written by
   * a newer version, or damaged). `raw` is the value as found; it must not be
   * overwritten.
   */
  | { kind: "unreadable"; raw: unknown; reason: string };

/** A block's properties, as `get-blocks` returns them. */
export interface BlockWithProperties {
  properties: readonly { name: string; value?: unknown }[];
}

export function readPluginProperty(
  block: BlockWithProperties,
  key: string,
): PluginPropertyRead {
  const property = block.properties.find((p) => p.name === prefix + key);
  if (!property) return { kind: "absent" };
  const value = property.value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { kind: "unreadable", raw: value, reason: "not a versioned object" };
  }
  const { v: version, ...data } = value as Record<string, unknown>;
  if (version !== currentVersion) {
    return {
      kind: "unreadable",
      raw: property.value,
      reason: `unknown version ${String(version)}`,
    };
  }
  return { kind: "present", data };
}

/** The only format version this plugin reads and writes. */
const currentVersion = 1;

/** Orca `PropType.JSON` (block-properties-json J1). */
const jsonType = 0;

/** What writing one plugin block property should do. */
export type PluginPropertyWrite =
  | {
      kind: "write";
      /** Pass to `core.editor.setProperties`. */
      property: { name: string; type: number; value: Record<string, unknown> };
    }
  /** The block holds a value this plugin cannot read; it stays as it is. */
  | { kind: "refused"; raw: unknown; reason: string };

/**
 * Plans writing `data` to the plugin block property `key` of `block`, given
 * what the block holds now. A value this plugin cannot read (unknown
 * version, not a versioned object) is never overwritten.
 */
export function planPluginPropertyWrite(
  block: BlockWithProperties,
  key: string,
  data: Record<string, unknown>,
): PluginPropertyWrite {
  const current = readPluginProperty(block, key);
  if (current.kind === "unreadable") {
    return { kind: "refused", raw: current.raw, reason: current.reason };
  }
  return {
    kind: "write",
    property: {
      name: prefix + key,
      type: jsonType,
      value: { ...data, v: currentVersion },
    },
  };
}
