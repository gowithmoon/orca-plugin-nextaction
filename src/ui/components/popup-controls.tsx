// Orca's Select and DatePicker with their popups in the window's popup layer.
// ui takes them from here, not from `orca.components`
// (tests/architecture.test.ts, docs/ARCHITECTURE.md §4).
//
// Without `menuContainer`, Orca puts the popup into its anchor's
// `offsetParent`; inside a window that clips it (orca-popup-container). Each
// call site had to remember the layer, and kept forgetting it (#97). Outside a
// window `usePopupLayer()` is `undefined`, so Orca's own placement is kept.
import type { Orca, SelectProps } from "../../orca.d.ts";
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
