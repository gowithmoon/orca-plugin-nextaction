// The project details' board layout (GLOSSARY: 布局, #166), by status
// (GLOSSARY: 分列方式): six columns, each card a project root task. The
// board scrolls sideways on its own, with scroll snapping; each column
// scrolls up and down on its own. The done column is collapsed to a narrow
// strip by default; open, its earlier cards open apart. Cards keep their
// actions: a click opens the task panel, the status icon the status menu,
// a right-click the task menu, and a card drags into the notes. No drag
// within the board yet (#168). A next action has a small dot at its status
// icon's top right. A card with subtasks says "Subtasks done/total" (direct
// subtasks only), with how many of its descendant tasks are doing or next
// actions while collapsed; expanded, it lists every descendant task as a
// compact row, indented, in note order (#167). Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  BoardCard,
  BoardRow,
  ProjectBoard,
  StatusColumn,
} from "../../../application/usecases/read-project-board";
import type { CalendarDate } from "../../../domain/task/task";
import { t } from "../../../shared/l10n/l10n";
import { shownText } from "../../components/format";
import { ContextMenu } from "../../components/popup-controls";
import { StatusIcon } from "../../components/status-icon";
import { statusLabel } from "../../components/status-label";
import { StatusButton, TaskCard } from "../../components/task-card";
import { useCardDrag } from "../../drag/card-drag";
import type { TaskActions } from "../../hooks/use-task-actions";
import type { TaskMenuItems, TaskMenuPlace } from "../../task-menu/menu-items";
import { TaskMenu } from "../../task-menu/task-menu";
import type { DoneSectionStore } from "../all-tasks/done-section-store";
import type { ExpandedCardsStore } from "./project-board-stores";

/** What the board's cards need. */
export interface BoardCards {
  readonly today: CalendarDate;
  readonly actions: TaskActions;
  readonly menuItems: TaskMenuItems | undefined;
  readonly menuPlace: TaskMenuPlace;
  readonly selectedTaskId: number | undefined;
  readonly selectTask: (id: number) => void;
  /** The cards whose subtasks are expanded (#167). */
  readonly expanded: ExpandedCardsStore;
}

/** A descendant task's compact row in an expanded card (#167). */
function Row(props: { row: BoardRow; cards: BoardCards }) {
  const { row, cards } = props;
  const text = shownText(row.task);
  const selected = row.task.id === cards.selectedTaskId;
  const item = (onContextMenu?: (event: React.MouseEvent) => void) => (
    <li
      className="nextaction-board-row"
      style={{ "--nextaction-row-depth": row.depth } as React.CSSProperties}
      data-done={row.task.status === "done" || undefined}
      data-selected={selected || undefined}
      aria-current={selected || undefined}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: as the task card, focusable so Enter opens the task panel; it holds a button, so it cannot be one
      tabIndex={0}
      // Not a click on the card: the row opens its own task.
      onClick={(event) => {
        event.stopPropagation();
        cards.selectTask(row.task.id);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target === event.currentTarget) {
          event.preventDefault();
          event.stopPropagation();
          cards.selectTask(row.task.id);
        }
      }}
      onContextMenu={
        onContextMenu &&
        ((event) => {
          // Its own task menu, not the card's.
          event.stopPropagation();
          onContextMenu(event);
        })
      }
    >
      <StatusButton
        task={row.task}
        actions={cards.actions}
        nextAction={row.nextAction}
      />
      <span
        className="nextaction-board-row-text"
        data-empty={text.empty || undefined}
        title={text.text}
      >
        {text.text}
      </span>
      {row.blocked && (
        <span className="nextaction-board-row-lock" title={t("Blocked")}>
          <i className="ti ti-lock" aria-hidden="true" />
          <span className="nextaction-visually-hidden">{t("Blocked")}</span>
        </span>
      )}
    </li>
  );
  const menuItems = cards.menuItems;
  if (!menuItems) return item();
  return (
    <ContextMenu
      menu={(close) => (
        <TaskMenu
          items={menuItems}
          task={row.task}
          close={close}
          place={cards.menuPlace}
        />
      )}
    >
      {(open) => item(open)}
    </ContextMenu>
  );
}

/**
 * Below a card's property row, with subtasks (#167): "Subtasks done/total"
 * and its toggle; collapsed, the descendant tasks doing and next actions,
 * those at 0 left out; expanded, the rows.
 */
function Subtasks(props: {
  card: BoardCard;
  cards: BoardCards;
  expanded: boolean;
}) {
  const { card, cards, expanded } = props;
  const { doing, nextActions } = card.descendants;
  const summary = [
    doing > 0 ? t("Doing ${count}", { count: String(doing) }) : null,
    nextActions > 0 ? t("Next ${count}", { count: String(nextActions) }) : null,
  ].filter((part) => part !== null);
  return (
    <>
      <div className="nextaction-board-subtasks">
        <button
          type="button"
          className="nextaction-board-subtasks-toggle"
          aria-expanded={expanded}
          aria-label={expanded ? t("Collapse subtasks") : t("Expand subtasks")}
          onClick={(event) => {
            event.stopPropagation();
            cards.expanded.toggle(card.task.id);
          }}
        >
          <i
            className={expanded ? "ti ti-chevron-down" : "ti ti-chevron-right"}
            aria-hidden="true"
          />
          {t("Subtasks ${done}/${total}", {
            done: String(card.subtasks.done),
            total: String(card.subtasks.total),
          })}
        </button>
        {!expanded && summary.length > 0 && (
          <span className="nextaction-board-subtasks-summary">
            {summary.join(" · ")}
          </span>
        )}
      </div>
      {expanded && (
        <ul className="nextaction-board-rows">
          {card.rows.map((row) => (
            <Row key={row.task.id} row={row} cards={cards} />
          ))}
        </ul>
      )}
    </>
  );
}

function Card(props: { card: BoardCard; cards: BoardCards }) {
  const { card, cards } = props;
  const expanded = React.useSyncExternalStore(cards.expanded.subscribe, () =>
    cards.expanded.current().has(card.task.id),
  );
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
        nextAction={card.nextAction}
        footer={
          card.subtasks.total > 0 && (
            <Subtasks card={card} cards={cards} expanded={expanded} />
          )
        }
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

/**
 * The board's "Collapse all / Expand all" (#167), over the cards with
 * subtasks, earlier done ones too; none: no button. Collapses all while any
 * is expanded.
 */
export function BoardCollapseAllButton(props: {
  board: ProjectBoard;
  expanded: ExpandedCardsStore;
}) {
  const { board, expanded } = props;
  const { Button, Tooltip } = orca.components;
  const current = React.useSyncExternalStore(
    expanded.subscribe,
    expanded.current,
  );
  const ids = board.columns
    .flatMap((column) => [...column.cards, ...column.earlier])
    .filter((card) => card.subtasks.total > 0)
    .map((card) => card.task.id);
  if (ids.length === 0) return null;
  const anyExpanded = ids.some((id) => current.has(id));
  const label = anyExpanded ? t("Collapse all") : t("Expand all");
  return (
    <Tooltip text={label}>
      <Button
        variant="plain"
        className="nextaction-toolbar-button"
        aria-label={label}
        onClick={() => expanded.setAll(ids, !anyExpanded)}
      >
        <i
          className={anyExpanded ? "ti ti-fold" : "ti ti-fold-down"}
          aria-hidden="true"
        />
      </Button>
    </Tooltip>
  );
}
