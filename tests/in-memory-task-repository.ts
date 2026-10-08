// A TaskRepository in memory, for use case tests (docs/ARCHITECTURE.md §5).
// It keeps the port's semantics: a block that is not a task reads as `null`
// and its completion history as empty; a write that fails changes
// nothing. Orca details (mirrors, orphans, note-facing names) are covered by
// the codec tests and not modelled here: a block that cannot be converted is
// simply marked so.
import type {
  ChoiceProperty,
  CompletionHistoryRead,
  ConvertToTaskResult,
  NotConvertibleReason,
  TaskFilter,
  TaskRepository,
  ValuesFilter,
} from "../src/application/ports/task-repository";
import type { CalendarDate, Task, TaskId } from "../src/domain/task/task";
import type { TaskChanges } from "../src/domain/task/task-changes";

interface StoredBlock {
  text: string;
  /** When the block was created; a task keeps its block's. */
  created: Date;
  parentId: number | undefined;
  notConvertible: NotConvertibleReason | undefined;
  /** Present while the block carries the task tag. */
  task: Task | undefined;
  /**
   * The stored completion history, `undefined` when none is. Kept when the
   * task tag goes, as Orca does (block-properties-json J4).
   */
  completionHistory: CompletionHistoryRead | undefined;
}

export interface BlockSetup {
  text?: string;
  /** Defaults to `defaultCreated`. */
  created?: Date;
  parentId?: number;
  notConvertible?: NotConvertibleReason;
  completionHistory?: CompletionHistoryRead;
}

export interface InMemoryTaskRepository extends TaskRepository {
  /** Adds a block that is not a task. */
  addBlock(id: number, setup?: BlockSetup): void;
  /** Adds a task; unspecified values are those of a freshly tagged task. */
  addTask(
    task: Partial<Task> & { id: TaskId },
    setup?: Omit<BlockSetup, "notConvertible" | "text">,
  ): void;
  /** The task tag's choices for contexts or labels (none unless set). */
  setChoices(property: ChoiceProperty, choices: readonly string[]): void;
  /** Every write from now on fails with `error`; `undefined` stops it. */
  failWrites(error: Error | undefined): void;
  /** How many writes succeeded. */
  writeCount(): number;
  /**
   * The day of the journal a block was appended to with
   * `appendTaskToJournal`, or `undefined` when it was not.
   */
  journalOf(id: number): CalendarDate | undefined;
}

/** When a block was created, unless a test says otherwise. */
export const defaultCreated = new Date("2026-01-01T00:00:00.000Z");

/** What a block tagged without values reads as (tag-operations). */
function freshTask(id: TaskId, text: string, created: Date): Task {
  return {
    id,
    text,
    created,
    status: "inbox",
    importance: 4,
    effort: 4,
    start: null,
    due: null,
    contexts: [],
    labels: [],
    note: null,
    anomalies: [],
  };
}

function matchesValues(
  values: readonly string[],
  filter: ValuesFilter | undefined,
): boolean {
  if (!filter) return true;
  return (
    (filter.includes ?? []).every((v) => values.includes(v)) &&
    (filter.excludes ?? []).every((v) => !values.includes(v))
  );
}

