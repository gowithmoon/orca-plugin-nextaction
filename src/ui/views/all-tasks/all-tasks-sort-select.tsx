// The all tasks view's sort picker (#68): one choice among the sorts, each
// in a fixed direction. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type { AllTasksSort } from "../../../application/usecases/read-all-tasks";
import type { SelectOption } from "../../../orca.d.ts";
import { t } from "../../../shared/l10n/l10n";

/** The sorts in the order offered, each with its label. */
function sortOptions(): SelectOption[] {
  const labels: Record<AllTasksSort, string> = {
    note: t("Note order"),
    due: t("Due day"),
    start: t("Start day"),
    importance: t("Importance"),
    score: t("Score"),
    captured: t("Capture time"),
  };
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

function isSort(value: string | undefined): value is AllTasksSort {
  return sortOptions().some((option) => option.value === value);
}

export function AllTasksSortSelect(props: {
  sort: AllTasksSort;
  onChange: (sort: AllTasksSort) => void;
}) {
  const { Select } = orca.components;
  return (
    <fieldset className="nextaction-sort" aria-label={t("Sort")}>
      <Select
        selected={[props.sort]}
        options={sortOptions()}
        pre={<i className="ti ti-arrows-sort" aria-hidden="true" />}
        width="100%"
        alignment="left"
        onChange={(next) => {
          const [sort] = next;
          if (isSort(sort)) props.onChange(sort);
        }}
      />
    </fieldset>
  );
}
