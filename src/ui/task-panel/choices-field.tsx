// The task panel's contexts and labels field (#35 "任务属性面板", #41): Orca's
// Select with multiple selection and search, the candidates from "read
// candidate values". A keyword nothing matches is offered as "Add …"; picking
// it writes the keyword as a new value. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5; #35 未验证二).
import type { SelectOption } from "../../orca.d.ts";
import { t } from "../../shared/l10n/l10n";
import { usePopupLayer } from "../components/popup-layer";

/**
 * Options matching `keyword`: by label or value, ignoring case, or by the
 * option's pinyin when it has one. A custom filter replaces Orca's default
 * label/pinyin match; whether Orca fills `pinyin` into the options it passes
 * here is not measured (#41 open item).
 */
function matching(
  keyword: string,
  options: readonly SelectOption[],
): SelectOption[] {
  const wanted = keyword.toLowerCase();
  return options.filter((option) =>
    [option.label, option.value, option.pinyin].some((text) =>
      text?.toLowerCase().includes(wanted),
    ),
  );
}

export function ChoicesField(props: {
  labelId: string;
  /** The task's values, as the notes hold them. */
  values: readonly string[];
  /** Values to offer; the task's own values are always offered too. */
  candidates: readonly string[];
  /** How a value shows (a context gets `@`); never what is stored. */
  display: (value: string) => string;
  placeholder: string;
  /** Called with the whole new list; one call is one write. */
  onChange: (values: string[]) => void;
}) {
  const { Select } = orca.components;
  const popupLayer = usePopupLayer();
  const { display } = props;

  const options: SelectOption[] = [
    ...new Set([...props.candidates, ...props.values]),
  ]
    .sort((a, b) => display(a).localeCompare(display(b)))
    .map((value) => ({ value, label: display(value) }));

  const filterFunction = (keyword: string, all?: SelectOption[]) => {
    const found = matching(keyword, all ?? options);
    // Stored as typed, only the surrounding spaces dropped. A value that
    // shows like an existing one (`home` and `@home` for contexts) is picked
    // from the list, not added a second way.
    const value = keyword.trim();
    const shown = display(value);
    if (
      value === "" ||
      options.some((option) => option.value === value || option.label === shown)
    ) {
      return found;
    }
    return [
      ...found,
      {
        value,
        label: t("Add ${value}", { value: display(value) }),
        icon: "ti ti-plus",
      },
    ];
  };

  return (
    <fieldset
      className="nextaction-choices-field"
      aria-labelledby={props.labelId}
    >
      <Select
        selected={[...props.values]}
        options={options}
        multiSelection={true}
        filter={true}
        filterPlaceholder={t("Search or add")}
        filterFunction={filterFunction}
        placeholder={props.placeholder}
        // A value with no option yet (just added) still shows as it should.
        formatter={display}
        width="100%"
        alignment="left"
        // Inside a window the menu would be cut off by it (popup-layer.tsx).
        menuContainer={popupLayer}
        onChange={(selected) => {
          const same =
            selected.length === props.values.length &&
            selected.every((value, i) => value === props.values[i]);
          if (!same) props.onChange(selected);
        }}
      />
    </fieldset>
  );
}