export function createInMemoryTaskRepository(): InMemoryTaskRepository {
  const blocks = new Map<number, StoredBlock>();
  let failure: Error | undefined;
  /** The task tag's choices per property. */
  const choices: Record<ChoiceProperty, string[]> = {
    contexts: [],
    labels: [],
  };
  let writes = 0;
  /** Journal days by block, for blocks appended to a journal. */
  const journalDays = new Map<number, CalendarDate>();
  /** IDs of new blocks, far from the ones tests pick. */
  let nextId = 100_000;

  const store = (id: number, block: StoredBlock) => {
    if (blocks.has(id)) throw new Error(`block ${id} already exists`);
    blocks.set(id, block);
  };

  /** The block of a task; a block that is not a task fails the write. */
  const taskToWrite = (id: TaskId) => {
    const block = blocks.get(id);
    if (!block?.task) throw new Error(`block ${id} is not a task`);
    return block as StoredBlock & { task: Task };
  };

  /** A completion history this plugin cannot read is never overwritten. */
  const refuseUnreadable = (block: StoredBlock, id: TaskId) => {
    const current = block.completionHistory;
    if (current?.kind === "unreadable") {
      throw new Error(
        `the completion history of block ${id} holds a value this plugin cannot read (${current.reason})`,
      );
    }
  };

  /** Runs a write: all of it, or (when writes fail) none of it. */
  const write = (apply: () => void) => {
    if (failure) throw failure;
    apply();
    writes += 1;
  };

  const isBelow = (id: number, ancestorId: number) => {
    const seen = new Set<number>();
    let parentId = blocks.get(id)?.parentId;
    while (parentId !== undefined && !seen.has(parentId)) {
      if (parentId === ancestorId) return true;
      seen.add(parentId);
      parentId = blocks.get(parentId)?.parentId;
    }
    return false;
  };

  return {
    addBlock(id, setup = {}) {
      store(id, {
        text: setup.text ?? "",
        created: setup.created ?? defaultCreated,
        parentId: setup.parentId,
        notConvertible: setup.notConvertible,
        task: undefined,
        completionHistory: setup.completionHistory,
      });
    },

    addTask(task, setup = {}) {
      const full = { ...freshTask(task.id, "", defaultCreated), ...task };
      store(task.id, {
        text: full.text,
        created: full.created,
        parentId: setup.parentId,
        notConvertible: undefined,
        task: full,
        completionHistory: setup.completionHistory,
      });
    },

    setChoices(property, values) {
      choices[property] = [...values];
    },

    failWrites(error) {
      failure = error;
    },

    writeCount: () => writes,

    journalOf: (id) => journalDays.get(id),

    async getTask(id) {
      return blocks.get(id)?.task ?? null;
    },

    async queryTasks(filter: TaskFilter) {
      const tasks: Task[] = [];
      for (const [id, block] of blocks) {
        const task = block.task;
        if (!task) continue;
        // As in Orca, a status the notes do not hold as one of the plugin's
        // matches no status filter (inbox-anomalous-status).
        const statusAnomaly = task.anomalies.some(
          (anomaly) => anomaly.property === "status",
        );
        if (
          filter.statuses &&
          (statusAnomaly || !filter.statuses.includes(task.status))
        ) {
          continue;
        }
        if (!matchesValues(task.contexts, filter.contexts)) continue;
        if (!matchesValues(task.labels, filter.labels)) continue;
        if (
          filter.underBlockId !== undefined &&
          !isBelow(id, filter.underBlockId)
        ) {
          continue;
        }
        tasks.push(task);
      }
      return tasks;
    },

    async updateTask(id, changes: TaskChanges, completionHistory) {
      const block = taskToWrite(id);
      if (completionHistory) refuseUnreadable(block, id);
      write(() => {
        // Written contexts and labels become choices of the task tag, as in
        // Orca (multi-choices-created), so they stay candidates.
        for (const property of ["contexts", "labels"] as const) {
          for (const value of changes[property] ?? []) {
            if (!choices[property].includes(value)) {
              choices[property].push(value);
            }
          }
        }
        block.task = { ...block.task, ...changes };
        if (completionHistory) {
          block.completionHistory = {
            kind: "readable",
            history: [...completionHistory],
          };
        }
      });
    },

    async readCandidates(property) {
      const values = new Set(choices[property]);
      for (const block of blocks.values()) {
        for (const value of block.task?.[property] ?? []) values.add(value);
      }
      return [...values];
    },

    async readCompletionHistory(id) {
      const block = blocks.get(id);
      const empty: CompletionHistoryRead = { kind: "readable", history: [] };
      if (!block?.task) return empty;
      return block.completionHistory ?? empty;
    },

    async convertToTask(id): Promise<ConvertToTaskResult> {
      const block = blocks.get(id);
      if (!block) throw new Error(`no block ${id}`);
      if (block.notConvertible) {
        return { kind: "not-convertible", reason: block.notConvertible };
      }
      if (block.task) return { kind: "already-task", id };
      write(() => {
        block.completionHistory = undefined;
        block.task = freshTask(id, block.text, block.created);
      });
      return { kind: "converted", id };
    },

    async dropTask(id) {
      const block: StoredBlock = taskToWrite(id);
      write(() => {
        block.completionHistory = undefined;
        block.task = undefined;
      });
    },

    async appendTaskToJournal(text, now) {
      const id = nextId++;
      write(() => {
        // get-journal-block picks the journal by local date (journal-capture J3).
        journalDays.set(id, {
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          day: now.getDate(),
        });
        store(id, {
          text,
          created: now,
          parentId: undefined,
          notConvertible: undefined,
          task: freshTask(id, text, now),
          completionHistory: undefined,
        });
      });
      return id;
    },
  };
}
