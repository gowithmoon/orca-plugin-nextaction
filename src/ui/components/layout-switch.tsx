// The layout switch (GLOSSARY: 布局): icons only, the store's layouts in
// their order. The project details' toolbar (#166) and the My Day view's
// header (#197).
import * as React from "react";
import { t } from "../../shared/l10n/l10n";
import type { LayoutStore } from "./layout-store";

/** A layout's icon and name in the switch. */
export interface LayoutChoice {
  readonly icon: string;
  readonly label: () => string;
}

export function LayoutSwitch<Layout extends string>(props: {
  store: LayoutStore<Layout>;
  choices: Record<Layout, LayoutChoice>;
}) {
  const { store, choices } = props;
  const { Segmented } = orca.components;
  const layout = React.useSyncExternalStore(store.subscribe, store.current);
  return (
    <Segmented
      role="group"
      aria-label={t("Layout")}
      className="nextaction-layout-switch"
      selected={layout}
      options={store.layouts.map((value) => {
        const label = choices[value].label();
        return {
          value,
          jsx: (
            <span
              className="nextaction-layout-icon"
              role="img"
              aria-label={label}
              title={label}
            >
              <i className={choices[value].icon} aria-hidden="true" />
            </span>
          ),
        };
      })}
      onChange={(value) => store.set(store.from(value))}
    />
  );
}
