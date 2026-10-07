import type { ComponentType, ReactNode } from "react";
import type { Root } from "react-dom/client";
import type {
  AfterHook,
  ColumnPanel,
  CommandFn,
  EditorCommandFn,
  EditorSidetool,
  PanelProps,
  RowPanel,
  ViewPanel,
} from "../orca.d.ts";
import { describeError } from "../shared/describe-error";

export interface Registry {
  /** Records a resource and how to release it. Throws on an invalid or duplicate identifier. */
  add(id: string, dispose: () => void | Promise<void>): void;
  command(name: string, fn: CommandFn, label: string): string;
  editorCommand(
    name: string,
    doFn: EditorCommandFn,
    undoFn: CommandFn,
    opts: { label: string; hasArgs?: boolean; noFocusNeeded?: boolean },
  ): string;
  /** Hooks after any command, including Orca's own; `commandId` is not prefixed. */
  afterCommand(commandId: string, hook: AfterHook): void;
  editorSidetool(name: string, tool: EditorSidetool): string;
  broadcastHandler(name: string, handler: CommandFn): string;
  /** Injects a style sheet; the prefixed identifier is its role. */
  css(name: string, css: string): string;
  /** Schedules a callback; cleared on release if it has not fired yet. */
  timeout(fn: () => void, ms: number): void;
  /** Repeats a callback; cleared on release. */
  interval(fn: () => void, ms: number): void;
  /**
   * Renders a React node into its own root on a new element under `document.body`.
   * On release the root is unmounted and the element removed.
   */
  reactRoot(
    name: string,
    node: ReactNode,
  ): { id: string; render(node: ReactNode): void };
  /** Subscribes to a Valtio proxy (e.g. `orca.state.plugins`) via the global `window.Valtio`. */
  subscribe(state: object, callback: () => void): void;
  /** Adds a DOM event listener; removed with the same type, listener and capture flag. */
  listener(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  /**
   * Registers a panel type. On release, every open panel showing it is closed
   * first (with `closePanel`, default `orca.nav.close`), then the type is
   * unregistered; Orca leaves open panels on screen otherwise.
   */
  panel(
    name: string,
    renderer: ComponentType<PanelProps>,
    options?: { closePanel?: (panelId: string) => void | Promise<void> },
  ): string;
  disposeAll(): Promise<void>;
}

type AnyPanel = RowPanel | ColumnPanel | ViewPanel;

/** Ids of open view panels showing `view`, read before any navigation call changes the live tree. */
function openPanelIds(view: string): string[] {
  const ids: string[] = [];
  const walk = (panel: AnyPanel) => {
    if ("children" in panel) panel.children.forEach(walk);
    else if (panel.view === view) ids.push(panel.id);
  };
  walk(orca.state.panels);
  return ids;
}

export function createRegistry(pluginName: string): Registry {
  const prefix = `${pluginName}.`;
  const entries: {
    id: string | undefined;
    dispose: () => void | Promise<void>;
  }[] = [];

  const validate = (id: string) => {
    if (!id.startsWith(prefix) || id.length === prefix.length) {
      throw new Error(`Identifier "${id}" must start with "${prefix}"`);
    }
    if (id.startsWith("_")) {
      throw new Error(`Identifier "${id}" must not start with "_"`);
    }
    if (entries.some((entry) => entry.id === id)) {
      throw new Error(`Identifier "${id}" is already registered`);
    }
  };

  const add = (id: string, dispose: () => void | Promise<void>) => {
    validate(id);
    entries.push({ id, dispose });
  };
  /** Records a resource that has no identifier of ours (hooks, listeners, timers...). */
  const track = (dispose: () => void | Promise<void>) => {
    entries.push({ id: undefined, dispose });
  };
  /** Validates, registers with Orca, then records the release; returns the full identifier. */
  const owned = (
    name: string,
    registerFn: (id: string) => void,
    unregisterFn: (id: string) => void | Promise<void>,
  ) => {
    const id = `${prefix}${name}`;
    validate(id);
    registerFn(id);
    add(id, () => unregisterFn(id));
    return id;
  };

  return {
    add,
    command: (name, fn, label) =>
      owned(
        name,
        (id) => orca.commands.registerCommand(id, fn, label),
        (id) => orca.commands.unregisterCommand(id),
      ),
    editorCommand: (name, doFn, undoFn, opts) =>
      owned(
        name,
        (id) => orca.commands.registerEditorCommand(id, doFn, undoFn, opts),
        (id) => orca.commands.unregisterEditorCommand(id),
      ),
    afterCommand(commandId, hook) {
      orca.commands.registerAfterCommand(commandId, hook);
      track(() => orca.commands.unregisterAfterCommand(commandId, hook));
    },
    editorSidetool: (name, tool) =>
      owned(
        name,
        (id) => orca.editorSidetools.registerEditorSidetool(id, tool),
        (id) => orca.editorSidetools.unregisterEditorSidetool(id),
      ),
    broadcastHandler: (name, handler) =>
      owned(
        name,
        (id) => orca.broadcasts.registerHandler(id, handler),
        (id) => orca.broadcasts.unregisterHandler(id, handler),
      ),
    css: (name, css) =>
      owned(
        name,
        (id) => orca.themes.injectCSS(css, id),
        (id) => orca.themes.removeCSS(id),
      ),
    timeout(fn, ms) {
      const handle = setTimeout(fn, ms);
      track(() => clearTimeout(handle));
    },
    interval(fn, ms) {
      const handle = setInterval(fn, ms);
      track(() => clearInterval(handle));
    },
    reactRoot(name, node) {
      // Created only once the identifier is validated, so a rejected name leaves nothing behind.
      let mounted: { element: HTMLElement; root: Root } | undefined;
      const id = owned(
        name,
        () => {
          const element = document.createElement("div");
          document.body.append(element);
          const root = window.createRoot(element) as Root;
          root.render(node);
          mounted = { element, root };
        },
        () => {
          mounted?.root.unmount();
          mounted?.element.remove();
        },
      );
      return { id, render: (next) => mounted?.root.render(next) };
    },
    subscribe(state, callback) {
      const unsubscribe: () => void = window.Valtio.subscribe(state, callback);
      track(unsubscribe);
    },
    listener(target, type, listener, options) {
      target.addEventListener(type, listener, options);
      track(() => target.removeEventListener(type, listener, options));
    },
    panel(name, renderer, options = {}) {
      const closePanel =
        options.closePanel ?? ((panelId: string) => orca.nav.close(panelId));
      return owned(
        name,
        (id) => orca.panels.registerPanel(id, renderer),
        async (id) => {
          // One stuck panel must not keep the others open or the type registered.
          const errors: unknown[] = [];
          for (const panelId of openPanelIds(id)) {
            try {
              await closePanel(panelId);
            } catch (error) {
              errors.push(error);
            }
          }
          try {
            orca.panels.unregisterPanel(id);
          } catch (error) {
            errors.push(error);
          }
          if (errors.length > 0) throw new AggregateError(errors);
        },
      );
    },
    async disposeAll() {
      const errors: unknown[] = [];
      for (const entry of entries.splice(0).reverse()) {
        try {
          await entry.dispose();
        } catch (error) {
          // A release made of several steps reports each failed step on its own.
          if (error instanceof AggregateError) errors.push(...error.errors);
          else errors.push(error);
        }
      }
      if (errors.length > 0) {
        throw new AggregateError(
          errors,
          `Failed to release ${errors.length} resource(s): ${errors.map(describeError).join("; ")}`,
        );
      }
    },
  };
}
