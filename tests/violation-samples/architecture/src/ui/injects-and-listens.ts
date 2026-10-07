// Violation sample: ui injects a style and attaches a DOM listener itself, so
// unload cannot release them.
export function decorate(element: HTMLElement, onClick: () => void) {
  orca.themes.injectCSS(".x { color: red; }", "x");
  orca.themes.injectCSSResource("styles/x.css", "x");
  element.addEventListener("click", onClick);
  element.removeEventListener("click", onClick);
}
