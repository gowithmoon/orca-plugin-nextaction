// A block reference field of the task panel: the target blocks as a list,
// each opened by a click and removable on its own, and a search to add one.
// Shared by dependencies (#57) and block reference custom properties (#115);
// what is particular to each (cycles, recurring tasks, what a click opens)
// comes in through the props. Verified by hand in Orca (docs/ARCHITECTURE.md
// §5).
import * as React from "react";
import type { SelectOption } from "../../orca.d.ts";
import { t } from "../../shared/l10n/l10n";
import { shownText } from "../components/format";
import { Select } from "../components/popup-controls";

/** Marks the "Add …" option's value; block IDs are plain numbers. */
const newValuePrefix = "new:";

/** One target block as the field lists it. */
export interface BlockRefsFieldItem {
  readonly id: number;
  /** The list key, when two items may share an ID (default: the ID). */
  readonly key?: string;
  /** Its text; `null` when there is no block to open, `missingText` shown instead. */
  readonly text: string | null;
  /** Shown struck through (e.g. a stale dependency). */
  readonly struck?: boolean;
  /** Before the text (e.g. a project status icon). */
  readonly before?: React.ReactNode;
  /** After the text, before the remove button (e.g. a hint icon, "Stale"). */
  readonly after?: React.ReactNode;
  /** `false`: shown without a remove button (read only). */
  readonly removable?: boolean;
}

/**
 * The target blocks as a list, each opened by a click; nothing when there is
 * none. Without `onRemove`, no item has a remove button (read only).
 */
export function BlockRefsList(props: {
  labelId: string;
  items: readonly BlockRefsFieldItem[];
  /** What an item without a block to open reads as. */
  missingText?: string;
  /** The item's block is clicked. */
  onOpen: (id: number) => void;
  /** The remove button's label. */
  removeLabel?: string;
  onRemove?: (id: number) => void;
  /** Each text on one line, cut off with an ellipsis; the whole on hover. */
  singleLine?: boolean;
}) {
  const { Button, Tooltip } = orca.components;
  const { onRemove } = props;
  if (props.items.length === 0) return null;
  return (
    <ul
      className="nextaction-block-refs"
      aria-labelledby={props.labelId}
      data-single-line={props.singleLine || undefined}
    >
      {props.items.map((item) => {
        const text =
          item.text === null ? undefined : shownText({ text: item.text });
        return (
          <li
            key={item.key ?? item.id}
            className="nextaction-block-ref"
            data-struck={item.struck || undefined}
          >
            {item.before}
            {text ? (
              <button
                type="button"
                className="nextaction-block-ref-target"
                data-empty={text.empty || undefined}
                title={props.singleLine ? text.text : undefined}
                onClick={() => props.onOpen(item.id)}
              >
                {text.text}
              </button>
            ) : (
              <span className="nextaction-block-ref-target">
                {props.missingText}
              </span>
            )}
            {item.after}
            {onRemove && item.removable !== false && (
              <Tooltip text={props.removeLabel}>
                <Button
                  variant="plain"
                  className="nextaction-block-ref-remove"
                  aria-label={props.removeLabel}
                  onClick={() => onRemove(item.id)}
                >
                  <i className="ti ti-x" aria-hidden="true" />
                </Button>
              </Tooltip>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function BlockRefsField(props: {
  labelId: string;
  items: readonly BlockRefsFieldItem[];
  /** What an item without a block to open reads as. */
  missingText: string;
  /** The item's block is clicked. */
  onOpen: (id: number) => void;
  /** The remove button's label. */
  removeLabel: string;
  onRemove: (id: number) => void;
  /** Below the list, above the search (e.g. a hint). */
  below?: React.ReactNode;
  /** The search is shown; `false` leaves it out (read only). Default true. */
  searchable?: boolean;
  /** The search: options' values are block IDs. */
  options: SelectOption[];
  filterFunction: NonNullable<
    React.ComponentProps<typeof Select>["filterFunction"]
  >;
  filterPlaceholder: string;
  placeholder: string;
  /** A block was picked from the search. */
  onPick: (id: number) => void;
  /**
   * A keyword no option reads as exactly is offered as "Add …", as in the
   * choices field; picking it calls this with the keyword, trimmed. Without
   * it only blocks found can be picked.
   */
  onAddNew?: (text: string) => void;
}) {
  const { filterFunction, onAddNew } = props;
  const addsNew = onAddNew !== undefined;
  const items = React.useRef(props.items);
  items.current = props.items;
  // Kept the same while `filterFunction` is: Orca's Select filters again
  // whenever the function changes (select-filter).
  const filter = React.useCallback<typeof filterFunction>(
    async (keyword, options) => {
      const found = await filterFunction(keyword, options);
      const text = keyword.trim();
      // A block found or already held under that text is the one meant:
      // picked or kept, not added a second time.
      if (
        !addsNew ||
        text === "" ||
        found.some((o) => o.label === text) ||
        items.current.some((item) => item.text?.trim() === text)
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
    [filterFunction, addsNew],
  );
  return (
    <div className="nextaction-block-refs-field">
      <BlockRefsList
        labelId={props.labelId}
        items={props.items}
        missingText={props.missingText}
        onOpen={props.onOpen}
        removeLabel={props.removeLabel}
        onRemove={props.onRemove}
      />
      {props.below}
      {props.searchable !== false && (
        <Select
          selected={[]}
          options={props.options}
          filter={true}
          filterFunction={filter}
          filterPlaceholder={props.filterPlaceholder}
          placeholder={props.placeholder}
          width="100%"
          alignment="left"
          onChange={(selected) => {
            const value = selected[0] ?? "";
            if (onAddNew && value.startsWith(newValuePrefix)) {
              onAddNew(value.slice(newValuePrefix.length));
              return;
            }
            const picked = Number(value);
            if (value !== "" && Number.isInteger(picked)) props.onPick(picked);
          }}
        />
      )}
    </div>
  );
}
