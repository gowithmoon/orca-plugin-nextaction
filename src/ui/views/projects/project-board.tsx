// The project details' board layout (GLOSSARY: 布局, #166), by status
// (GLOSSARY: 分列方式): six columns, each card a project root task. The
// board scrolls sideways on its own, with scroll snapping; each column
// scrolls up and down on its own. The done column is collapsed to a narrow
// strip by default; open, its earlier cards open apart. Cards keep their
// actions: a click opens the task panel, the status icon the status menu,
// a right-click the task menu, and a card or an expanded subtask row drags
// into the notes, into another column to change its status (#168), or onto
// another card or row to become its last subtask, the target card then
// expanded (#169, board-drag.ts); a subtask row onto "As root task", at the
// right end while it is dragged, to the end of the project block (#170). A
// next action has a small dot at its status
// icon's top right. A card with subtasks says "Subtasks done/total" (direct
// subtasks only), with how many of its descendant tasks are doing or next
// actions while collapsed; expanded, it lists every descendant task as a
// compact row, indented, in note order (#167). By project root task (#171):
// "Other" first, then a column per project root task with subtasks, headed
// by the task itself, finished ones last as narrow strips; a drop in a
// column makes the task its last subtask, in "Other" a project root task.
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  BoardCard,
  BoardRow,
  ProjectBoard,
  RootBoard,
  RootBoardCards,
  RootColumn,
  RootColumnHead,
  StatusColumn,
} from "../../../application/usecases/read-project-board";
import {
  movesToProjectEnd,
  type TaskMove,
} from "../../../domain/blocking/task-move";
import type { ProjectId } from "../../../domain/project/project";
import type { CalendarDate, Task, TaskId } from "../../../domain/task/task";
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
import {
  type BoardDrag,
  boardColumnAttribute,
  boardOtherAttribute,
  boardProjectEndAttribute,
  boardRootAttribute,
  boardTaskAttribute,
  createBoardDrag,
} from "./board-drag";
import type { ExpandedCardsStore, IdSetStore } from "./project-board-stores";

/** The board's drag (#168, #169), for its cards and rows. */
const BoardDragContext = React.createContext<BoardDrag | undefined>(undefined);

