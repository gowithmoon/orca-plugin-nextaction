import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebReminderNotifier } from "./web-reminder-notifier";

describe("web reminder notifier", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not throw when a notice cannot be shown, and shows the next one", () => {
    const shown: string[] = [];
    vi.stubGlobal(
      "Notification",
      class {
        constructor(_title: string, options: { body: string }) {
          if (options.body === "Call the bank") throw new Error("denied");
          shown.push(options.body);
        }
      },
    );
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const notifier = createWebReminderNotifier(() => {});

    expect(() =>
      notifier.notify({ taskId: 1, text: "Call the bank" }),
    ).not.toThrow();
    notifier.notify({ taskId: 2, text: "Send the report" });

    expect(shown).toEqual(["Send the report"]);
    expect(logged).toHaveBeenCalledOnce();
  });
});
