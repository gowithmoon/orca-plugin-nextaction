// The "Split into subtasks" window (GLOSSARY: 拆分子任务, #202): the AI may
// ask a few questions first, then gives a draft the user edits (add, remove,
// rename, reorder) and confirms; only then are the subtasks written, in one
// undo. Closing the window cancels the request and writes nothing. Verified
// by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { CreateSplitSubtasks } from "../../application/usecases/create-split-subtasks";
import type { DraftSubtasks } from "../../application/usecases/draft-subtasks";
import type { Task } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import {
  AiBody,
  AiDraftContent,
  UncertainNote,
} from "../components/ai-draft-parts";
import {
  PluginWindow,
  WindowFooter,
  WindowHeader,
} from "../components/plugin-window";
import { useSubtaskDraft } from "../hooks/use-ai-draft";
import { useCreateSplitSubtasks } from "../hooks/use-create-split-subtasks";

/** One row of the draft as the user edits it. */
interface Row {
  /** Stable across edits, for React's keys. */
  readonly key: number;
  readonly title: string;
  /** Why the AI is unsure; shown only here, never written (GLOSSARY: 草稿). */
  readonly uncertain?: string;
}

/** One editable row: its name, the AI's doubt under it, and its buttons. */
function DraftRow(props: {
  row: Row;
  index: number;
  count: number;
  onChange: (title: string) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const { Button, CompositionInput, Tooltip } = orca.components;
  const { row, index, count } = props;
  const label = t("Subtask ${n}", { n: String(index + 1) });
  return (
    <li className="nextaction-split-row">
      <div className="nextaction-split-row-main">
        <CompositionInput
          ref={props.inputRef}
          aria-label={label}
          value={row.title}
          placeholder={t("Subtask name")}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            props.onChange(e.target.value)
          }
        />
        <Tooltip text={t("Move up")}>
          <Button
            variant="plain"
            aria-label={t("Move up")}
            disabled={index === 0}
            onClick={() => props.onMove(-1)}
          >
            <i className="ti ti-arrow-up" aria-hidden="true" />
          </Button>
        </Tooltip>
        <Tooltip text={t("Move down")}>
          <Button
            variant="plain"
            aria-label={t("Move down")}
            disabled={index === count - 1}
            onClick={() => props.onMove(1)}
          >
            <i className="ti ti-arrow-down" aria-hidden="true" />
          </Button>
        </Tooltip>
        <Tooltip text={t("Remove")}>
          <Button
            variant="plain"
            aria-label={t("Remove")}
            onClick={props.onRemove}
          >
            <i className="ti ti-x" aria-hidden="true" />
          </Button>
        </Tooltip>
      </div>
      {row.uncertain !== undefined && <UncertainNote reason={row.uncertain} />}
    </li>
  );
}

