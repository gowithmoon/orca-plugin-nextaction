// A fake Orca host for lifecycle tests. It keeps a ledger of what the plugin
// registered and released, and simulates notify, state.locale, state.plugins,
// state.panels and nav.close. It does not simulate any other Orca behavior.
import { vi } from "vitest";
import type {
  ColumnPanel,
  Orca,
  PluginSettingsSchema,
  RowPanel,
  ViewPanel,
} from "../src/orca.d.ts";

export interface Notification {
  type: string;
  message: string;
  title?: string;
}

export interface FakeOrcaHost {
  readonly notifications: Notification[];
  /** Register, unregister and close calls in the order the plugin made them, e.g. "unregisterPanel x". */
  readonly calls: string[];
  /** Identifiers the plugin currently holds on Orca's identifier-keyed APIs. */
  ownedIds(): string[];
  /** Everything the plugin still holds on the host. */
  leftovers(): string[];
  /** The next unregister of this identifier throws instead of releasing it. */
  failUnregister(id: string, error: Error): void;
  /** Opens a view panel showing `view` and returns its panel id. */
  openPanel(view: string): string;
  /** The views of all open view panels, in layout order. */
  openPanelViews(): string[];
  /** An event target (standing in for `document`) that tracks attached listeners. */
  readonly eventTarget: EventTarget;
  uninstall(): void;
}

type AnyPanel = RowPanel | ColumnPanel | ViewPanel;

