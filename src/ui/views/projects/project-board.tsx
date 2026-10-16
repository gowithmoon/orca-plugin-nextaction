// The project details' board layout (GLOSSARY: 布局, #166), by status
// (GLOSSARY: 分列方式): six columns, each card a project root task. The
// board scrolls sideways on its own, with scroll snapping; each column
// scrolls up and down on its own. The done column is collapsed to a narrow
// strip by default; open, its earlier cards open apart. Cards keep their
// actions: a click opens the task panel, the status icon the status menu,
// a right-click the task menu, and a card drags into the notes. No drag
// within the board yet (#168). Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  BoardCard,
  ProjectBoard,
  StatusColumn,
} from "../../../application/usecases/read-project-board";
import type { CalendarDate } from "../../../domain/task/task";
import { t } from "../../../shared/l10n/l10n";
import { StatusIcon } from "../../components/status-icon";
import { statusLabel } from "../../components/status-label";
import { TaskCard } from "../../components/task-card";
import { useCardDrag } from "../../drag/card-drag";
import type { TaskActions } from "../../hooks/use-task-actions";
import type { TaskMenuItems, TaskMenuPlace } from "../../task-menu/menu-items";
import type { DoneSectionStore } from "../all-tasks/done-section-store";

/** What the board's cards need. */
export interface BoardCards {
  readonly today: CalendarDate;
  readonly actions: TaskActions;
  readonly menuItems: TaskMenuItems | undefined;
  readonly menuPlace: TaskMenuPlace;
  readonly selectedTaskId: number | undefined;
  readonly selectTask: (id: number) => void;
}

function Card(props: { card: BoardCard; cards: BoardCards }) {
  const { card, cards } = props;
  return (
    <div className="nextaction-board-card" {...useCardDrag(card.task)}>
      <TaskCard
        task={card.task}
        today={cards.today}
        actions={cards.actions}
        menuItems={cards.menuItems}
        menuPlace={cards.menuPlace}
        onOpen={(open) => cards.selectTask(open.id)}
        selected={card.task.id === cards.selectedTaskId}
        parentText={card.parentText}
        blocked={card.blocked}
      />
    </div>
  );
}

function ColumnHead(props: {
  column: StatusColumn;
  children?: React.ReactNode;
}) {
  const { column } = props;
  return (
    <header className="nextaction-board-column-head">
      <StatusIcon status={column.status} />
      <span className="nextaction-board-column-title">
        {statusLabel(column.status)}
      </span>
      <span className="nextaction-board-column-count">{column.count}</span>
      {props.children}
    </header>
  );
}

function Column(props: { column: StatusColumn; cards: BoardCards }) {
  const { column, cards } = props;
  return (
    <section
      className="nextaction-board-column"
      aria-label={statusLabel(column.status)}
    >
      <ColumnHead column={column} />
      <div className="nextaction-board-column-body">
        {column.cards.length === 0 ? (
          <div className="nextaction-board-column-empty">{t("No tasks")}</div>
        ) : (
          column.cards.map((card) => (
            <Card key={card.task.id} card={card} cards={cards} />
          ))
        )}
      </div>
    </section>
  );
}

/** The done column: a narrow strip until opened, earlier cards apart. */
function DoneColumn(props: {
  column: StatusColumn;
  cards: BoardCards;
  store: DoneSectionStore;
}) {
  const { column, cards, store } = props;
  const state = React.useSyncExternalStore(store.subscribe, store.current);
  const { Button, Tooltip } = orca.components;
  const label = statusLabel(column.status);
  if (!state.expanded) {
    return (
      <button
        type="button"
        className="nextaction-board-strip"
        aria-expanded={false}
        aria-label={t("Expand ${column}", { column: label })}
        title={t("Expand ${column}", { column: label })}
        onClick={() => store.set({ ...state, expanded: true })}
      >
        <StatusIcon status={column.status} />
        <span className="nextaction-board-strip-label">{label}</span>
        <span className="nextaction-board-column-count">{column.count}</span>
      </button>
    );
  }
  const collapse = t("Collapse ${column}", { column: label });
  return (
    <section className="nextaction-board-column" aria-label={label}>
      <ColumnHead column={column}>
        <span className="nextaction-board-column-spacer" />
        <Tooltip text={collapse}>
          <Button
            variant="plain"
            className="nextaction-board-column-button"
            aria-label={collapse}
            aria-expanded={true}
            onClick={() => store.set({ ...state, expanded: false })}
          >
            <i className="ti ti-chevron-left" aria-hidden="true" />
          </Button>
        </Tooltip>
      </ColumnHead>
      <div className="nextaction-board-column-body">
        {column.cards.length === 0 && column.earlier.length === 0 && (
          <div className="nextaction-board-column-empty">{t("No tasks")}</div>
        )}
        {column.cards.map((card) => (
          <Card key={card.task.id} card={card} cards={cards} />
        ))}
        {column.earlier.length > 0 && (
          <>
            <button
              type="button"
              className="nextaction-board-earlier-toggle"
              aria-expanded={state.showEarlier}
              onClick={() =>
                store.set({ ...state, showEarlier: !state.showEarlier })
              }
            >
              <i
                className={
                  state.showEarlier
                    ? "ti ti-chevron-down"
                    : "ti ti-chevron-right"
                }
                aria-hidden="true"
              />
              {t("Earlier done ${count}", {
                count: String(column.earlier.length),
              })}
            </button>
            {state.showEarlier &&
              column.earlier.map((card) => (
                <Card key={card.task.id} card={card} cards={cards} />
              ))}
          </>
        )}
      </div>
    </section>
  );
}

export function ProjectBoardColumns(props: {
  board: ProjectBoard;
  cards: BoardCards;
  doneColumn: DoneSectionStore;
}) {
  const { board, cards } = props;
  return (
    <section className="nextaction-board" aria-label={t("Board")}>
      {board.columns.map((column) =>
        column.status === "done" ? (
          <DoneColumn
            key={column.status}
            column={column}
            cards={cards}
            store={props.doneColumn}
          />
        ) : (
          <Column key={column.status} column={column} cards={cards} />
        ),
      )}
    </section>
  );
}
