// The filter fields both filter bars share: contexts and labels, each a
// multiple choice with "(None)" for a task holding no value, and the seven
// importance levels (#55, #69). Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import type { Importance } from "../../domain/task/task";
import type { ValuesChoice } from "../../domain/task/task-filter";
import type { SelectOption } from "../../orca.d.ts";
import { t } from "../../shared/l10n/l10n";
import { importanceName } from "./format";

/**
 * The option standing for "no value". A value the notes cannot hold as a
 * context or label (it starts with a NUL), so it never meets a real one.
 */
const noneValue = "\u0000none";

const levels: readonly Importance[] = [1, 2, 3, 4, 5, 6, 7];

export function ValuesSelect(props: {
  label: string;
  placeholder: string;
  choice: ValuesChoice;
  /** Values to offer; values already chosen are always offered too. */
  candidates: readonly string[];
  /** How a value shows (a context gets `@`); never what is filtered on. */
  display: (value: string) => string;
  onChange: (choice: ValuesChoice) => void;
}) {
  const { Select } = orca.components;
  const { choice, display } = props;
  const options: SelectOption[] = [
    { value: noneValue, label: t("(None)") },
    ...[...new Set([...props.candidates, ...choice.values])]
      .sort((a, b) => display(a).localeCompare(display(b)))
      .map((value) => ({ value, label: display(value) })),
  ];
  const selected = [...(choice.none ? [noneValue] : []), ...choice.values];
  return (
    <fieldset className="nextaction-filter" aria-label={props.label}>
      <Select
        selected={selected}
        options={options}
        multiSelection={true}
        filter={true}
        withClear={true}
        placeholder={props.placeholder}
        formatter={(value) =>
          value === noneValue ? t("(None)") : display(value)
        }
        width="100%"
        alignment="left"
        onChange={(next) =>
          props.onChange({
            values: next.filter((value) => value !== noneValue),
            none: next.includes(noneValue),
          })
        }
      />
    </fieldset>
  );
}

export function ImportanceSelect(props: {
  chosen: readonly Importance[];
  onChange: (chosen: Importance[]) => void;
}) {
  const { Select } = orca.components;
  const options: SelectOption[] = levels.map((level) => ({
    value: String(level),
    label: importanceName(level),
  }));
  return (
    <fieldset className="nextaction-filter" aria-label={t("Importance")}>
      <Select
        selected={props.chosen.map(String)}
        options={options}
        multiSelection={true}
        withClear={true}
        placeholder={t("Any importance")}
        width="100%"
        alignment="left"
        onChange={(next) =>
          props.onChange(
            // In level order, whatever order they were picked in.
            levels.filter((level) => next.includes(String(level))),
          )
        }
      />
    </fieldset>
  );
}
