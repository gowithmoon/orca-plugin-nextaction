// A block reference custom property in the task panel (#115), shaped like
// dependencies: the target blocks as a list, a click opens one in the notes,
// × removes it, "Add" searches under the property's scope. A deleted target
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

export function BlockRefPropertyField(props: {
  labelId: string;
  name: string;
  /** The value's targets, in order, with their texts. */
  targets: readonly BlockRefTarget[];
  readBlockRefCandidates: ReadBlockRefCandidates;
  notify: Notify;
  /** Writes the whole new list of target block IDs. */
  onChange: (targets: number[]) => void;
  onOpen: (blockId: number) => void;
}) {
  const search = useBlockRefSearch(
    props.readBlockRefCandidates,
    props.name,
    props.notify,
  );
  const current = props.targets.map((target) => target.id);
  // The last search's results, so a picked option is known.
  const [found, setFound] = React.useState<readonly BlockCandidate[]>([]);
  const optionsOf = (candidates: readonly BlockCandidate[]): SelectOption[] =>
    candidates
      .filter((candidate) => !current.includes(candidate.id))
      .map((candidate) => ({
        value: String(candidate.id),
        label: shownText(candidate).text,
      }));

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
      options={optionsOf(found)}
      // Every keyword asks Orca; the scope is applied there.
      filterFunction={async (keyword) => {
        const candidates = await search(keyword);
        setFound(candidates);
        return optionsOf(candidates);
      }}
      filterPlaceholder={t("Search blocks")}
      placeholder={t("Add")}
      onPick={(picked) => {
        if (!current.includes(picked)) props.onChange([...current, picked]);
      }}
    />
  );
}
