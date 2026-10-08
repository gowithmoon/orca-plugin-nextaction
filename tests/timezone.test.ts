import { expect, it } from "vitest";

it("runs in UTC+8 (Asia/Shanghai), as pinned in vitest.config.ts", () => {
  expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(-480);
  expect(new Date(2026, 6, 1).getTimezoneOffset()).toBe(-480);
});
