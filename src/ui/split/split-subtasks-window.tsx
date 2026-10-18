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
  PluginWindow,
  WindowFooter,
  WindowHeader,
  WindowSpacer,
} from "../components/plugin-window";
import { useCreateSplitSubtasks } from "../hooks/use-create-split-subtasks";
import { useSubtaskDraft } from "../hooks/use-subtask-draft";

/** One row of the draft as the user edits it. */
interface Row {
  /** Stable across edits, for React's keys. */
  readonly key: number;
  readonly title: string;
  /** Why the AI is unsure; shown only here, never written (GLOSSARY: 草稿). */
  readonly uncertain?: string;
}

/** The questions, each with its answer, then skip or go on. */
function Questions(props: {
  questions: readonly string[];
  onAnswer: (answers: readonly string[] | null) => void;
}) {
  const { Button, CompositionInput } = orca.components;
  const [answers, setAnswers] = React.useState(() =>
    props.questions.map(() => ""),
  );
  const idPrefix = React.useId();
  return (
    <>
      <div className="nextaction-split-body">
        <p className="nextaction-split-lead">
          {t("The AI would like to know a few things first:")}
        </p>
        {props.questions.map((question, index) => (
          <label
            // The questions do not change while shown.
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed list.
            key={index}
            className="nextaction-split-question"
            htmlFor={`${idPrefix}-${index}`}
          >
            <span>{question}</span>
            <CompositionInput
              id={`${idPrefix}-${index}`}
              value={answers[index] ?? ""}
              placeholder={t("Your answer (may be left empty)")}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const value = e.target.value;
                setAnswers((current) =>
                  current.map((answer, i) => (i === index ? value : answer)),
                );
              }}
            />
          </label>
        ))}
      </div>
      <WindowFooter>
        <WindowSpacer />
        <Button variant="plain" onClick={() => props.onAnswer(null)}>
          {t("Skip and get the draft")}
        </Button>
        <Button variant="solid" onClick={() => props.onAnswer(answers)}>
          {t("Answer")}
        </Button>
      </WindowFooter>
    </>
  );
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
      {row.uncertain !== undefined && (
        <div className="nextaction-split-uncertain">
          <span className="nextaction-split-badge">{t("Unsure")}</span>
          <span>{row.uncertain}</span>
        </div>
      )}
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
      <div className="nextaction-split-body">
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
      </div>
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
  const { Button } = orca.components;
  const titleId = React.useId();
  const { state, answer, retry } = useSubtaskDraft(
    props.draftSubtasks,
    props.parent.id,
  );
  let content: React.ReactNode;
  switch (state.kind) {
    case "waiting":
      content = (
        <>
          <div
            className="nextaction-split-body nextaction-split-waiting"
            role="status"
          >
            <i className="ti ti-loader-2" aria-hidden="true" />
            {t("The AI is drafting…")}
          </div>
          <WindowFooter>
            <WindowSpacer />
            <Button variant="plain" onClick={props.onClose}>
              {t("Cancel")}
            </Button>
          </WindowFooter>
        </>
      );
      break;
    case "questions":
      content = <Questions questions={state.questions} onAnswer={answer} />;
      break;
    case "draft":
      content = (
        <Draft
          parent={props.parent}
          initial={state.draft.items.map((item, key) => ({
            key,
            title: item.title,
            ...(item.uncertain !== undefined && { uncertain: item.uncertain }),
          }))}
          {...(state.draft.notSplittable !== undefined && {
            notSplittable: state.draft.notSplittable,
          })}
          createSplitSubtasks={props.createSplitSubtasks}
          pluginName={props.pluginName}
          onClose={props.onClose}
        />
      );
      break;
    case "failed":
      content = (
        <>
          <div className="nextaction-split-body" role="alert">
            {state.message}
          </div>
          <WindowFooter>
            <WindowSpacer />
            <Button variant="plain" onClick={props.onClose}>
              {t("Close")}
            </Button>
            <Button variant="solid" onClick={retry}>
              {t("Try again")}
            </Button>
          </WindowFooter>
        </>
      );
      break;
  }
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
      {content}
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
