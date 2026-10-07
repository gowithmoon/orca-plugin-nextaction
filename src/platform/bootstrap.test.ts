import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type FakeOrcaHost,
  installFakeOrcaHost,
} from "../../tests/fake-orca-host";
import { createPlugin, type FeatureModule } from "./bootstrap";

const pluginName = "orca-plugin-nextaction";
let host: FakeOrcaHost;

beforeEach(() => {
  host = installFakeOrcaHost({ pluginName });
});

afterEach(() => {
  host.uninstall();
});

const noop = () => {};

describe("plugin lifecycle", () => {
  it("registers feature identifiers under the plugin name and releases them on unload", async () => {
    const feature: FeatureModule = ({ registry }) => {
      registry.command("capture", noop, "Capture");
    };
    const plugin = createPlugin({ features: [feature] });

    await plugin.load(pluginName);
    expect(host.ownedIds()).toEqual(["orca-plugin-nextaction.capture"]);

    await plugin.unload();
    expect(host.leftovers()).toEqual([]);
  });

  it("rolls back, notifies the user and rethrows when load fails midway", async () => {
    const failure = new Error("schema alignment failed");
    const plugin = createPlugin({
      features: [
        ({ registry }) => {
          registry.command("capture", noop, "Capture");
        },
        () => {
          throw failure;
        },
      ],
    });

    await expect(plugin.load(pluginName)).rejects.toBe(failure);

    expect(host.leftovers()).toEqual([]);
    expect(host.notifications).toHaveLength(1);
    expect(host.notifications[0]?.type).toBe("error");
    expect(host.notifications[0]?.message).toContain("schema alignment failed");
  });

  it("reports rollback failures together with the load error and still rethrows the load error", async () => {
    const failure = new Error("schema alignment failed");
    host.failUnregister(
      "orca-plugin-nextaction.capture",
      new Error("capture is stuck"),
    );
    const plugin = createPlugin({
      features: [
        ({ registry }) => {
          registry.command("capture", noop, "Capture");
        },
        () => {
          throw failure;
        },
      ],
    });

    await expect(plugin.load(pluginName)).rejects.toBe(failure);

    expect(host.notifications).toHaveLength(1);
    expect(host.notifications[0]?.type).toBe("error");
    expect(host.notifications[0]?.message).toContain("schema alignment failed");
    expect(host.notifications[0]?.message).toContain("capture is stuck");
  });

  it("speaks the Orca interface language", async () => {
    host.uninstall();
    host = installFakeOrcaHost({ pluginName, locale: "zh-CN" });
    const plugin = createPlugin({
      features: [
        () => {
          throw new Error("boom");
        },
      ],
    });

    await plugin.load(pluginName).catch(noop);

    expect(host.notifications[0]?.message).toBe("加载失败：boom");
  });

  it("unloads quietly after a failed load", async () => {
    const plugin = createPlugin({
      features: [
        ({ registry }) => {
          registry.command("capture", noop, "Capture");
          throw new Error("boom");
        },
      ],
    });
    await plugin.load(pluginName).catch(noop);

    await expect(plugin.unload()).resolves.toBeUndefined();
    expect(host.leftovers()).toEqual([]);
  });

  it("releases everything when unload arrives while load is still running", async () => {
    let finishFirstFeature = noop;
    let firstFeatureStarted = noop;
    const started = new Promise<void>((resolve) => {
      firstFeatureStarted = resolve;
    });
    const plugin = createPlugin({
      features: [
        async ({ registry }) => {
          registry.command("first", noop, "First");
          firstFeatureStarted();
          await new Promise<void>((resolve) => {
            finishFirstFeature = resolve;
          });
        },
        ({ registry }) => {
          registry.command("second", noop, "Second");
        },
      ],
    });

    const loading = plugin.load(pluginName);
    await started;
    const unloading = plugin.unload();
    finishFirstFeature();
    await loading;
    await unloading;

    expect(host.leftovers()).toEqual([]);
  });

  it("unloads quietly when called twice, or without a prior load", async () => {
    const plugin = createPlugin({
      features: [
        ({ registry }) => {
          registry.command("capture", noop, "Capture");
        },
      ],
    });
    await expect(createPlugin({ features: [] }).unload()).resolves.toBe(
      undefined,
    );

    await plugin.load(pluginName);
    await plugin.unload();
    await expect(plugin.unload()).resolves.toBeUndefined();
    expect(host.leftovers()).toEqual([]);
  });

  it.each([
    ["another plugin's prefix", "other-plugin.capture"],
    ["no prefix", "capture"],
  ])(
    "refuses to load a feature that registers an identifier with %s",
    async (_case, id) => {
      const plugin = createPlugin({
        features: [({ registry }) => registry.add(id, noop)],
      });

      await expect(plugin.load(pluginName)).rejects.toThrow(id);
      expect(host.notifications).toHaveLength(1);
    },
  );

  it("refuses identifiers starting with an underscore, which Orca reserves", async () => {
    host.uninstall();
    host = installFakeOrcaHost({ pluginName: "_hidden" });
    const plugin = createPlugin({
      features: [({ registry }) => registry.add("_hidden.capture", noop)],
    });

    await expect(plugin.load("_hidden")).rejects.toThrow("_hidden.capture");
  });

  it("refuses to load a feature that registers the same identifier twice", async () => {
    const plugin = createPlugin({
      features: [
        ({ registry }) => {
          registry.add("orca-plugin-nextaction.capture", noop);
          registry.add("orca-plugin-nextaction.capture", noop);
        },
      ],
    });

    await expect(plugin.load(pluginName)).rejects.toThrow(
      "orca-plugin-nextaction.capture",
    );
  });

  it("keeps releasing the rest when some releases throw, and reports them together", async () => {
    const plugin = createPlugin({
      features: [
        ({ registry }) => {
          registry.command("first", noop, "First");
          registry.command("second", noop, "Second");
          registry.command("third", noop, "Third");
        },
      ],
    });
    await plugin.load(pluginName);
    host.failUnregister(
      "orca-plugin-nextaction.first",
      new Error("first is stuck"),
    );
    host.failUnregister(
      "orca-plugin-nextaction.third",
      new Error("third is stuck"),
    );

    await expect(plugin.unload()).resolves.toBeUndefined();

    expect(host.ownedIds().sort()).toEqual([
      "orca-plugin-nextaction.first",
      "orca-plugin-nextaction.third",
    ]);
    expect(host.notifications).toHaveLength(1);
    expect(host.notifications[0]?.message).toContain("first is stuck");
    expect(host.notifications[0]?.message).toContain("third is stuck");
  });

  it("closes open panels of a panel type before unregistering that type", async () => {
    const view = "orca-plugin-nextaction.panel";
    const plugin = createPlugin({
      features: [
        ({ registry }) => {
          registry.panel("panel", () => null);
        },
      ],
    });
    await plugin.load(pluginName);
    const first = host.openPanel(view);
    const second = host.openPanel(view);
    host.openPanel("journal");

    await plugin.unload();

    expect(host.openPanelViews()).toEqual(["journal"]);
    expect(host.calls).toEqual([
      `registerPanel ${view}`,
      `nav.close ${first}`,
      `nav.close ${second}`,
      `unregisterPanel ${view}`,
    ]);
  });

  it("lets a panel owner choose how its open panels are closed", async () => {
    const view = "orca-plugin-nextaction.panel";
    const closed: string[] = [];
    const plugin = createPlugin({
      features: [
        ({ registry }) => {
          registry.panel("panel", () => null, {
            closePanel: (panelId) => {
              closed.push(panelId);
            },
          });
        },
      ],
    });
    await plugin.load(pluginName);
    const opened = host.openPanel(view);

    await plugin.unload();

    expect(closed).toEqual([opened]);
    expect(host.calls).toEqual([
      `registerPanel ${view}`,
      `unregisterPanel ${view}`,
    ]);
  });

  it("keeps closing open panels and still unregisters the type when closing one throws", async () => {
    const view = "orca-plugin-nextaction.panel";
    const closed: string[] = [];
    let stuck = "";
    const plugin = createPlugin({
      features: [
        ({ registry }) => {
          registry.panel("panel", () => null, {
            closePanel: (panelId) => {
              if (panelId === stuck) throw new Error("panel is stuck");
              closed.push(panelId);
            },
          });
        },
      ],
    });
    await plugin.load(pluginName);
    stuck = host.openPanel(view);
    const second = host.openPanel(view);
    const third = host.openPanel(view);

    await expect(plugin.unload()).resolves.toBeUndefined();

    expect(closed).toEqual([second, third]);
    expect(host.leftovers()).toEqual([]);
    expect(host.notifications).toHaveLength(1);
    expect(host.notifications[0]?.message).toContain("panel is stuck");
  });

  it("prefixes and releases every kind of Orca registration", async () => {
    const plugin = createPlugin({
      features: [
        ({ registry }) => {
          registry.editorCommand("format", () => null, noop, {
            label: "Format",
          });
          registry.afterCommand("core.editor.insertTag", noop);
          registry.editorSidetool("toggle", { render: () => null });
          registry.broadcastHandler("refresh", noop);
          registry.css("styles", ".nextaction-icon {}");
        },
      ],
    });

    await plugin.load(pluginName);
    expect(host.ownedIds().sort()).toEqual([
      "orca-plugin-nextaction.format",
      "orca-plugin-nextaction.refresh",
      "orca-plugin-nextaction.styles",
      "orca-plugin-nextaction.toggle",
    ]);
    expect(host.leftovers()).toContain("afterCommand:core.editor.insertTag");

    await plugin.unload();
    expect(host.leftovers()).toEqual([]);
  });

  it("removes DOM event listeners on unload", async () => {
    const plugin = createPlugin({
      features: [
        ({ registry }) => {
          registry.listener(host.eventTarget, "mousedown", noop, true);
          registry.listener(host.eventTarget, "click", noop);
        },
      ],
    });

    await plugin.load(pluginName);
    expect(host.leftovers()).toEqual(["listener:mousedown", "listener:click"]);

    await plugin.unload();
    expect(host.leftovers()).toEqual([]);
  });

  it("clears pending timers on unload", async () => {
    const plugin = createPlugin({
      features: [
        ({ registry }) => {
          registry.timeout(noop, 1000);
          registry.interval(noop, 1000);
        },
      ],
    });

    await plugin.load(pluginName);
    expect(host.leftovers()).toEqual(["timer", "timer"]);

    await plugin.unload();
    expect(host.leftovers()).toEqual([]);
  });

  it("unsubscribes from Valtio state on unload", async () => {
    const plugin = createPlugin({
      features: [
        ({ registry }) => {
          registry.subscribe(orca.state.plugins, noop);
        },
      ],
    });

    await plugin.load(pluginName);
    expect(host.leftovers()).toEqual(["subscription"]);

    await plugin.unload();
    expect(host.leftovers()).toEqual([]);
  });

  it("unmounts separate React roots and removes their host elements on unload", async () => {
    const plugin = createPlugin({
      features: [
        ({ registry }) => {
          registry.reactRoot("menu", null);
        },
      ],
    });

    await plugin.load(pluginName);
    expect(host.leftovers()).toEqual(["react root", "root element"]);

    await plugin.unload();
    expect(host.leftovers()).toEqual([]);
  });

  it("gives features the settings Orca holds, with plugin defaults for items Orca has no default for", async () => {
    let read: Record<string, unknown> = {};
    const plugin = createPlugin({
      settings: {
        tagName: {
          schema: { label: "Tag name", type: "string", defaultValue: "Task" },
        },
        dayBoundary: {
          schema: { label: "Day boundary", type: "time" },
          fallback: "05:00",
        },
      },
      features: [
        ({ settings }) => {
          read = settings();
        },
      ],
    });

    await plugin.load(pluginName);

    expect(read).toEqual({ tagName: "Task", dayBoundary: "05:00" });
  });

  it("can load again right after unload without duplicate registrations", async () => {
    const plugin = createPlugin({
      features: [
        ({ registry }) => {
          registry.command("capture", noop, "Capture");
        },
      ],
    });

    await plugin.load(pluginName);
    await plugin.unload();
    await plugin.load(pluginName);

    expect(host.ownedIds()).toEqual(["orca-plugin-nextaction.capture"]);
    expect(host.notifications).toEqual([]);
  });
});
