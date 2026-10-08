import { describe, expect, it } from "vitest";
import { planChoiceAdditions } from "./choice-plan";

describe("planning the choices to add to a multiple choice property", () => {
  it("changes nothing when every value is already a choice", () => {
    const property = {
      name: "上下文",
      type: 6,
      pos: 5,
      typeArgs: {
        subType: "multi",
        choices: [
          { n: "@home", c: "" },
          { n: "@office", c: "" },
        ],
      },
    };

    expect(planChoiceAdditions(property, ["@office", "@home"])).toEqual({
      kind: "unchanged",
    });
  });

  it("appends only the missing values, in the order of the list, as object choices", () => {
    const property = {
      name: "标记",
      type: 6,
      pos: 6,
      typeArgs: { subType: "multi", choices: [{ n: "writing", c: "" }] },
    };

    expect(
      planChoiceAdditions(property, ["reading", "writing", "admin"]),
    ).toEqual({
      kind: "add",
      added: ["reading", "admin"],
      definition: {
        name: "标记",
        type: 6,
        pos: 6,
        typeArgs: {
          subType: "multi",
          choices: [
            { n: "writing", c: "" },
            { n: "reading", c: "" },
            { n: "admin", c: "" },
          ],
        },
      },
    });
  });

  it("writes the plugin's position for a property that has none, and keeps a moved one", () => {
    const withoutPos = {
      name: "Context",
      type: 6,
      typeArgs: { subType: "multi", choices: [] },
    };
    const moved = {
      name: "Label",
      type: 6,
      pos: 2,
      typeArgs: { subType: "multi", choices: [] },
    };

    expect(planChoiceAdditions(withoutPos, ["@phone"])).toMatchObject({
      definition: { name: "Context", pos: 5 },
    });
    expect(planChoiceAdditions(moved, ["urgent"])).toMatchObject({
      definition: { name: "Label", pos: 2 },
    });
  });

  it("keeps string choices, coloured choices, the subtype and other fields as they are", () => {
    const property = {
      name: "上下文",
      type: 6,
      pos: 5,
      typeArgs: {
        subType: "multi",
        choices: ["@home", { n: "@office", c: "#2196f3" }],
        somethingElse: { kept: true },
      },
    };

    expect(planChoiceAdditions(property, ["@home", "@errand"])).toEqual({
      kind: "add",
      added: ["@errand"],
      definition: {
        name: "上下文",
        type: 6,
        pos: 5,
        typeArgs: {
          subType: "multi",
          choices: [
            "@home",
            { n: "@office", c: "#2196f3" },
            { n: "@errand", c: "" },
          ],
          somethingElse: { kept: true },
        },
      },
    });
  });

  it("changes nothing for an empty list", () => {
    const property = {
      name: "标记",
      type: 6,
      pos: 6,
      typeArgs: { subType: "multi", choices: [] },
    };

    expect(planChoiceAdditions(property, [])).toEqual({ kind: "unchanged" });
  });

  it("adds every value to a property without choices", () => {
    const property = {
      name: "Label",
      type: 6,
      pos: 6,
      typeArgs: { subType: "multi" },
    };

    expect(planChoiceAdditions(property, ["urgent", "later"])).toEqual({
      kind: "add",
      added: ["urgent", "later"],
      definition: {
        name: "Label",
        type: 6,
        pos: 6,
        typeArgs: {
          subType: "multi",
          choices: [
            { n: "urgent", c: "" },
            { n: "later", c: "" },
          ],
        },
      },
    });
  });

  it("adds a value listed twice only once", () => {
    const property = {
      name: "上下文",
      type: 6,
      pos: 5,
      typeArgs: { subType: "multi", choices: [] },
    };

    expect(
      planChoiceAdditions(property, ["@phone", "@home", "@phone"]),
    ).toMatchObject({
      added: ["@phone", "@home"],
      definition: {
        typeArgs: {
          choices: [
            { n: "@phone", c: "" },
            { n: "@home", c: "" },
          ],
        },
      },
    });
  });
});
