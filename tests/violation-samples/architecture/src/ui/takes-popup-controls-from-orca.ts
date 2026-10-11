// Violation sample: ui takes Select and DatePicker straight from
// orca.components, so their popups miss the window's popup layer and are
// clipped by the window. Segmented, BlockSelect and the SelectOption type are
// other things and must not be reported.
import type { SelectOption } from "../orca.d.ts";

export function Fields(props: { options: SelectOption[] }) {
  const { Button, Select, Segmented } = orca.components;
  const { BlockSelect } = orca.components;
  const Picker = orca.components.DatePicker;
  return { Button, Select, Segmented, BlockSelect, Picker, props };
}
