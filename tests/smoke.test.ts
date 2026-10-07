// Smoke test: proves the Vitest pipeline runs in Node against project source.
// Later issues may replace it with real tests.
import { describe, expect, it } from "vitest";
import { setupL10N, t } from "../src/libs/l10n";

describe("test pipeline smoke", () => {
  it("translates a key through t() for the active locale", () => {
    setupL10N("zh-CN", { "zh-CN": { Inbox: "收集箱" } });

    expect(t("Inbox")).toBe("收集箱");
  });
});
