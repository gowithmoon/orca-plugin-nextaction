// A block reference custom property in the task panel (#115), shaped like
// contexts: Orca's Select with multiple selection, the target blocks as chips
// in the box, a click on a chip opens its block in the notes. Typing searches
// under the property's scope; a name nothing found reads as is offered as
// "Add …", which adds a new page of that name, as Orca's own property input
// does (custom-properties). A deleted target reads "(Deleted block)" and can
// be taken out; it is never cleared on its own. No cycle or recurring hints:
// a target that is a task is not a dependency. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { BlockCandidate } from "../../application/ports/task-repository";
import type { ReadBlockRefCandidates } from "../../application/usecases/read-block-ref-candidates";
import type { BlockRefTarget } from "../../application/usecases/read-task";
import type { SelectOption } from "../../orca.d.ts";
import { t } from "../../shared/l10n/l10n";
import { shownText } from "../components/format";
import { Select } from "../components/popup-controls";
import { useBlockRefSearch } from "../hooks/use-block-ref-search";
import type { Notify } from "../notify";

/** Marks the "Add …" option's value; block IDs are plain numbers. */
const newValuePrefix = "new:";

/** A target's chip text. */
function targetLabel(target: BlockRefTarget): string {
  return target.deleted || target.text === null
    ? t("(Deleted block)")
    : shownText({ text: target.text }).text;
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
  const { targets, onOpen } = props;
  const search = useBlockRefSearch(
    props.readBlockRefCandidates,
    props.name,
    props.notify,
  );
  const current = targets.map((target) => target.id);
  const heldTargets = React.useRef(targets);
  heldTargets.current = targets;

  // The targets as options, so each chip has its text and opens its block.
  // A new list only when the targets change: Orca's Select shows its
  // options again, dropping what the filter returned, whenever they change
  // (select-filter).
  // `onOpen` is new on every render of the form: called through a ref so it
  // does not rebuild the options.
  const open = React.useRef(onOpen);
  open.current = onOpen;
  const targetsKey = JSON.stringify(targets);
  // biome-ignore lint/correctness/useExhaustiveDependencies: rebuilt by content, not by reference
  const options = React.useMemo<SelectOption[]>(
    () =>
      targets.map((target) => ({
        value: String(target.id),
        label: targetLabel(target),
        onClick: target.deleted ? undefined : () => open.current(target.id),
      })),
    [targetsKey],
  );

  const heldOptions = React.useRef(options);
  heldOptions.current = options;
  /** Texts of blocks found, so a chip just picked shows its text. */
  const foundLabels = React.useRef(new Map<string, string>());

  // The same function across renders: Orca's Select filters again whenever
  // it changes, which here would ask Orca again (select-filter).
  const filterFunction = React.useCallback(
    async (keyword: string): Promise<SelectOption[]> => {
      const held = heldOptions.current;
      const found = (await search(keyword))
        .map((candidate: BlockCandidate) => ({
          value: String(candidate.id),
          label: shownText(candidate).text,
        }))
        .filter((option) => !held.some((h) => h.value === option.value));
      for (const option of found) {
        foundLabels.current.set(option.value, option.label);
      }
      const text = keyword.trim();
      // Nothing typed: the targets held, so each can be taken out (a
      // deleted one too), then what the scope offers.
      if (text === "") return [...held, ...found];
      // A block found or already held under that text is the one meant:
      // picked or kept, not added a second time.
      if (
        found.some((option) => option.label === text) ||
        heldTargets.current.some((target) => target.text?.trim() === text)
      ) {
        return found;
      }
      return [
        ...found,
        {
          value: `${newValuePrefix}${text}`,
          label: t("Add ${value}", { value: text }),
          icon: "ti ti-plus",
        },
      ];
    },
    [search],
  );

  return (
    <fieldset
      className="nextaction-choices-field"
      aria-labelledby={props.labelId}
    >
      <Select
        selected={current.map(String)}
        options={options}
        multiSelection={true}
        filter={true}
        filterPlaceholder={t("Search or add")}
        filterFunction={filterFunction}
        placeholder={t("Not set")}
        // A target just picked has no option until the task is read again.
        formatter={(value) =>
          value.startsWith(newValuePrefix)
            ? value.slice(newValuePrefix.length)
            : (foundLabels.current.get(value) ?? "")
        }
        width="100%"
        alignment="left"
        onChange={(selected) => {
          const added = selected.find((v) => v.startsWith(newValuePrefix));
          if (added !== undefined) {
            props.onAddNew(added.slice(newValuePrefix.length));
            return;
          }
          const next = selected
            .map(Number)
            .filter((id) => Number.isInteger(id));
          const same =
            next.length === current.length &&
            next.every((id, i) => id === current[i]);
          if (!same) props.onChange(next);
        }}
      />
    </fieldset>
  );
}
