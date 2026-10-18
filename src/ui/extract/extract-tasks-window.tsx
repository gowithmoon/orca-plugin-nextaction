// The "Extract tasks" window (GLOSSARY: 提取任务, #204): the AI may ask a
// few questions first, then gives a draft of the tasks it found in the
// selected blocks; the user ticks, renames and dates them, picks where they
// go, and confirms; only then are they written, as inbox tasks, in one undo.
// Closing the window cancels the request and writes nothing. Verified by
// hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  CreateExtractedTasks,
  ExtractPlacement,
} from "../../application/usecases/create-extracted-tasks";
import type {
  DraftExtractedTasks,
  ExtractedTaskItem,
} from "../../application/usecases/draft-extracted-tasks";
import type { CalendarDate } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import {
  AiBody,
  AiDraftContent,
  UncertainNote,
} from "../components/ai-draft-parts";
import type { MemoryStore } from "../components/memory-store";
import {
  PluginWindow,
  WindowFooter,
  WindowHeader,
  WindowSpacer,
} from "../components/plugin-window";
import { useExtractDraft } from "../hooks/use-ai-draft";
import { useCreateExtractedTasks } from "../hooks/use-create-extracted-tasks";
import { DateField } from "../task-panel/task-panel-fields";

/** What the window needs besides the blocks. */
export interface ExtractTasksDeps {
  draftExtractedTasks: DraftExtractedTasks;
  createExtractedTasks: CreateExtractedTasks;
  /** The last placement confirmed in this load; "below" after a load. */
  placement: MemoryStore<ExtractPlacement>;
  today: () => CalendarDate;
  pluginName: string;
}

/** One row of the draft as the user edits it. */
interface Row {
  readonly key: number;
  readonly checked: boolean;
  readonly title: string;
  readonly start: CalendarDate | null;
  readonly due: CalendarDate | null;
  readonly quote: string;
  /** Why the AI is unsure; shown only here, never written (GLOSSARY: 草稿). */
  readonly uncertain?: string;
}

const placements: readonly ExtractPlacement[] = [
  "below",
  "children",
  "journal",
];

function placementLabel(placement: ExtractPlacement): string {
  switch (placement) {
    case "below":
      return t("Below the selection");
    case "children":
      return t("As child blocks");
    case "journal":
      return t("End of today's journal");
  }
}

/** One draft item: tick, name, dates, the quote and the AI's doubt. */
function DraftRow(props: {
  row: Row;
  index: number;
  today: CalendarDate;
  onChange: (row: Row) => void;
}) {
  const { Checkbox, CompositionInput } = orca.components;
  const { row } = props;
  const id = React.useId();
  const label = t("Task ${n}", { n: String(props.index + 1) });
  return (
    <li
      className="nextaction-extract-row"
      data-unchecked={!row.checked || undefined}
    >
      <div className="nextaction-extract-row-main">
        <Checkbox
          role="checkbox"
          aria-checked={row.checked}
          aria-label={t("Create ${task}", { task: label })}
          checked={row.checked}
          onChange={({ checked }) => props.onChange({ ...row, checked })}
        />
        <CompositionInput
          aria-label={label}
          value={row.title}
          placeholder={t("Task name")}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            props.onChange({ ...row, title: e.target.value })
          }
        />
      </div>
      <div className="nextaction-extract-row-dates">
        <span className="nextaction-extract-date-label" id={`${id}-start`}>
          {t("Start")}
        </span>
        <DateField
          labelId={`${id}-start`}
          value={row.start}
          today={props.today}
          onChange={(start) => props.onChange({ ...row, start })}
        />
        <span className="nextaction-extract-date-label" id={`${id}-due`}>
          {t("Due")}
        </span>
        <DateField
          labelId={`${id}-due`}
          value={row.due}
          today={props.today}
          onChange={(due) => props.onChange({ ...row, due })}
        />
      </div>
      {row.quote !== "" && (
        <blockquote className="nextaction-extract-quote">
          {row.quote}
        </blockquote>
      )}
      {row.uncertain !== undefined && <UncertainNote reason={row.uncertain} />}
    </li>
  );
}