/** A card's or a row's drag: into the notes, a column, a card or a row. */
function useBoardCardDrag(task: Task): React.HTMLAttributes<HTMLElement> {
  const drag = React.useContext(BoardDragContext);
  // The same target while the task is the same.
  const inPanel = React.useMemo(() => drag?.target(task), [drag, task]);
  return {
    ...useCardDrag(task, inPanel ? { inPanel } : {}),
    [boardTaskAttribute]: task.id,
  } as React.HTMLAttributes<HTMLElement>;
}

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
  const drag = useBoardCardDrag(row.task);
  const item = (onContextMenu?: (event: React.MouseEvent) => void) => (
    <li
      {...drag}
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
      <StatusButton task={row.task} actions={cards.actions} />
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
  const { card, cards } = props;
  // Narrowed so that none of its descendant tasks is found: the counts stay,
  // there is nothing to expand.
  const expandable = card.rows.length > 0;
  const expanded = expandable && props.expanded;
  const { doing, nextActions } = card.descendants;
  const summary = [
    doing > 0 ? t("Doing ${count}", { count: String(doing) }) : null,
    nextActions > 0 ? t("Next ${count}", { count: String(nextActions) }) : null,
  ].filter((part) => part !== null);
  const counts = t("Subtasks ${done}/${total}", {
    done: String(card.subtasks.done),
    total: String(card.subtasks.total),
  });
  return (
    <>
      <div className="nextaction-board-subtasks">
        {!expandable ? (
          <span className="nextaction-board-subtasks-count">{counts}</span>
        ) : (
          <button
            type="button"
            className="nextaction-board-subtasks-toggle"
            aria-expanded={expanded}
            aria-label={
              expanded ? t("Collapse subtasks") : t("Expand subtasks")
            }
            onClick={(event) => {
              event.stopPropagation();
              cards.expanded.toggle(card.task.id);
            }}
          >
            <i
              className={
                expanded ? "ti ti-chevron-down" : "ti ti-chevron-right"
              }
              aria-hidden="true"
            />
            {counts}
          </button>
        )}
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
    <div className="nextaction-board-card" {...useBoardCardDrag(card.task)}>
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
      {...{ [boardColumnAttribute]: column.status }}
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

/** The done column: open by default, collapsible to a narrow strip, earlier cards apart. */
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
        {...{ [boardColumnAttribute]: column.status }}
      >
        <StatusIcon status={column.status} />
        <span className="nextaction-board-strip-label">{label}</span>
        <span className="nextaction-board-column-count">{column.count}</span>
      </button>
    );
  }
  const collapse = t("Collapse ${column}", { column: label });
  return (
    <section
      className="nextaction-board-column"
      aria-label={label}
      {...{ [boardColumnAttribute]: column.status }}
    >
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

/**
 * The "As root task" drop (#170): shown by the board's style only while a
 * subtask row is dragged, a dashed place at the right end.
 */
function ProjectEndDrop() {
  return (
    <div
      className="nextaction-board-project-end"
      {...{ [boardProjectEndAttribute]: "" }}
    >
      <i className="ti ti-corner-left-up" aria-hidden="true" />
      <span>{t("As root task")}</span>
    </div>
  );
}

/** By project root task (#171): what is open, in memory. */
export interface RootColumnStores {
  /** The columns whose "Done N" is open; `"other"` for "Other". */
  readonly doneOpen: IdSetStore<TaskId | "other">;
  /** The finished columns opened from their strip. */
  readonly finishedOpen: IdSetStore<TaskId>;
}

/**
 * A column's body by project root task: its open cards, then "Done N",
 * collapsed by default, opening its done cards, faded.
 */
function RootColumnBody(props: {
  column: RootBoardCards;
  doneKey: TaskId | "other";
  cards: BoardCards;
  stores: RootColumnStores;
  empty?: React.ReactNode;
}) {
  const { column, doneKey, cards, stores } = props;
  const doneOpen = React.useSyncExternalStore(stores.doneOpen.subscribe, () =>
    stores.doneOpen.current().has(doneKey),
  );
  return (
    <div className="nextaction-board-column-body">
      {column.cards.length === 0 && column.done.length === 0 && props.empty}
      {column.cards.map((card) => (
        <Card key={card.task.id} card={card} cards={cards} />
      ))}
      {column.done.length > 0 && (
        <div className="nextaction-board-done">
          <button
            type="button"
            className="nextaction-board-earlier-toggle"
            aria-expanded={doneOpen}
            onClick={() => stores.doneOpen.toggle(doneKey)}
          >
            <i
              className={
                doneOpen ? "ti ti-chevron-down" : "ti ti-chevron-right"
              }
              aria-hidden="true"
            />
            {t("Done ${count}", { count: String(column.done.length) })}
          </button>
          {doneOpen &&
            column.done.map((card) => (
              <Card key={card.task.id} card={card} cards={cards} />
            ))}
        </div>
      )}
    </div>
  );
}

/**
 * A project root task's column head (#171): its status icon (the status
 * menu), its name (the task panel), a lock while blocked and "done/total"
 * of its direct subtasks; a right-click opens its task menu. Not draggable.
 */
function RootHead(props: {
  head: RootColumnHead;
  cards: BoardCards;
  children?: React.ReactNode;
}) {
  const { head, cards } = props;
  const text = shownText(head.task);
  const header = (onContextMenu?: (event: React.MouseEvent) => void) => (
    // biome-ignore lint/a11y/noStaticElementInteractions: the right-click task menu, as the task card's; its buttons stay reachable by keyboard
    <header
      className="nextaction-board-column-head"
      onContextMenu={onContextMenu}
    >
      <StatusButton task={head.task} actions={cards.actions} />
      <button
        type="button"
        className="nextaction-board-root-name"
        data-empty={text.empty || undefined}
        aria-current={head.task.id === cards.selectedTaskId || undefined}
        title={text.text}
        onClick={() => cards.selectTask(head.task.id)}
      >
        {text.text}
      </button>
      {head.blocked && (
        <span className="nextaction-board-row-lock" title={t("Blocked")}>
          <i className="ti ti-lock" aria-hidden="true" />
          <span className="nextaction-visually-hidden">{t("Blocked")}</span>
        </span>
      )}
      <span className="nextaction-board-column-count">
        {`${head.subtasks.done}/${head.subtasks.total}`}
      </span>
      {props.children}
    </header>
  );
  const menuItems = cards.menuItems;
  if (!menuItems) return header();
  return (
    <ContextMenu
      menu={(close) => (
        <TaskMenu
          items={menuItems}
          task={head.task}
          close={close}
          place={cards.menuPlace}
        />
      )}
    >
      {(open) => header(open)}
    </ContextMenu>
  );
}

/**
 * A project root task's column (#171); finished, a narrow strip until
 * opened, a drop place either way.
 */
function RootTaskColumn(props: {
  column: RootColumn;
  cards: BoardCards;
  stores: RootColumnStores;
}) {
  const { column, cards, stores } = props;
  const id = column.head.task.id;
  const opened = React.useSyncExternalStore(stores.finishedOpen.subscribe, () =>
    stores.finishedOpen.current().has(id),
  );
  const { Button, Tooltip } = orca.components;
  const label = shownText(column.head.task).text;
  const drop = { [boardRootAttribute]: id };
  if (column.finished && !opened) {
    return (
      <button
        type="button"
        className="nextaction-board-strip"
        aria-expanded={false}
        aria-label={t("Expand ${column}", { column: label })}
        title={t("Expand ${column}", { column: label })}
        onClick={() => stores.finishedOpen.toggle(id)}
        {...drop}
      >
        <StatusIcon status={column.head.task.status} />
        <span className="nextaction-board-strip-label">{label}</span>
        <span className="nextaction-board-column-count">
          {`${column.head.subtasks.done}/${column.head.subtasks.total}`}
        </span>
      </button>
    );
  }
  const collapse = t("Collapse ${column}", { column: label });
  return (
    <section className="nextaction-board-column" aria-label={label} {...drop}>
      <RootHead head={column.head} cards={cards}>
        {column.finished && (
          <>
            <span className="nextaction-board-column-spacer" />
            <Tooltip text={collapse}>
              <Button
                variant="plain"
                className="nextaction-board-column-button"
                aria-label={collapse}
                aria-expanded={true}
                onClick={() => stores.finishedOpen.toggle(id)}
              >
                <i className="ti ti-chevron-left" aria-hidden="true" />
              </Button>
            </Tooltip>
          </>
        )}
      </RootHead>
      <RootColumnBody
        column={column}
        doneKey={id}
        cards={cards}
        stores={stores}
      />
    </section>
  );
}

/**
 * The board by project root task (#171): "Other" first, the project root
 * tasks without subtasks its cards, a drop there making a task a project
 * root task; then the project root tasks' columns, finished ones last.
 * An empty "Other" shows only while dragging, or with no other column.
 */
function RootColumns(props: {
  board: RootBoard;
  cards: BoardCards;
  stores: RootColumnStores;
  filtering: boolean;
}) {
  const { board, cards, stores } = props;
  const otherEmpty = board.other.cards.length + board.other.done.length === 0;
  const hidesEmptyOther = board.columns.length > 0;
  return (
    <>
      {!(props.filtering && otherEmpty) && (
        <section
          className="nextaction-board-column"
          aria-label={t("Other")}
          data-empty={(otherEmpty && hidesEmptyOther) || undefined}
          {...{ [boardOtherAttribute]: "" }}
        >
          <header className="nextaction-board-column-head">
            <span
              className="nextaction-board-column-title"
              title={t("Project root tasks without subtasks")}
            >
              {t("Other")}
            </span>
            <span className="nextaction-board-column-count">
              {board.other.cards.length}
            </span>
          </header>
          <RootColumnBody
            column={board.other}
            doneKey="other"
            cards={cards}
            stores={stores}
            empty={
              <div className="nextaction-board-column-empty">
                {t("Drop here to make it a project root task")}
              </div>
            }
          />
        </section>
      )}
      {board.columns.map((column) => (
        <RootTaskColumn
          key={column.head.task.id}
          column={column}
          cards={cards}
          stores={stores}
        />
      ))}
    </>
  );
}

/** Every card on the board, earlier and done ones too. */
function allCards(board: ProjectBoard): BoardCard[] {
  if (board.grouping === "status") {
    return board.columns.flatMap((column) => [
      ...column.cards,
      ...column.earlier,
    ]);
  }
  return [board.other, ...board.columns].flatMap((column) => [
    ...column.cards,
    ...column.done,
  ]);
}

/**
 * The project root tasks on the board: by status every card, by project
 * root task "Other"'s cards and the columns' heads.
 */
function projectRoots(board: ProjectBoard): ReadonlySet<TaskId> {
  if (board.grouping === "status") {
    return new Set(allCards(board).map((card) => card.task.id));
  }
  return new Set([
    ...[...board.other.cards, ...board.other.done].map((card) => card.task.id),
    ...board.columns.map((column) => column.head.task.id),
  ]);
}

/** Every card's, row's and column head's task on the board, with its parent task. */
function boardParents(board: ProjectBoard): ReadonlyMap<TaskId, TaskId | null> {
  const parents = new Map<TaskId, TaskId | null>();
  if (board.grouping === "root") {
    for (const column of board.columns) {
      parents.set(column.head.task.id, column.head.parentId);
    }
  }
  for (const card of allCards(board)) {
    parents.set(card.task.id, card.parentId);
    for (const row of card.rows) parents.set(row.task.id, row.parentId);
  }
  return parents;
}

export function ProjectBoardColumns(props: {
  board: ProjectBoard;
  /** The project shown, for "As root task" (#170). */
  project: ProjectId;
  /** A filter or search is set: no empty "Other" (#172). */
  filtering: boolean;
  cards: BoardCards;
  doneColumn: DoneSectionStore;
  /** By project root task (#171): the open "Done N" and finished columns. */
  rootColumns: RootColumnStores;
  /**
   * Moves a task as the tree does: asking first across the project block's
   * boundary, refusals told (#169).
   */
  onMove: (move: TaskMove, at: { x: number; y: number }) => void;
}) {
  const { board, cards } = props;
  const root = React.useRef<HTMLElement>(null);
  const changeStatus = React.useRef(cards.actions.changeStatus);
  changeStatus.current = cards.actions.changeStatus;
  const boardParentsNow = React.useMemo(() => boardParents(board), [board]);
  const parents = React.useRef(boardParentsNow);
  parents.current = boardParentsNow;
  const projectRootsNow = React.useMemo(() => projectRoots(board), [board]);
  const projectEnd = React.useRef({
    roots: projectRootsNow,
    project: props.project,
    grouping: board.grouping,
  });
  projectEnd.current = {
    roots: projectRootsNow,
    project: props.project,
    grouping: board.grouping,
  };
  const onMove = React.useRef(props.onMove);
  onMove.current = props.onMove;
  const expanded = React.useRef(cards.expanded);
  expanded.current = cards.expanded;
  // The same through the board's life: a card's drag keeps its target.
  const [drag] = React.useState(() =>
    createBoardDrag(() => ({
      root: root.current,
      changeStatus: (task, status) => changeStatus.current(task, status),
      parentOf: (id) => parents.current.get(id) ?? null,
      // "As root task" only by status, and only for a task not a project
      // root task already; by project root task "Other" takes its place.
      takesProjectEnd: (id) =>
        projectEnd.current.grouping === "status" &&
        !projectEnd.current.roots.has(id),
      projectRoot: (id) => projectEnd.current.roots.has(id),
      project: projectEnd.current.project,
      move: (move, at) => {
        // The target card opens to show where it went; a row's card is open.
        if (!movesToProjectEnd(move)) {
          expanded.current.setAll([move.target], true);
        }
        onMove.current(move, at);
      },
    })),
  );
  return (
    <BoardDragContext.Provider value={drag}>
      <section
        ref={root}
        className="nextaction-board"
        aria-label={t("Board")}
        data-grouping={board.grouping}
      >
        {board.grouping === "root" ? (
          <RootColumns
            board={board}
            cards={cards}
            stores={props.rootColumns}
            filtering={props.filtering}
          />
        ) : (
          <>
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
            <ProjectEndDrop />
          </>
        )}
      </section>
    </BoardDragContext.Provider>
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
  const ids = allCards(board)
    .filter((card) => card.rows.length > 0)
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
