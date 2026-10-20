// The task map's filter (#217): the filter button at the end of the view's
// header, opening the shared filter panel with the project filter (any
// projects and "No project", none chosen for every area) and the switches
// "Show done" and "Show tasks with no relation". The map reads again on each
// change (task-map-view.tsx). Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type { TaskMapInput } from "../../../application/usecases/read-task-map";
import type { Project } from "../../../domain/project/project";
import type { SelectOption } from "../../../orca.d.ts";
import { t } from "../../../shared/l10n/l10n";
import { FilterPanelButton } from "../../components/filter-panel";
import { FilterField } from "../../components/filter-selects";
import { Select } from "../../components/popup-controls";
import { chosenTaskMapFilters, noTaskMapFilter } from "./task-map-filter";

/** The no-project area's option; a project's is its ID. */
const noneValue = "none";

/** A project's name as the filter and the markers show it. */
export function projectName(project: Project): string {
  const name = project.text.trim();
  return name === "" ? t("(No text)") : name;
}

function SwitchField(props: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  const { Switch } = orca.components;
  return (
    <FilterField label={props.label}>
      <span>
        <Switch
          role="switch"
          aria-checked={props.on}
          aria-label={props.label}
          on={props.on}
          onChange={(on) => {
            if (on !== props.on) props.onChange(on);
          }}
        />
      </span>
    </FilterField>
  );
}

export function TaskMapFilterButton(props: {
  filter: TaskMapInput;
  projects: readonly Project[];
  onChange: (filter: TaskMapInput) => void;
}) {
  const { filter, onChange } = props;
  const options: SelectOption[] = [
    { value: noneValue, label: t("No project") },
    ...props.projects.map((project) => ({
      value: String(project.id),
      label: projectName(project),
    })),
  ];
  return (
    <FilterPanelButton
      chosen={chosenTaskMapFilters(filter)}
      onClear={() => onChange(noTaskMapFilter)}
    >
      <FilterField label={t("Projects")}>
        <Select
          selected={filter.projects.map(String)}
          options={options}
          multiSelection={true}
          filter={true}
          withClear={true}
          placeholder={t("All projects")}
          // A project chosen and since gone shows by its ID.
          formatter={(value) => value}
          width="100%"
          alignment="left"
          onChange={(next) =>
            onChange({
              ...filter,
              projects: next.map((value) =>
                value === noneValue ? "none" : Number(value),
              ),
            })
          }
        />
      </FilterField>
      <SwitchField
        label={t("Show done")}
        on={filter.showDone}
        onChange={(showDone) => onChange({ ...filter, showDone })}
      />
      <SwitchField
        label={t("Show tasks with no relation")}
        on={filter.showUnrelated}
        onChange={(showUnrelated) => onChange({ ...filter, showUnrelated })}
      />
    </FilterPanelButton>
  );
}
