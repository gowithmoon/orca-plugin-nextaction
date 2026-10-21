// The next action view's filter (#55): a filter button at the end of the
// view's title row, opening a panel of contexts and tags, each a multiple
// choice with "(None)" for a task holding no value, and the seven importance
// and urgency levels (#74). The candidates are the task panel's. Verified by
// hand in Orca (docs/ARCHITECTURE.md §5).
import type { Candidates } from "../../../application/ports/task-repository";
import { chosenDimensions } from "../../../domain/task/task-filter";
import { t } from "../../../shared/l10n/l10n";
import { FilterPanelButton } from "../../components/filter-panel";
import {
  ImportanceSelect,
  UrgencySelect,
  ValuesSelect,
} from "../../components/filter-selects";
import { formatContext, formatTag } from "../../components/format";
import type { FullNextActionFilter } from "./next-action-filter-store";

export function NextActionFilterButton(props: {
  filter: FullNextActionFilter;
  candidates: Candidates;
  onChange: (filter: FullNextActionFilter) => void;
  onClear: () => void;
}) {
  const { filter, candidates, onChange } = props;
  return (
    <FilterPanelButton
      chosen={chosenDimensions(filter)}
      onClear={props.onClear}
    >
      <ValuesSelect
        label={t("Context")}
        placeholder={t("Any context")}
        choice={filter.contexts}
        candidates={candidates.contexts}
        display={formatContext}
        onChange={(contexts) => onChange({ ...filter, contexts })}
      />
      <ValuesSelect
        label={t("Tag")}
        placeholder={t("Any tag")}
        choice={filter.tags}
        candidates={candidates.tags}
        display={formatTag}
        onChange={(tags) => onChange({ ...filter, tags })}
      />
      <ImportanceSelect
        chosen={filter.importance}
        onChange={(importance) => onChange({ ...filter, importance })}
      />
      <UrgencySelect
        chosen={filter.urgency}
        onChange={(urgency) => onChange({ ...filter, urgency })}
      />
    </FilterPanelButton>
  );
}
