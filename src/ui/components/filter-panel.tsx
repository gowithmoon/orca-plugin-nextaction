// The filter button and its filter panel, shared by the next action view and
// the all tasks view: the button sits in the view's toolbar row, the fields
// (filter-selects.tsx) open below it in a panel over the list, so the list
// keeps the room a filter bar took. While something is chosen the button is
// tinted and counts the fields holding a choice.
//
// The panel is drawn by the plugin, not Orca's Popup: its Select dropdowns
// are Orca popups in the plugin panel's popup layer, outside the panel, and
// a click in one of them must not count as a click outside it. Behind the
// open panel a transparent backdrop covers the plugin panel: a press on it
// closes the filter panel and does nothing else, as a press outside Orca's
// popups does. The dropdowns sit above it (the popup layer is over every
// panel), and while one is open Orca's own logic gives the press to it.
// Escape inside the button or the panel closes it; an Escape in a dropdown
// is the dropdown's. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import { t } from "../../shared/l10n/l10n";

export function FilterPanelButton(props: {
  /** How many fields hold a choice; 0 is no filter. */
  chosen: number;
  /** Clears the fields in the panel. */
  onClear: () => void;
  /** The fields. */
  children: React.ReactNode;
}) {
  const { Button, Tooltip } = orca.components;
  const [open, setOpen] = React.useState(false);
  const root = React.useRef<HTMLSpanElement>(null);
  const panelId = React.useId();

  /**
   * Escape on the button or in the panel. Only from them: React bubbles a
   * dropdown's keys out of its portal too, and those are the dropdown's.
   */
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open || event.key !== "Escape") return;
    if (!(event.target instanceof Node)) return;
    if (!event.currentTarget.contains(event.target)) return;
    event.stopPropagation();
    setOpen(false);
    root.current
      ?.querySelector<HTMLElement>(".nextaction-filter-button")
      ?.focus();
  };

  const label =
    props.chosen > 0
      ? t("Filter (${count} set)", { count: String(props.chosen) })
      : t("Filter");
  return (
    <span ref={root} className="nextaction-filter-anchor">
      <Tooltip text={t("Filter")}>
        <Button
          variant="plain"
          className="nextaction-toolbar-button nextaction-filter-button"
          data-active={props.chosen > 0 || undefined}
          aria-label={label}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen(!open)}
          onKeyDown={onKeyDown}
        >
          <i className="ti ti-filter" aria-hidden="true" />
          {props.chosen > 0 && (
            <span className="nextaction-filter-badge" aria-hidden="true">
              {props.chosen}
            </span>
          )}
        </Button>
      </Tooltip>
      {open && (
        <div
          className="nextaction-filter-backdrop"
          aria-hidden="true"
          onPointerDown={(event) => {
            event.preventDefault();
            setOpen(false);
          }}
        />
      )}
      {/* After the button, so Tab goes from it into the fields. */}
      {open && (
        <fieldset
          id={panelId}
          className="nextaction-filter-panel"
          aria-label={t("Filter")}
          onKeyDown={onKeyDown}
        >
          {props.children}
          <div className="nextaction-filter-panel-foot">
            <Button
              variant="plain"
              disabled={props.chosen === 0}
              onClick={props.onClear}
            >
              {t("Clear filter")}
            </Button>
          </div>
        </fieldset>
      )}
    </span>
  );
}
