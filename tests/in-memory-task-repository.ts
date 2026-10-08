// A TaskRepository in memory, for use case tests (docs/ARCHITECTURE.md §5).
// It keeps the port's semantics: a block that is not a task reads as `null`
// and its plugin block properties as `absent`; a write that fails changes
// nothing. Orca details (mirrors, orphans, note-facing names) are covered by
// the codec tests and not modelled here: a block that cannot be converted is
// simply marked so.
import type {
  ConvertToTaskResult,
  NotConvertibleReason,
  PluginBlockPropertyRead,
  TaskFilter,
  TaskRepository,
  ValuesFilter,
} from "../src/application/ports/task-repository";
import type { Task, TaskId } from "../src/domain/task/task";
import type { TaskChanges } from "../src/domain/task/task-changes";

/** Plugin block properties by key (without the `nextaction.` prefix). */
type PluginProperties = Record<string, PluginBlockPropertyRead>;

interface StoredBlock {
  text: string;
  parentId: number | undefined;
  notConvertible: NotConvertibleReason | undefined;
  /** Present while the block carries the task tag. */
  task: Task | undefined;
  /** Kept when the task tag goes, as Orca does (block-properties-json J4). */
  pluginProperties: Map<string, PluginBlockPropertyRead>;
}

export interface BlockSetup {
  text?: string;
  parentId?: number;
  notConvertible?: NotConvertibleReason;
  pluginProperties?: PluginProperties;
}

export interface InMemoryTaskRepository extends TaskRepository {
  /** Adds a block that is not a task. */
  addBlock(id: number, setup?: BlockSetup): void;
  /** Adds a task; unspecified values are those of a freshly tagged task. */
  addTask(
    task: Partial<Task> & { id: TaskId },
    setup?: Omit<BlockSetup, "notConvertible" | "text">,
  ): void;
  /** Every write from now on fails with `error`; `undefined` stops it. */
  failWrites(error: Error | undefined): void;
  /** How many writes succeeded. */
  writeCount(): number;
}

/** What a block tagged without values reads as (tag-operations). */
function freshTask(id: TaskId, text: string): Task {
  return {
    id,
    text,
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
  let writes = 0;

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
        parentId: setup.parentId,
        notConvertible: setup.notConvertible,
        task: undefined,
        pluginProperties: new Map(Object.entries(setup.pluginProperties ?? {})),
      });
    },

    addTask(task, setup = {}) {
      const full = { ...freshTask(task.id, ""), ...task };
      store(task.id, {
        text: full.text,
        parentId: setup.parentId,
        notConvertible: undefined,
        task: full,
        pluginProperties: new Map(Object.entries(setup.pluginProperties ?? {})),
      });
    },

    failWrites(error) {
      failure = error;
    },

    writeCount: () => writes,

    async getTask(id) {
      return blocks.get(id)?.task ?? null;
    },

    async queryTasks(filter: TaskFilter) {
      const tasks: Task[] = [];
      for (const [id, block] of blocks) {
        const task = block.task;
        if (!task) continue;
        if (filter.statuses && !filter.statuses.includes(task.status)) continue;
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

    async updateTask(id, changes: TaskChanges) {
      const block = taskToWrite(id);
      write(() => {
        block.task = { ...block.task, ...changes };
      });
    },

    async readPluginBlockProperty(id, key) {
      const block = blocks.get(id);
      if (!block?.task) return { kind: "absent" };
      return block.pluginProperties.get(key) ?? { kind: "absent" };
    },

    async writePluginBlockProperty(id, key, data) {
      const block = taskToWrite(id);
      const current = block.pluginProperties.get(key);
      if (current?.kind === "unreadable") {
        throw new Error(
          `plugin block property "${key}" of block ${id} holds a value this plugin cannot read (${current.reason})`,
        );
      }
      write(() => {
        block.pluginProperties.set(key, { kind: "present", data: { ...data } });
      });
    },

    async convertToTask(id): Promise<ConvertToTaskResult> {
      const block = blocks.get(id);
      if (!block) throw new Error(`no block ${id}`);
      if (block.notConvertible) {
        return { kind: "not-convertible", reason: block.notConvertible };
      }
      if (block.task) return { kind: "already-task", id };
      write(() => {
        block.pluginProperties.clear();
        block.task = freshTask(id, block.text);
      });
      return { kind: "converted", id };
    },
  };
}
