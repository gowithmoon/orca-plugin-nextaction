// The all tasks view's sort picker (#68): one choice among the sorts, and
// beside it a button that switches the direction, but for note order, which
// has none. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type { AllTasksSort } from "../../../application/usecases/read-all-tasks";
import type { SelectOption } from "../../../orca.d.ts";
import { t } from "../../../shared/l10n/l10n";
import type { AllTasksSortState } from "./all-tasks-sort-store";

/** The sorts in the order offered, each with its label. */
function sortOptions(): SelectOption[] {
  const labels: Record<AllTasksSort, string> = {
    note: t("Default order"),
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

/** Names the direction shown; a click switches to the other one. */
function DirectionButton(props: {
  state: AllTasksSortState;
  onChange: (state: AllTasksSortState) => void;
}) {
  const { Button, Tooltip } = orca.components;
  const { state } = props;
  const ascending = state.direction === "ascending";
  const label = ascending ? t("Ascending") : t("Descending");
  return (
    <Tooltip text={label}>
      <Button
        variant="plain"
        className="nextaction-toolbar-button"
        aria-label={label}
        onClick={() =>
          props.onChange({
            ...state,
            direction: ascending ? "descending" : "ascending",
          })
        }
      >
        <i
          className={
            ascending ? "ti ti-sort-ascending" : "ti ti-sort-descending"
          }
          aria-hidden="true"
        />
      </Button>
    </Tooltip>
  );
}

export function AllTasksSortSelect(props: {
  state: AllTasksSortState;
  onChange: (state: AllTasksSortState) => void;
}) {
  const { Select } = orca.components;
  const { state } = props;
  return (
    <>
      <fieldset className="nextaction-sort" aria-label={t("Sort")}>
        <Select
          selected={[state.sort]}
          options={sortOptions()}
          pre={<i className="ti ti-arrows-sort" aria-hidden="true" />}
          width="100%"
          alignment="left"
          onChange={(next) => {
            const [sort] = next;
            if (isSort(sort)) props.onChange({ ...state, sort });
          }}
        />
      </fieldset>
      {state.sort !== "note" && (
        <DirectionButton state={state} onChange={props.onChange} />
      )}
    </>
  );
}
