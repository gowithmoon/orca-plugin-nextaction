// The stats view's selection list (GLOSSARY: 统计视图, #137): what the day
// (the month) or the distribution's item picked above holds, the latest
// first, a recurring task once for each completion or skip. Each entry says
// whether it was done or skipped and when, as the review's look back does,
// above the task card every view uses: a click opens the task panel, a
// right-click the task menu, and it drags into the notes. Without a
// selection only a hint shows. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { LinkTaskInNote } from "../../../application/usecases/link-task-in-note";
import type { ReadStatsResult } from "../../../application/usecases/read-stats";
import type { SelectedEntry } from "../../../domain/stats/stats-selection";
import type { CalendarDate, Task } from "../../../domain/task/task";
import { t } from "../../../shared/l10n/l10n";
import { formatClock, formatDate } from "../../components/format";
import { TaskCard } from "../../components/task-card";
import { CardDragArea, useCardDrag } from "../../drag/card-drag";
import { useLinkTaskInNote } from "../../hooks/use-link-task-in-note";
import {
  type TaskActionsDeps,
  useTaskActions,
} from "../../hooks/use-task-actions";
import { usePanel } from "../../panel/panel-context";
import type { TaskMenuItems } from "../../task-menu/menu-items";
import { toCalendarDate } from "../../task-panel/task-panel-fields";

/** What the list's cards need, as the other views' cards do. */
export interface StatsSelectionListDeps {
  /** A card dropped on a block in a note panel links the task there. */
  readonly linkTaskInNote: LinkTaskInNote;
  /** The cards' status menu, "open in notes" and notices. */
  readonly taskActions: TaskActionsDeps;
  /** The task menu's registrations, for a right-click on a card. */
  readonly menuItems: () => TaskMenuItems | undefined;
}

export function StatsSelectionList(props: {
  /** The entries read for the selection. */
  entries: ReadStatsResult["selected"];
  /** Whether something is selected; a hint shows otherwise. */
  selected: boolean;
  today: CalendarDate;
  deps: StatsSelectionListDeps;
}) {
  const { entries, today, deps } = props;
  const actions = useTaskActions(deps.taskActions);
  const menuItems = deps.menuItems();
  const { selectedTaskId, selectTask } = usePanel();
  const menuPlace = React.useMemo(() => ({ selectTask }), [selectTask]);
  const linkTaskInNote = useLinkTaskInNote(
    deps.linkTaskInNote,
    deps.taskActions.notify,
  );

  if (!props.selected) {
    return (
      <p className="nextaction-stats-empty">
        {t("Pick a bar or an item above to see its tasks")}
      </p>
    );
  }
  if (entries.length === 0) {
    return (
      <p className="nextaction-stats-empty" role="status">
        {t("Nothing completed or skipped")}
      </p>
    );
  }
  return (
    <CardDragArea onNoteDrop={linkTaskInNote}>
      <ul className="nextaction-task-list nextaction-stats-selection-list">
        {entries.map((entry) => (
          <StatsEntryItem
            key={`${entry.task.id}-${entry.at.getTime()}-${entry.kind}`}
            entry={entry}
            today={today}
          >
            <TaskCard
              task={entry.task}
              today={today}
              actions={actions}
              menuItems={menuItems}
              menuPlace={menuPlace}
              onOpen={(open) => selectTask(open.id)}
              selected={entry.task.id === selectedTaskId}
              project={entry.project}
            />
          </StatsEntryItem>
        ))}
      </ul>
    </CardDragArea>
  );
}

/**
 * An entry's list item, dragged by a press anywhere on it: whether it was
 * done or skipped and when, as in the review's look back, then its card.
 * "When" is the date and time it happened, not the logical day it counts
 * on, so one done before the day boundary shows why it falls on the day
 * before.
 */
function StatsEntryItem(props: {
  entry: SelectedEntry<Task>;
  today: CalendarDate;
  children: React.ReactNode;
}) {
  const { entry, today } = props;
  const skipped = entry.kind === "skip";
  return (
    <li {...useCardDrag(entry.task)}>
      <div className="nextaction-stats-entry-kind" data-kind={entry.kind}>
        <i
          className={
            skipped ? "ti ti-player-skip-forward" : "ti ti-circle-check"
          }
          aria-hidden="true"
        />
        <span>{skipped ? t("Skipped") : t("Done")}</span>
        <span className="nextaction-stats-entry-when">
          {`${formatDate(toCalendarDate(entry.at), today)} ${formatClock(entry.at)}`}
        </span>
      </div>
      {props.children}
    </li>
  );
}