/** The draft to tick, edit and place, then confirm. */
function Draft(props: {
  blockIds: readonly number[];
  items: readonly ExtractedTaskItem[];
  deps: ExtractTasksDeps;
  onClose: () => void;
}) {
  const { Button, Segmented } = orca.components;
  const { deps } = props;
  const [rows, setRows] = React.useState<readonly Row[]>(() =>
    props.items.map((item, key) => ({
      key,
      checked: true,
      title: item.title,
      start: item.start ?? null,
      due: item.due ?? null,
      quote: item.quote,
      ...(item.uncertain !== undefined && { uncertain: item.uncertain }),
    })),
  );
  const [placement, setPlacement] = React.useState(() =>
    deps.placement.current(),
  );
  const create = useCreateExtractedTasks(
    deps.createExtractedTasks,
    deps.pluginName,
  );
  const placementId = React.useId();
  const today = deps.today();
  const chosen = rows.filter((row) => row.checked);
  const named = chosen.filter((row) => row.title.trim() !== "").length;

  const update = (next: Row) =>
    setRows((current) =>
      current.map((row) => (row.key === next.key ? next : row)),
    );
  const confirm = async () => {
    const outcome = await create(
      props.blockIds,
      placement,
      chosen.map((row) => ({
        title: row.title,
        start: row.start,
        due: row.due,
      })),
    );
    if (outcome !== "created") return;
    // Remembered for this load (#204): the next window starts with it.
    deps.placement.set(placement);
    props.onClose();
  };

  return (
    <>
      <AiBody>
        <ol className="nextaction-extract-rows">
          {rows.map((row, index) => (
            <DraftRow
              key={row.key}
              row={row}
              index={index}
              today={today}
              onChange={update}
            />
          ))}
        </ol>
        <div className="nextaction-extract-placement">
          <span className="nextaction-extract-placement-label" id={placementId}>
            {t("Put them")}
          </span>
          <Segmented
            role="group"
            aria-labelledby={placementId}
            selected={placement}
            options={placements.map((value) => ({
              value,
              label: placementLabel(value),
            }))}
            onChange={(value) => {
              const next = placements.find((p) => p === value);
              if (next) setPlacement(next);
            }}
          />
          {props.blockIds.length > 1 && placement !== "journal" && (
            <span className="nextaction-extract-hint">
              {t("Next to the last selected block")}
            </span>
          )}
        </div>
      </AiBody>
      <WindowFooter>
        <span className="nextaction-extract-hint nextaction-extract-footer-hint">
          <i className="ti ti-inbox" aria-hidden="true" />
          {t("Created as inbox tasks")}
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

/** The AI looked and found nothing to do (#204). */
function NothingToExtract(props: { onClose: () => void }) {
  const { Button } = orca.components;
  return (
    <>
      <AiBody role="status" className="nextaction-extract-nothing">
        <i className="ti ti-info-circle" aria-hidden="true" />
        <span>
          {t(
            "The AI found nothing to do in the selected blocks. Blocks that are tasks already are left out.",
          )}
        </span>
      </AiBody>
      <WindowFooter>
        <WindowSpacer />
        <Button variant="solid" onClick={props.onClose}>
          {t("Close")}
        </Button>
      </WindowFooter>
    </>
  );
}

function ExtractTasksWindow(props: {
  blockIds: readonly number[];
  deps: ExtractTasksDeps;
  onClose: () => void;
}) {
  const titleId = React.useId();
  const ai = useExtractDraft(props.deps.draftExtractedTasks, props.blockIds);
  return (
    <PluginWindow
      onClose={props.onClose}
      className="nextaction-extract"
      labelledBy={titleId}
    >
      <WindowHeader
        title={t("Extract tasks")}
        titleId={titleId}
        onClose={props.onClose}
      />
      <AiDraftContent
        ai={ai}
        onClose={props.onClose}
        renderDraft={(draft) =>
          draft.kind === "nothing" ? (
            <NothingToExtract onClose={props.onClose} />
          ) : (
            <Draft
              blockIds={props.blockIds}
              items={draft.items}
              deps={props.deps}
              onClose={props.onClose}
            />
          )
        }
      />
    </PluginWindow>
  );
}

/**
 * Opens "Extract tasks" for blocks `blockIds` (in note order, #204) in
 * `render`'s root; at most one at a time: opening it again while it is open
 * does nothing.
 */
export type OpenExtractTasks = (blockIds: readonly number[]) => void;

export function createExtractTasksWindow(
  deps: ExtractTasksDeps,
  render: (node: React.ReactNode) => void,
): OpenExtractTasks {
  let open = false;
  return (blockIds) => {
    if (open || blockIds.length === 0) return;
    open = true;
    render(
      <ExtractTasksWindow
        blockIds={blockIds}
        deps={deps}
        onClose={() => {
          open = false;
          // Unmounting cancels the AI request (useExtractDraft).
          render(null);
        }}
      />,
    );
  };
}
