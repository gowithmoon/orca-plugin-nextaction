// The all tasks view's filter bar (#69): a multiple choice of the five
// statuses a task not done can have and the next action view's contexts,
// labels and importance fields; and the search box for the task text, which
// sits in the toolbar's first row. The candidates are the task panel's.
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type * as React from "react";
import type { Candidates } from "../../../application/ports/task-repository";
import type { OpenStatus } from "../../../application/usecases/read-all-tasks";
import type { SelectOption } from "../../../orca.d.ts";
import { t } from "../../../shared/l10n/l10n";
import {
  ImportanceSelect,
  ValuesSelect,
} from "../../components/filter-selects";
import { formatContext } from "../../components/format";
import { statusLabel } from "../../components/status-label";
import type { AllTasksFilterState } from "./all-tasks-filter-store";

const openStatuses: readonly OpenStatus[] = [
  "inbox",
  "todo",
  "doing",
  "waiting",
  "someday",
];

function StatusSelect(props: {
  chosen: readonly OpenStatus[];
  onChange: (chosen: OpenStatus[]) => void;
}) {
  const { Select } = orca.components;
  const options: SelectOption[] = openStatuses.map((status) => ({
    value: status,
    label: statusLabel(status),
  }));
  return (
    <fieldset className="nextaction-filter" aria-label={t("Status")}>
      <Select
        selected={[...props.chosen]}
        options={options}
        multiSelection={true}
        withClear={true}
        placeholder={t("Any status")}
        width="100%"
        alignment="left"
        onChange={(next) =>
          props.onChange(
            // In status order, whatever order they were picked in.
            openStatuses.filter((status) => next.includes(status)),
          )
        }
      />
    </fieldset>
  );
}

export function AllTasksSearchBox(props: {
  search: string;
  onChange: (search: string) => void;
}) {
  // Handles IME composition: a word being composed is not searched for yet.
  // It calls onChange itself once composing ends, so the value is read from
  // the target, as everywhere else it is used.
  const { CompositionInput, Tooltip } = orca.components;
  const clear =
    props.search === "" ? undefined : (
      <Tooltip text={t("Clear search")}>
        <button
          type="button"
          className="nextaction-task-card-button nextaction-search-clear"
          aria-label={t("Clear search")}
          onClick={() => props.onChange("")}
        >
          <i className="ti ti-x" aria-hidden="true" />
        </button>
      </Tooltip>
    );
  return (
    <div className="nextaction-filter-search">
      <CompositionInput
        aria-label={t("Search tasks")}
        placeholder={t("Search tasks")}
        value={props.search}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          props.onChange(e.target.value)
        }
        pre={<i className="ti ti-search" aria-hidden="true" />}
        post={clear}
      />
    </div>
  );
}

export function AllTasksFilterBar(props: {
  state: AllTasksFilterState;
  candidates: Candidates;
  onChange: (state: AllTasksFilterState) => void;
}) {
  const { state, candidates, onChange } = props;
  const { filter } = state;
  const setFilter = (next: AllTasksFilterState["filter"]) =>
    onChange({ ...state, filter: next });
  return (
    <fieldset className="nextaction-filter-bar" aria-label={t("Filter")}>
      <StatusSelect
        chosen={filter.statuses}
        onChange={(statuses) => setFilter({ ...filter, statuses })}
      />
      <ValuesSelect
        label={t("Context")}
        placeholder={t("Any context")}
        choice={filter.contexts}
        candidates={candidates.contexts}
        display={formatContext}
        onChange={(contexts) => setFilter({ ...filter, contexts })}
      />
      <ValuesSelect
        label={t("Label")}
        placeholder={t("Any label")}
        choice={filter.labels}
        candidates={candidates.labels}
        display={(label) => label}
        onChange={(labels) => setFilter({ ...filter, labels })}
      />
      <ImportanceSelect
        chosen={filter.importance}
        onChange={(importance) => setFilter({ ...filter, importance })}
      />
    </fieldset>
  );
}
