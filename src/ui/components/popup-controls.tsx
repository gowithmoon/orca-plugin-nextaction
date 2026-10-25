// Orca's Select, DatePicker and ContextMenu with their popups in the popup
// layer of the window or of the plugin panel. ui takes them from here, not
// from `orca.components` (tests/architecture.test.ts, docs/ARCHITECTURE.md §4).
//
// Without a container, Orca puts the popup into its anchor's `offsetParent`
// and lays it out within it; a window or the plugin panel clips it
// (orca-popup-container). Each call site had to remember the layer, and kept
// forgetting it (#97; a submenu cut off by a narrow panel's left edge).
// Outside a window and the plugin panel `usePopupLayer()` is `undefined`, so
// Orca's own placement is kept. A submenu goes into its parent menu, so it
// follows it into the layer.
import * as React from "react";
import { flushSync } from "react-dom";
import type { ContextMenuProps, Orca, SelectProps } from "../../orca.d.ts";
import { usePopupLayer } from "./popup-layer";

export type DatePickerProps = Parameters<Orca["components"]["DatePicker"]>[0];

/** Orca's Select; an explicit `menuContainer` still wins. */
export function Select(props: SelectProps) {
  const popupLayer = usePopupLayer();
  const OrcaSelect = orca.components.Select;
  return (
    <OrcaSelect {...props} menuContainer={props.menuContainer ?? popupLayer} />
  );
}

/** Orca's DatePicker; an explicit `menuContainer` still wins. */
export function DatePicker(props: DatePickerProps) {
  const popupLayer = usePopupLayer();
  const OrcaDatePicker = orca.components.DatePicker;
  return (
    <OrcaDatePicker
      {...props}
      menuContainer={props.menuContainer ?? popupLayer}
    />
  );
}

type OpenMenu = Parameters<ContextMenuProps["children"]>[0];

/** Where a right-click was, as the 1×1 box Orca anchors a popup at. */
function pointerOf(event: React.UIEvent): DOMRect | undefined {
  if (event.type !== "contextmenu") return undefined;
  const { clientX, clientY } = event as React.MouseEvent;
  return new DOMRect(clientX, clientY, 1, 1);
}

/**
 * Orca's ContextMenu; an explicit `container` still wins. A right-click
 * opens it at the pointer, below and to the right as Orca's block menu
 * does: Orca anchors it at the element's box instead, which puts a card's
 * menu in the card's middle. Other opens (a click, the keyboard) keep
 * Orca's placement.
 */
export function ContextMenu(props: ContextMenuProps) {
  const popupLayer = usePopupLayer();
  const [pointer, setPointer] = React.useState<DOMRect>();
  // The `openMenu` of the latest render: the one rendered with `pointer`.
  const latestOpen = React.useRef<OpenMenu>();
  const OrcaContextMenu = orca.components.ContextMenu;
  const { children } = props;
  return (
    <OrcaContextMenu
      {...props}
      container={props.container ?? popupLayer}
      rect={pointer ?? props.rect}
      alignment={pointer ? (props.alignment ?? "left") : props.alignment}
      defaultPlacement={
        pointer ? (props.defaultPlacement ?? "bottom") : props.defaultPlacement
      }
    >
      {(open, close, shown) => {
        latestOpen.current = open;
        return children(
          (event, state) => {
            // Rendered with the pointer before opening, whether Orca reads
            // `rect` when it opens or when it renders.
            // Only when it changes: the status menu in the notes opens from
            // an effect, where React cannot flush.
            const at = pointerOf(event);
            if (at || pointer) flushSync(() => setPointer(at));
            latestOpen.current?.(event, state);
          },
          close,
          shown,
        );
      }}
    </OrcaContextMenu>
  );
}
