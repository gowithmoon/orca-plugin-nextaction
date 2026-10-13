// Violation sample: ui takes ModalOverlay straight from orca.components, so
// the window misses the popup layer, the focus and Esc of PluginWindow.
// Button and Tooltip are other things and must not be reported.
export function Window() {
  const { Button, ModalOverlay, Tooltip } = orca.components;
  const Overlay = orca.components.ModalOverlay;
  return { Button, ModalOverlay, Tooltip, Overlay };
}
