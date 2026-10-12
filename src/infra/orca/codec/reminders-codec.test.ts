import { describe, expect, it } from "vitest";
import { planRemindersWrite, readReminders } from "./reminders-codec";

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

describe("readReminders and planRemindersWrite", () => {
  it("reads back the reminders it writes, as ISO strings in UTC", () => {
    const reminders = [
      new Date("2026-10-13T01:00:00.000Z"),
      new Date("2026-10-20T01:00:00.000Z"),
    ];
    const write = planRemindersWrite(taskBlockWith(), reminders);
    if (write.kind !== "write") throw new Error("refused");
    expect(write.property).toEqual({
      name: "nextaction.reminders",
      type: 0,
      value: {
        v: 1,
        reminders: ["2026-10-13T01:00:00.000Z", "2026-10-20T01:00:00.000Z"],
      },
    });
    expect(readReminders(taskBlockWith(write.property))).toEqual({
      kind: "list",
      reminders,
    });
  });

  it("no reminders write an empty list, the property kept, and read back as an empty list", () => {
    const write = planRemindersWrite(taskBlockWith(), []);
    if (write.kind !== "write") throw new Error("refused");
    expect(write.property.value).toEqual({ v: 1, reminders: [] });
    expect(readReminders(taskBlockWith(write.property))).toEqual({
      kind: "list",
      reminders: [],
    });
  });

  it("writes the moments ascending, each once", () => {
    const write = planRemindersWrite(taskBlockWith(), [
      new Date("2026-10-20T01:00:00.000Z"),
      new Date("2026-10-13T01:00:00.000Z"),
      new Date("2026-10-20T01:00:00.000Z"),
    ]);
    if (write.kind !== "write") throw new Error("refused");
    expect(write.property.value).toEqual({
      v: 1,
      reminders: ["2026-10-13T01:00:00.000Z", "2026-10-20T01:00:00.000Z"],
    });
  });

  it("reads moments Orca hands back as Dates, ascending and each once", () => {
    const block = taskBlockWith({
      name: "nextaction.reminders",
      value: {
        v: 1,
        reminders: [
          new Date("2026-10-20T01:00:00.000Z"),
          "2026-10-13T01:00:00.000Z",
          "2026-10-20T01:00:00.000Z",
        ],
      },
    });
    expect(readReminders(block)).toEqual({
      kind: "list",
      reminders: [
        new Date("2026-10-13T01:00:00.000Z"),
        new Date("2026-10-20T01:00:00.000Z"),
      ],
    });
  });

  it("reads a task without nextaction.reminders as none", () => {
    expect(readReminders(taskBlockWith())).toEqual({ kind: "none" });
  });

  const anyReminders = [new Date("2026-10-13T01:00:00.000Z")];

  it.each([
    ["no list", {}],
    ["a list that is not one", { reminders: "2026-10-13T01:00:00.000Z" }],
    ["a moment that is not a time", { reminders: ["next Tuesday"] }],
    ["a moment that is not a string", { reminders: [20261013] }],
  ])(
    "keeps a value with %s as found, unreadable, and refuses to overwrite it",
    (_, data) => {
      const raw = { v: 1, ...data };
      const block = taskBlockWith({ name: "nextaction.reminders", value: raw });
      expect(readReminders(block)).toMatchObject({ kind: "unreadable", raw });
      expect(planRemindersWrite(block, anyReminders).kind).toBe("refused");
    },
  );

  it.each([
    ["an unknown version", { v: 2, reminders: ["2026-10-13T01:00:00.000Z"] }],
    ["a value that is not an object", ["2026-10-13T01:00:00.000Z"]],
  ])("keeps %s as found, unreadable, and refuses to overwrite it", (_, raw) => {
    const block = taskBlockWith({ name: "nextaction.reminders", value: raw });
    expect(readReminders(block)).toMatchObject({ kind: "unreadable", raw });
    expect(planRemindersWrite(block, anyReminders).kind).toBe("refused");
  });
});
