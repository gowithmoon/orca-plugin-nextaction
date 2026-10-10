// The next action view's filter bar (#55), under the view's title: contexts
// and labels, each a multiple choice with "(None)" for a task holding no
// value, and the seven importance and urgency levels (#74). The candidates
// are the task panel's. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type { Candidates } from "../../../application/ports/task-repository";
import { t } from "../../../shared/l10n/l10n";
import {
  ImportanceSelect,
  UrgencySelect,
  ValuesSelect,
} from "../../components/filter-selects";
import { formatContext } from "../../components/format";
import type { FullNextActionFilter } from "./next-action-filter-store";

export function NextActionFilterBar(props: {
  filter: FullNextActionFilter;
  candidates: Candidates;
  onChange: (filter: FullNextActionFilter) => void;
}) {
  const { filter, candidates, onChange } = props;
  return (
    <fieldset className="nextaction-filter-bar" aria-label={t("Filter")}>
      <ValuesSelect
        label={t("Context")}
        placeholder={t("Any context")}
        choice={filter.contexts}
        candidates={candidates.contexts}
        display={formatContext}
        onChange={(contexts) => onChange({ ...filter, contexts })}
      />
      <ValuesSelect
        label={t("Label")}
        placeholder={t("Any label")}
        choice={filter.labels}
        candidates={candidates.labels}
        display={(label) => label}
        onChange={(labels) => onChange({ ...filter, labels })}
      />
      <ImportanceSelect
        chosen={filter.importance}
        onChange={(importance) => onChange({ ...filter, importance })}
      />
      <UrgencySelect
        chosen={filter.urgency}
        onChange={(urgency) => onChange({ ...filter, urgency })}
      />
    </fieldset>
  );
}
