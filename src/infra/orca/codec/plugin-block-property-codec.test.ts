import { describe, expect, it } from "vitest";
import {
  planPluginPropertyWrite,
  readPluginProperty,
} from "./plugin-block-property-codec";

// A task block's `properties` as get-blocks returns them: plugin block
// properties are JSON (type 0) next to `_tags` and `_repr`
// (block-properties-json J1, J4).
const taskBlockWith = (...plugin: { name: string; value: unknown }[]) => ({
  properties: [
    { name: "_repr", type: 0, value: { type: "text" } },
    { name: "_tags", type: 0, value: [203] },
    ...plugin.map((p) => ({ ...p, type: 0, pos: null, typeArgs: null })),
  ],
});

describe("readPluginProperty", () => {
  it("reads a version 1 value without its version number", () => {
    const block = taskBlockWith({
      name: "nextaction.test",
      value: { v: 1, count: 3, items: ["a"] },
    });
    expect(readPluginProperty(block, "test")).toEqual({
      kind: "present",
      data: { count: 3, items: ["a"] },
    });
  });

  it("keeps a value of an unknown version as found", () => {
    // Written by a newer plugin version.
    const raw = { v: 2, count: 3 };
    const block = taskBlockWith({ name: "nextaction.test", value: raw });
    expect(readPluginProperty(block, "test")).toEqual({
      kind: "unreadable",
      raw: { v: 2, count: 3 },
      reason: "unknown version 2",
    });
  });

  it("keeps a value that is not a versioned object as found", () => {
    // Orca keeps any JSON shape (block-properties-json J2: 42 → object).
    for (const raw of [42, "hello", [1, "a"], null]) {
      const block = taskBlockWith({ name: "nextaction.test", value: raw });
      expect(readPluginProperty(block, "test")).toEqual({
        kind: "unreadable",
        raw,
        reason: "not a versioned object",
      });
    }
  });
});

describe("planPluginPropertyWrite", () => {
  it("writes the data as a version 1 JSON property under the prefixed name", () => {
    expect(
      planPluginPropertyWrite(taskBlockWith(), "test", { count: 3 }),
    ).toEqual({
      kind: "write",
      property: {
        name: "nextaction.test",
        type: 0,
        value: { v: 1, count: 3 },
      },
    });
  });

  it("refuses to overwrite a value it cannot read", () => {
    const block = taskBlockWith({
      name: "nextaction.test",
      value: { v: 2, count: 9 },
    });
    expect(planPluginPropertyWrite(block, "test", { count: 3 })).toEqual({
      kind: "refused",
      raw: { v: 2, count: 9 },
      reason: "unknown version 2",
    });
  });

  it("replaces a version 1 value", () => {
    const block = taskBlockWith({
      name: "nextaction.test",
      value: { v: 1, count: 9 },
    });
    expect(planPluginPropertyWrite(block, "test", { count: 3 })).toEqual({
      kind: "write",
      property: { name: "nextaction.test", type: 0, value: { v: 1, count: 3 } },
    });
  });
});
