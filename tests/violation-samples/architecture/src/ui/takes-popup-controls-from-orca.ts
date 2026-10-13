// Violation sample: ui takes Select, DatePicker and ContextMenu straight from
// orca.components, so their popups miss the popup layer of the window or the
// plugin panel and are clipped. Segmented, BlockSelect, HoverContextMenu and
// the SelectOption type are other things and must not be reported.
import type { SelectOption } from "../orca.d.ts";

export function Fields(props: { options: SelectOption[] }) {
  const { Button, Select, Segmented } = orca.components;
  const { BlockSelect, HoverContextMenu } = orca.components;
  const Picker = orca.components.DatePicker;
  const Menu = orca.components.ContextMenu;
  return {
    Button,
    Select,
    Segmented,
    BlockSelect,
    HoverContextMenu,
    Picker,
    Menu,
    props,
  };
}
