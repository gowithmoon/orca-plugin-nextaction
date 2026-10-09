import { describe, expect, it } from "vitest";
import { createPanelViews, type PanelView } from "./panel-views";

const view = (id: string, order: number): PanelView => ({
  id,
  order,
  icon: "ti ti-inbox",
  label: () => id,
  component: () => null,
});

describe("panel views", () => {
  it("lists views in navigation order, whatever the registration order", () => {
    const views = createPanelViews();
    views.register(view("review", 50));
    views.register(view("inbox", 10));
    views.register(view("next", 20));

    expect(views.list().map((entry) => entry.id)).toEqual([
      "inbox",
      "next",
      "review",
    ]);
  });

  it("rejects a second view with the same identifier", () => {
    const views = createPanelViews();
    views.register(view("inbox", 10));

    expect(() => views.register(view("inbox", 20))).toThrow(
      'Panel view "inbox" is already registered',
    );
  });
});