/** The draft to edit and confirm. */
function Draft(props: {
  parent: Task;
  initial: readonly Row[];
  notSplittable?: string;
  createSplitSubtasks: CreateSplitSubtasks;
  pluginName: string;
  onClose: () => void;
}) {
  const { Button, Checkbox } = orca.components;
  const [rows, setRows] = React.useState<readonly Row[]>(props.initial);
  const [sequential, setSequential] = React.useState(false);
  const nextKey = React.useRef(props.initial.length);
  // The row just added takes the focus.
  const [focusKey, setFocusKey] = React.useState<number | null>(null);
  const focusInput = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (focusKey !== null) focusInput.current?.focus();
  }, [focusKey]);
  const create = useCreateSplitSubtasks(
    props.createSplitSubtasks,
    props.pluginName,
  );
  const sequentialId = React.useId();
  const named = rows.filter((row) => row.title.trim() !== "").length;

  const update = (key: number, title: string) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, title } : row)),
    );
  const move = (index: number, by: -1 | 1) =>
    setRows((current) => {
      const next = [...current];
      const [moved] = next.splice(index, 1);
      if (moved) next.splice(index + by, 0, moved);
      return next;
    });
  const remove = (key: number) =>
    setRows((current) => current.filter((row) => row.key !== key));
  const add = () => {
    const key = nextKey.current++;
    setRows((current) => [...current, { key, title: "" }]);
    setFocusKey(key);
  };
  const confirm = async () => {
    const outcome = await create(props.parent.id, {
      titles: rows.map((row) => row.title),
      sequential,
    });
    if (outcome === "created") props.onClose();
  };

  return (
    <>
      <AiBody>
        {props.notSplittable !== undefined && (
          <div className="nextaction-split-not-splittable" role="note">
            <i className="ti ti-info-circle" aria-hidden="true" />
            <span>
              {t("The AI thinks this task need not be split: ${reason}", {
                reason: props.notSplittable,
              })}
            </span>
          </div>
        )}
        {rows.length > 0 && (
          <ol className="nextaction-split-rows">
            {rows.map((row, index) => (
              <DraftRow
                key={row.key}
                row={row}
                index={index}
                count={rows.length}
                onChange={(title) => update(row.key, title)}
                onMove={(by) => move(index, by)}
                onRemove={() => remove(row.key)}
                {...(row.key === focusKey && { inputRef: focusInput })}
              />
            ))}
          </ol>
        )}
        <div>
          <Button variant="outline" onClick={add}>
            <i className="ti ti-plus" aria-hidden="true" />
            {t("Add subtask")}
          </Button>
        </div>
        {!props.parent.sequential && (
          // Orca's Checkbox is a span, so a <label> cannot point at it: the
          // text names it through aria-labelledby.
          <div className="nextaction-split-sequential">
            <Checkbox
              role="checkbox"
              aria-checked={sequential}
              aria-labelledby={sequentialId}
              checked={sequential}
              onChange={({ checked }) => setSequential(checked)}
            />
            <span id={sequentialId}>{t("Do in order")}</span>
          </div>
        )}
      </AiBody>
      <WindowFooter>
        <span className="nextaction-split-hint">
          <i className="ti ti-subtask" aria-hidden="true" />
          {t("Goes below the task as todo subtasks")}
        </span>
        <Button variant="plain" onClick={props.onClose}>
          {t("Cancel")}
        </Button>
        <Button
          variant="solid"
          disabled={named === 0}
          onClick={() => void confirm()}
        >
          {t("Create")}
        </Button>
      </WindowFooter>
    </>
  );
}

function SplitSubtasksWindow(props: {
  parent: Task;
  draftSubtasks: DraftSubtasks;
  createSplitSubtasks: CreateSplitSubtasks;
  pluginName: string;
  onClose: () => void;
}) {
  const titleId = React.useId();
  const ai = useSubtaskDraft(props.draftSubtasks, props.parent.id);
  return (
    <PluginWindow
      onClose={props.onClose}
      className="nextaction-split"
      labelledBy={titleId}
    >
      <WindowHeader
        title={t("Split into subtasks")}
        titleId={titleId}
        task={props.parent}
        onClose={props.onClose}
      />
      <AiDraftContent
        ai={ai}
        onClose={props.onClose}
        renderDraft={(draft) => (
          <Draft
            parent={props.parent}
            initial={draft.items.map((item, key) => ({
              key,
              title: item.title,
              ...(item.uncertain !== undefined && {
                uncertain: item.uncertain,
              }),
            }))}
            {...(draft.notSplittable !== undefined && {
              notSplittable: draft.notSplittable,
            })}
            createSplitSubtasks={props.createSplitSubtasks}
            pluginName={props.pluginName}
            onClose={props.onClose}
          />
        )}
      />
    </PluginWindow>
  );
}

/**
 * Opens "Split into subtasks" for task `parent` (#202) in `render`'s root;
 * at most one at a time: opening it again for any task while it is open
 * does nothing.
 */
export type OpenSplitSubtasks = (parent: Task) => void;

export function createSplitSubtasksWindow(
  deps: {
    draftSubtasks: DraftSubtasks;
    createSplitSubtasks: CreateSplitSubtasks;
    pluginName: string;
  },
  render: (node: React.ReactNode) => void,
): OpenSplitSubtasks {
  let open = false;
  return (parent) => {
    if (open) return;
    open = true;
    render(
      <SplitSubtasksWindow
        parent={parent}
        draftSubtasks={deps.draftSubtasks}
        createSplitSubtasks={deps.createSplitSubtasks}
        pluginName={deps.pluginName}
        onClose={() => {
          open = false;
          // Unmounting cancels the AI request (useSubtaskDraft).
          render(null);
        }}
      />,
    );
  };
}
