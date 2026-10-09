// A block editor the plugin panel keeps out of sight, so the plugin panel has
// an editor of its own: Orca runs editor commands and `invokeGroup` through
// the active panel's editor, and a panel without one writes nothing
// (docs/spikes/plugin-panel-writes.md, rounds 2–3). Orca's own block view
// renderer gives the panel `viewState.editor`; `orca.components.Block` does
// not. Writes made here are undone from the plugin panel. Verified by hand
// in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";

/** The block the hidden editor shows, and word of changes to it. */
export interface EditorHost {
  /** `undefined` while there is none (e.g. task features are paused). */
  current(): number | undefined;
  /** Calls `listener` after `current` may have changed; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

export function HiddenEditor(props: {
  panelId: string;
  active: boolean;
  host: EditorHost;
}) {
  const { host } = props;
  const blockId = React.useSyncExternalStore(host.subscribe, host.current);
  // The renderer of Orca's "block" view, read when rendering: it is Orca's.
  const BlockView: React.ComponentType<Record<string, unknown>> | undefined =
    orca.state.panelRenderers.block;
  if (blockId === undefined || !BlockView) return null;
  return (
    // Out of the layout and of the accessibility tree; the editor still
    // works (plugin-panel-writes, round 3).
    <div className="nextaction-hidden-editor" aria-hidden="true">
      <BlockView
        // A new host is a new editor.
        key={blockId}
        panelId={props.panelId}
        active={props.active}
        blockId={blockId}
      />
    </div>
  );
}
