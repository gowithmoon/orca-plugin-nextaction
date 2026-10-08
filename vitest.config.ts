import { defineConfig } from "vitest/config";

// Date tests read "local" year/month/day (ADR 0012). Pin a non-UTC zone so
// local runs and CI (UTC) agree; workers inherit this environment.
// tests/timezone.test.ts proves it took effect.
process.env.TZ = "Asia/Shanghai";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  },
});
