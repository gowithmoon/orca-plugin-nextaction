// A block reference custom property in the task panel (#115), shaped like
// dependencies: the target blocks as a list, a click opens one in the notes,
// × removes it, "Add" searches under the property's scope. A name nothing
// found reads as is offered as "Add …", which adds a new page of that name,
// as Orca's own property input does (custom-properties). A deleted target
// reads "(Deleted block)" and can be removed; it is never cleared on its own.
// No cycle or recurring hints: a target that is a task is not a dependency.
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { BlockCandidate } from "../../application/ports/task-repository";
import type { ReadBlockRefCandidates } from "../../application/usecases/read-block-ref-candidates";
import type { BlockRefTarget } from "../../application/usecases/read-task";
import type { SelectOption } from "../../orca.d.ts";
import { t } from "../../shared/l10n/l10n";
import { shownText } from "../components/format";
import { useBlockRefSearch } from "../hooks/use-block-ref-search";
import type { Notify } from "../notify";
import { BlockRefsField } from "./block-refs-field";

const noOptions: SelectOption[] = [];

/** The candidates as options, those already held left out. */
function optionsOf(
  candidates: readonly BlockCandidate[],
  current: readonly number[],
): SelectOption[] {
  return candidates
    .filter((candidate) => !current.includes(candidate.id))
    .map((candidate) => ({
      value: String(candidate.id),
      label: shownText(candidate).text,
    }));
}

export function BlockRefPropertyField(props: {
  labelId: string;
  name: string;
  /** The value's targets, in order, with their texts. */
  targets: readonly BlockRefTarget[];
  readBlockRefCandidates: ReadBlockRefCandidates;
  notify: Notify;
  /** Writes the whole new list of target block IDs. */
  onChange: (targets: number[]) => void;
  /** Adds a new page named `text` as the last target. */
  onAddNew: (text: string) => void;
  onOpen: (blockId: number) => void;
}) {
  const search = useBlockRefSearch(
    props.readBlockRefCandidates,
    props.name,
    props.notify,
  );
  const current = props.targets.map((target) => target.id);
  const held = React.useRef(current);
  held.current = current;
  // The same function across renders: Orca's Select filters again whenever
  // it changes, which here would ask Orca again (select-filter).
  const filterFunction = React.useCallback(
    async (keyword: string) => optionsOf(await search(keyword), held.current),
    [search],
  );

  return (
    <BlockRefsField
      labelId={props.labelId}
      items={props.targets.map((target) => ({
        id: target.id,
        text: target.deleted ? null : target.text,
        struck: target.deleted,
      }))}
      missingText={t("(Deleted block)")}
      onOpen={props.onOpen}
      removeLabel={t("Remove")}
      onRemove={(id) => props.onChange(current.filter((c) => c !== id))}
      // Always the same empty list: Orca's Select shows its options again,
      // dropping what the filter returned, whenever they change
      // (select-filter). What is found only ever comes from the filter.
      options={noOptions}
      // Every keyword asks Orca; the scope is applied there.
      filterFunction={filterFunction}
      filterPlaceholder={t("Search blocks")}
      placeholder={t("Add")}
      onPick={(picked) => {
        if (!current.includes(picked)) props.onChange([...current, picked]);
      }}
      onAddNew={props.onAddNew}
    />
  );
}