export function installFakeOrcaHost(options: {
  pluginName: string;
  locale?: string;
}): FakeOrcaHost {
  const notifications: Notification[] = [];
  const calls: string[] = [];
  const registered = new Map<string, string>(); // "kind:id" -> id
  const failures = new Map<string, Error>();

  const register = (kind: string, call: string, id: string, owned = true) => {
    calls.push(`${call} ${id}`);
    const key = `${kind}:${id}`;
    if (registered.has(key)) throw new Error(`${id} is already registered`);
    registered.set(key, owned ? id : "");
  };
  const unregister = (kind: string, call: string, id: string) => {
    calls.push(`${call} ${id}`);
    const failure = failures.get(id);
    if (failure) {
      failures.delete(id);
      throw failure;
    }
    registered.delete(`${kind}:${id}`);
  };

  const panels: RowPanel = {
    id: "root",
    direction: "row",
    height: 1,
    children: [],
  };
  let panelSeq = 0;
  const viewPanels = (): ViewPanel[] => {
    const out: ViewPanel[] = [];
    const walk = (panel: AnyPanel) => {
      if ("children" in panel) panel.children.forEach(walk);
      else out.push(panel);
    };
    walk(panels);
    return out;
  };
  const removePanel = (parent: RowPanel | ColumnPanel, id: string) => {
    parent.children = parent.children.filter(
      (child) => child.id !== id,
    ) as typeof parent.children;
    for (const child of parent.children) {
      if ("children" in child) removePanel(child, id);
    }
  };

  const listeners: { type: string; listener: unknown; capture: boolean }[] = [];
  const captureOf = (options?: boolean | EventListenerOptions) =>
    typeof options === "boolean" ? options : (options?.capture ?? false);
  const eventTarget: EventTarget = {
    addEventListener(type, listener, options) {
      const capture = captureOf(options);
      const exists = listeners.some(
        (l) =>
          l.type === type && l.listener === listener && l.capture === capture,
      );
      if (!exists) listeners.push({ type, listener, capture });
    },
    removeEventListener(type, listener, options) {
      const capture = captureOf(options);
      const index = listeners.findIndex(
        (l) =>
          l.type === type && l.listener === listener && l.capture === capture,
      );
      if (index >= 0) listeners.splice(index, 1);
    },
    dispatchEvent: () => true,
  };

  const fake = {
    notify(type: string, message: string, opts?: { title?: string }) {
      notifications.push({ type, message, title: opts?.title });
    },
    state: {
      locale: options.locale ?? "en",
      plugins: {
        // First enable: settings are null until the schema is set (spike #12).
        [options.pluginName]: {
          enabled: true,
          icon: "",
          settings: null as Record<string, unknown> | null,
        },
      } as Record<
        string,
        {
          enabled: boolean;
          icon: string;
          settings: Record<string, unknown> | null;
        }
      >,
      panels,
    },
    plugins: {
      // Orca applies schema defaults as soon as the schema is set (spike #12).
      async setSettingsSchema(name: string, schema: PluginSettingsSchema) {
        const plugin = fake.state.plugins[name];
        if (!plugin) return;
        const settings: Record<string, unknown> = { ...plugin.settings };
        for (const [key, item] of Object.entries(schema)) {
          if (settings[key] === undefined) settings[key] = item.defaultValue;
        }
        plugin.settings = settings;
      },
    },
    nav: {
      close(id: string) {
        calls.push(`nav.close ${id}`);
        removePanel(panels, id);
      },
    },
    commands: {
      registerCommand: (id: string) =>
        register("command", "registerCommand", id),
      unregisterCommand: (id: string) =>
        unregister("command", "unregisterCommand", id),
      registerEditorCommand: (id: string) =>
        register("editorCommand", "registerEditorCommand", id),
      unregisterEditorCommand: (id: string) =>
        unregister("editorCommand", "unregisterEditorCommand", id),
      // A hook on someone else's command: it is not an identifier the plugin owns.
      registerAfterCommand: (id: string) =>
        register("afterCommand", "registerAfterCommand", id, false),
      unregisterAfterCommand: (id: string) =>
        unregister("afterCommand", "unregisterAfterCommand", id),
    },
    panels: {
      registerPanel: (id: string) => register("panel", "registerPanel", id),
      unregisterPanel: (id: string) =>
        unregister("panel", "unregisterPanel", id),
    },
    editorSidetools: {
      registerEditorSidetool: (id: string) =>
        register("sidetool", "registerEditorSidetool", id),
      unregisterEditorSidetool: (id: string) =>
        unregister("sidetool", "unregisterEditorSidetool", id),
    },
    broadcasts: {
      registerHandler: (type: string) =>
        register("broadcast", "registerHandler", type),
      unregisterHandler: (type: string) =>
        unregister("broadcast", "unregisterHandler", type),
    },
    themes: {
      injectCSS: (_css: string, role: string) =>
        register("css", "injectCSS", role),
      removeCSS: (role: string) => unregister("css", "removeCSS", role),
    },
  };

  const attachedElements = new Set<object>();
  const fakeDocument = {
    createElement() {
      const element = { remove: () => attachedElements.delete(element) };
      return element;
    },
    body: { append: (element: object) => attachedElements.add(element) },
  };
  let mountedRoots = 0;

  let subscriptions = 0;
  const fakeWindow = {
    createRoot() {
      let mounted = false;
      return {
        render() {
          if (!mounted) mountedRoots++;
          mounted = true;
        },
        unmount() {
          if (mounted) mountedRoots--;
          mounted = false;
        },
      };
    },
    Valtio: {
      subscribe() {
        subscriptions++;
        let active = true;
        return () => {
          if (active) subscriptions--;
          active = false;
        };
      },
    },
  };

  vi.useFakeTimers();
  vi.stubGlobal("orca", fake as unknown as Orca);
  vi.stubGlobal("window", fakeWindow);
  vi.stubGlobal("document", fakeDocument);

  return {
    notifications,
    calls,
    ownedIds: () => [...registered.values()].filter((id) => id !== ""),
    leftovers: () => [
      ...registered.keys(),
      ...listeners.map((l) => `listener:${l.type}`),
      ...Array.from({ length: vi.getTimerCount() }, () => "timer"),
      ...Array.from({ length: subscriptions }, () => "subscription"),
      ...Array.from({ length: mountedRoots }, () => "react root"),
      ...Array.from({ length: attachedElements.size }, () => "root element"),
    ],
    eventTarget,
    failUnregister: (id, error) => failures.set(id, error),
    openPanel(view) {
      const id = `panel-${++panelSeq}`;
      panels.children.push({ id, view, viewArgs: {}, viewState: {} });
      return id;
    },
    openPanelViews: () => viewPanels().map((panel) => panel.view),
    uninstall() {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    },
  };
}
