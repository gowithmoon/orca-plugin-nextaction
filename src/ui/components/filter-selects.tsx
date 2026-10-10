// The filter fields both filter bars share: contexts and labels, each a
// multiple choice with "(None)" for a task holding no value, and the seven
// importance levels and the seven urgency levels (#55, #69, #74). Verified
// by hand in Orca
// (docs/ARCHITECTURE.md §5).
import type { Importance, Rating, Urgency } from "../../domain/task/task";
import type { ValuesChoice } from "../../domain/task/task-filter";
import type { SelectOption } from "../../orca.d.ts";
import { t } from "../../shared/l10n/l10n";
import { importanceName, urgencyName } from "./format";

/**
 * The option standing for "no value". A value the notes cannot hold as a
 * context or label (it starts with a NUL), so it never meets a real one.
 */
const noneValue = "\u0000none";

const levels: readonly Rating[] = [1, 2, 3, 4, 5, 6, 7];

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

/** Any of the seven levels of a rating, by their names. */
function RatingSelect(props: {
  label: string;
  placeholder: string;
  name: (level: Rating) => string;
  chosen: readonly Rating[];
  onChange: (chosen: Rating[]) => void;
}) {
  const { Select } = orca.components;
  const options: SelectOption[] = levels.map((level) => ({
    value: String(level),
    label: props.name(level),
  }));
  return (
    <fieldset className="nextaction-filter" aria-label={props.label}>
      <Select
        selected={props.chosen.map(String)}
        options={options}
        multiSelection={true}
        withClear={true}
        placeholder={props.placeholder}
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

export function ImportanceSelect(props: {
  chosen: readonly Importance[];
  onChange: (chosen: Importance[]) => void;
}) {
  return (
    <RatingSelect
      label={t("Importance")}
      placeholder={t("Any importance")}
      name={importanceName}
      chosen={props.chosen}
      onChange={props.onChange}
    />
  );
}

export function UrgencySelect(props: {
  chosen: readonly Urgency[];
  onChange: (chosen: Urgency[]) => void;
}) {
  return (
    <RatingSelect
      label={t("Urgency")}
      placeholder={t("Any urgency")}
      name={urgencyName}
      chosen={props.chosen}
      onChange={props.onChange}
    />
  );
}
