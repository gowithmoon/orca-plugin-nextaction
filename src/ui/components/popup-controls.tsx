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

/** Orca's ContextMenu; an explicit `container` still wins. */
export function ContextMenu(props: ContextMenuProps) {
  const popupLayer = usePopupLayer();
  const OrcaContextMenu = orca.components.ContextMenu;
  return (
    <OrcaContextMenu {...props} container={props.container ?? popupLayer} />
  );
}
