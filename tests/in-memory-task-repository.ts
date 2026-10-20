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
  JournalSummaryPart,
  NotConvertibleReason,
  NoteTarget,
  OutlineBlock,
  TaskFilter,
  TaskRepository,
  TaskWrite,
  ValuesFilter,
} from "../src/application/ports/task-repository";
import type { NoteDropPlan } from "../src/domain/blocking/note-drop";
import type { MovePlacement, TaskMove } from "../src/domain/blocking/task-move";
import type { ProjectSetting } from "../src/domain/project/ownership";
import type { Project, ProjectId } from "../src/domain/project/project";
import { normalizeReminders } from "../src/domain/reminder/reminder";
import {
  lastCompletion as lastCompletionIn,
  lastSkip as lastSkipIn,
} from "../src/domain/task/completion-history";
import {
  type CustomPropertyDefinition,
  type CustomPropertyValue,
  checkCustomPropertyValue,
  emptyCustomPropertyValue,
} from "../src/domain/task/custom-property";
import type { MyDayRead } from "../src/domain/task/my-day";
import type { CalendarDate, Task, TaskId } from "../src/domain/task/task";

interface StoredBlock {
  text: string;
  /** When the block was created; a task keeps its block's. */
  created: Date;
  parentId: number | undefined;
  /** Its place in the notes (document preorder): lower comes first. */
  position: number;
  notConvertible: NotConvertibleReason | undefined;
  /** Present while the block carries the task tag. */
  task: Task | undefined;
  /** The block has an alias: it is a page. */
  page: boolean;
  /**
   * The stored completion history, `undefined` when none is. Kept when the
   * task tag goes, as Orca does (block-properties-json J4).
   */
  completionHistory: CompletionHistoryRead | undefined;
  /**
   * The stored My Day entries, `undefined` when none are. Kept when the task
   * tag goes, as the completion history is.
   */
  myDay: MyDayRead | undefined;
  /** Tags the block carries, by name, for block searches with a scope. */
  tags: readonly string[];
  /** Present while the block carries the project tag (ADR 0025). */
  project: Project | undefined;
  /**
   * The task's 所属项目 values in order, as reference IDs with the blocks
   * they point at (`null`: no such reference); absent for none.
   */
  projectValues?: readonly ProjectSetting[];
}

export interface BlockSetup {
  text?: string;
  /** Defaults to `defaultCreated`. */
  created?: Date;
  parentId?: number;
  /**
   * Its place in the notes, lower first. Defaults to the order blocks are
   * added in, so a test that adds blocks top to bottom need not set it.
   */
  position?: number;
  notConvertible?: NotConvertibleReason;
  completionHistory?: CompletionHistoryRead;
  myDay?: MyDayRead;
  /** The block has an alias: it is a page. */
  page?: boolean;
  /** Tags the block carries, by name, for block searches with a scope. */
  tags?: readonly string[];
  /**
   * A task's 所属项目 values in order (GLOSSARY: 所属项目): the blocks they
   * point at, `null` for a value with no reference behind it. Only the first
   * is read, as the codec does; a block that is not a project makes it
   * stale.
   */
  project?: readonly (number | null)[];
}

export interface InMemoryTaskRepository extends TaskRepository {
  /** Adds a block that is not a task. */
  addBlock(id: number, setup?: Omit<BlockSetup, "project">): void;
  /**
   * Adds a project (GLOSSARY: 项目); unspecified values are those of a
   * freshly tagged project. On a block that is already there (a task), the
   * project tag is added to it: the block is both (ADR 0025), and `setup`
   * is ignored.
   */
  addProject(
    project: Partial<Project> & { id: ProjectId },
    setup?: Pick<BlockSetup, "parentId" | "position" | "page">,
  ): void;
  /** Adds a task; unspecified values are those of a freshly tagged task. */
  addTask(
    task: Partial<Task> & { id: TaskId },
    setup?: Omit<BlockSetup, "notConvertible" | "text">,
  ): void;
  /**
   * Adds a mirror block of block `sourceId` (#208). Only `getTask` reads
   * through it, returning the source's task, as the repository resolves a
   * mirror's ID; nothing else here models mirrors.
   */
  addMirror(id: number, sourceId: number): void;
  /** The task tag's choices for contexts or labels (none unless set). */
  setChoices(property: ChoiceProperty, choices: readonly string[]): void;
  /**
   * Pauses the project tag (#143), `false` resuming it: the task graph then
   * holds no project, no project block and no 所属项目 setting.
   */
  pauseProjectTag(paused: boolean): void;
  /** Every write from now on fails with `error`; `undefined` stops it. */
  failWrites(error: Error | undefined): void;
  /** How many writes succeeded. */
  writeCount(): number;
  /**
   * The day of the journal a block was appended to with
   * `appendTaskToJournal` or `createTasks`, or `undefined` when it was not.
   */
  journalOf(id: number): CalendarDate | undefined;
  /**
   * Every `appendSummaryToJournal` that succeeded, oldest first, with the
   * day of the journal it went to; the blocks themselves are not modelled.
   */
  journalSummaries(): readonly {
    day: CalendarDate;
    title: string;
    parts: readonly JournalSummaryPart[];
  }[];
  /** Every `moveTask` that succeeded, oldest first. */
  moves(): readonly TaskMove[];
  /** Every `linkTaskInNote` that succeeded, oldest first; the notes are not modelled. */
  noteLinks(): readonly {
    id: TaskId;
    plan: NoteDropPlan;
    target: NoteTarget;
  }[];
  /**
   * The task tag's custom property definitions (none unless set), as the
   * user would set them in Orca: values of properties no longer defined
   * stop reading, as Orca deletes them (custom-properties).
   */
  setCustomPropertyDefinitions(
    definitions: readonly CustomPropertyDefinition[],
  ): void;
}

/** When a block was created, unless a test says otherwise. */
export const defaultCreated = new Date("2026-01-01T00:00:00.000Z");

/** What a block tagged without values reads as (tag-operations). */
function freshTask(id: TaskId, text: string, created: Date): Task {
  return {
    id,
    text,
    searchText: "",
    created,
    status: "inbox",
    importance: 4,
    urgency: 4,
    effort: 4,
    start: null,
    due: null,
    contexts: [],
    labels: [],
    note: null,
    sequential: false,
    dependencies: [],
    dependencyMode: "all",
    dependencyDelay: 0,
    recurrence: { kind: "none" },
    review: { kind: "none" },
    reminders: { kind: "none" },
    customProperties: {},
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

/** What a block given the project tag without values reads as (project-tag). */
function freshProject(id: ProjectId, created: Date): Project {
  return {
    id,
    text: "",
    status: "planning",
    goal: null,
    start: null,
    due: null,
    importance: 4,
    urgency: 4,
    created,
  };
}

export function createInMemoryTaskRepository(): InMemoryTaskRepository {
  const blocks = new Map<number, StoredBlock>();
  /** Mirror block IDs, each with its source block's (`addMirror`). */
  const mirrors = new Map<number, number>();
  let failure: Error | undefined;
  let projectTagPaused = false;
  /** The task tag's choices per property. */
  const choices: Record<ChoiceProperty, string[]> = {
    contexts: [],
    labels: [],
  };
  let writes = 0;
  const moves: TaskMove[] = [];
  const noteLinks: { id: TaskId; plan: NoteDropPlan; target: NoteTarget }[] =
    [];
  /** Journal days by block, for blocks appended to a journal. */
  const journalDays = new Map<number, CalendarDate>();
  const journalSummaries: {
    day: CalendarDate;
    title: string;
    parts: readonly JournalSummaryPart[];
  }[] = [];
  /** IDs of new blocks, far from the ones tests pick. */
  let nextId = 100_000;
  /** Reference IDs of 所属项目 values, far from block IDs too. */
  let nextRefId = 900_000;
  /** Places in the notes for blocks added without one, in adding order. */
  let nextPosition = 0;
  const positionOf = (position: number | undefined) => {
    nextPosition += 1;
    return position ?? nextPosition;
  };

  /** The task tag's custom property definitions. */
  let customDefinitions: CustomPropertyDefinition[] = [];
  /**
   * The task with a value for every custom property defined, an empty one
   * where none is stored, and none for properties no longer defined, as
   * decoding reads it.
   */
  const withCustomProperties = (task: Task): Task => {
    const values: Record<string, CustomPropertyValue> = {};
    for (const definition of customDefinitions) {
      const stored = task.customProperties[definition.name];
      values[definition.name] =
        stored?.kind === definition.kind
          ? stored
          : emptyCustomPropertyValue(definition.kind);
    }
    return { ...task, customProperties: values };
  };

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

  /**
   * Plugin block properties this plugin cannot read are never overwritten:
   * a write replacing one fails, writing nothing.
   */
  const refuseUnreadable = (
    block: StoredBlock & { task: Task },
    id: TaskId,
    taskWrite: Omit<TaskWrite, "id">,
  ) => {
    const replaced = [
      [
        taskWrite.completionHistory,
        block.completionHistory,
        "completion history",
      ],
      [taskWrite.recurrence, block.task.recurrence, "recurrence rule"],
      [taskWrite.reminders, block.task.reminders, "reminders"],
      [taskWrite.myDay, block.myDay, "My Day entries"],
      [taskWrite.review, block.task.review, "review plan"],
    ] as const;
    for (const [value, current, what] of replaced) {
      if (value !== undefined && current?.kind === "unreadable") {
        throw new Error(
          `the ${what} of block ${id} cannot be read by this plugin (${current.reason})`,
        );
      }
    }
  };

  /** Runs a write: all of it, or (when writes fail) none of it. */
  const write = (apply: () => void) => {
    if (failure) throw failure;
    apply();
    writes += 1;
  };

  /** Applies a task write to a block, as Orca applies it. */
  const applyWrite = (
    block: StoredBlock & { task: Task },
    taskWrite: Omit<TaskWrite, "id">,
  ) => {
    const changes = taskWrite.changes ?? {};
    // Written contexts and labels become choices of the task tag, as in
    // Orca (multi-choices-created), so they stay candidates.
    for (const property of ["contexts", "labels"] as const) {
      for (const value of changes[property] ?? []) {
        if (!choices[property].includes(value)) {
          choices[property].push(value);
        }
      }
    }
    const { dependencyDelay, project, ...rest } = changes;
    block.task = { ...block.task, ...rest };
    // 所属项目 (#146): one value replacing every one held, stale ones too,
    // with a new reference unless it names the block already referenced.
    if (project !== undefined) {
      const kept = block.projectValues?.find((v) => v.target === project);
      block.projectValues =
        project === null
          ? []
          : [kept ?? { refId: nextRefId++, target: project }];
    }
    // A cleared dependency delay reads back as 0, as decoding does.
    if (dependencyDelay !== undefined) {
      block.task = { ...block.task, dependencyDelay: dependencyDelay ?? 0 };
    }
    // A status written is one of the plugin's: it reads back without the
    // anomaly an empty or unknown one had, as decoding does.
    if (changes.status !== undefined) {
      block.task = {
        ...block.task,
        anomalies: block.task.anomalies.filter(
          (anomaly) => anomaly.property !== "status",
        ),
      };
    }
    if (taskWrite.completionHistory) {
      block.completionHistory = {
        kind: "readable",
        history: [...taskWrite.completionHistory],
      };
    }
    if (taskWrite.recurrence !== undefined) {
      block.task = {
        ...block.task,
        recurrence: taskWrite.recurrence
          ? { kind: "rule", rule: taskWrite.recurrence }
          : { kind: "none" },
      };
    }
    if (taskWrite.reminders !== undefined) {
      // Stored ascending and each once, as the codec writes them.
      block.task = {
        ...block.task,
        reminders: {
          kind: "list",
          reminders: normalizeReminders(taskWrite.reminders),
        },
      };
    }
    if (taskWrite.myDay !== undefined) {
      block.myDay = { kind: "readable", entries: [...taskWrite.myDay] };
    }
    if (taskWrite.review !== undefined) {
      block.task = {
        ...block.task,
        review: { kind: "plan", plan: taskWrite.review },
      };
    }
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

  /**
   * Moves block `id` with every block below it, as Orca moves blocks: in
   * their order, before the target, or after the target's last block. Fails,
   * writing nothing, when the target is the block or below it.
   */
  const moveBlock = (id: number, target: number, placement: MovePlacement) => {
    const targetBlock = blocks.get(target) as StoredBlock;
    if (id === target || isBelow(target, id)) {
      throw new Error(`block ${target} is block ${id} or below it`);
    }
    write(() => {
      const inMoved = (blockId: number) =>
        blockId === id || isBelow(blockId, id);
      const ordered = [...blocks.entries()].sort(
        ([, a], [, b]) => a.position - b.position,
      );
      const moved = ordered.filter(([blockId]) => inMoved(blockId));
      const rest = ordered.filter(([blockId]) => !inMoved(blockId));
      const targetAt = rest.findIndex(([blockId]) => blockId === target);
      let afterTarget = targetAt + 1;
      while (
        afterTarget < rest.length &&
        isBelow((rest[afterTarget] as [number, StoredBlock])[0], target)
      ) {
        afterTarget += 1;
      }
      const at = placement === "before" ? targetAt : afterTarget;
      [...rest.slice(0, at), ...moved, ...rest.slice(at)].forEach(
        ([, block], position) => {
          block.position = position;
        },
      );
      (blocks.get(id) as StoredBlock).parentId =
        placement === "lastChild" ? target : targetBlock.parentId;
    });
  };

  return {
    addBlock(id, setup = {}) {
      store(id, {
        text: setup.text ?? "",
        created: setup.created ?? defaultCreated,
        parentId: setup.parentId,
        position: positionOf(setup.position),
        notConvertible: setup.notConvertible,
        task: undefined,
        completionHistory: setup.completionHistory,
        myDay: setup.myDay,
        page: setup.page ?? false,
        tags: setup.tags ?? [],
        project: undefined,
      });
    },

    addProject(project, setup = {}) {
      const existing = blocks.get(project.id);
      const full = {
        ...freshProject(project.id, existing?.created ?? defaultCreated),
        ...(existing && { text: existing.task?.text ?? existing.text }),
        ...project,
      };
      if (existing) {
        existing.project = full;
        return;
      }
      store(project.id, {
        text: full.text,
        created: full.created,
        parentId: setup.parentId,
        position: positionOf(setup.position),
        notConvertible: undefined,
        task: undefined,
        completionHistory: undefined,
        myDay: undefined,
        page: setup.page ?? false,
        tags: [],
        project: full,
      });
    },

    addTask(task, setup = {}) {
      const full = { ...freshTask(task.id, "", defaultCreated), ...task };
      store(task.id, {
        text: full.text,
        created: full.created,
        parentId: setup.parentId,
        position: positionOf(setup.position),
        notConvertible: undefined,
        task: full,
        completionHistory: setup.completionHistory,
        myDay: setup.myDay,
        page: setup.page ?? false,
        tags: setup.tags ?? [],
        project: undefined,
        ...(setup.project && {
          projectValues: setup.project.map((target) => ({
            refId: nextRefId++,
            target,
          })),
        }),
      });
    },

    setChoices(property, values) {
      choices[property] = [...values];
    },

    pauseProjectTag(paused) {
      projectTagPaused = paused;
    },

    failWrites(error) {
      failure = error;
    },

    writeCount: () => writes,

    journalOf: (id) => journalDays.get(id),

    journalSummaries: () =>
      journalSummaries.map((entry) => ({
        ...entry,
        parts: entry.parts.map((part) => ({
          heading: part.heading,
          items: [...part.items],
        })),
      })),

    moves: () => [...moves],

    noteLinks: () => [...noteLinks],

    async linkTaskInNote(id, plan, target) {
      taskToWrite(id);
      // Only recorded: the reference or mirror lives in the notes, which
      // this repository does not model, and no task changes (ADR 0003).
      write(() => {
        noteLinks.push({ id, plan, target });
      });
    },

    async moveTask(id, target, placement) {
      taskToWrite(id);
      taskToWrite(target);
      moveBlock(id, target, placement);
      moves.push({ id, target, placement });
    },

    async moveTaskToProjectEnd(id, project) {
      taskToWrite(id);
      if (!blocks.get(project)?.project || projectTagPaused) {
        throw new Error(`block ${project} is not a project`);
      }
      moveBlock(id, project, "lastChild");
      moves.push({ id, projectEnd: project });
    },

    addMirror(id, sourceId) {
      if (blocks.has(id) || mirrors.has(id)) {
        throw new Error(`block ${id} already exists`);
      }
      mirrors.set(id, sourceId);
    },

    async getTask(id) {
      const task = blocks.get(mirrors.get(id) ?? id)?.task;
      return task ? withCustomProperties(task) : null;
    },

    async getTaskWithDefinitions(id) {
      const task = blocks.get(id)?.task;
      return task
        ? {
            task: withCustomProperties(task),
            definitions: [...customDefinitions],
          }
        : null;
    },

    setCustomPropertyDefinitions(next) {
      customDefinitions = [...next];
    },

    async readCustomPropertyDefinitions() {
      return [...customDefinitions];
    },

    async searchBlocks(search, scope) {
      // Every word of `search`, ignoring case, in the block's text. Journals,
      // orphans and mirrors are Orca details not modelled here.
      const words = search.toLowerCase().split(/\s+/).filter(Boolean);
      const found = [];
      for (const [id, block] of blocks) {
        const text = block.task?.text ?? block.text;
        if (scope !== null && !block.tags.includes(scope)) continue;
        if (!words.every((word) => text.toLowerCase().includes(word))) continue;
        found.push({ id, text });
      }
      return found;
    },

    async readBlockTexts(ids) {
      const texts = new Map<number, string>();
      for (const id of ids) {
        const block = blocks.get(id);
        if (block) texts.set(id, block.task?.text ?? block.text);
      }
      return texts;
    },

    async writeCustomProperty(id, name, value) {
      const block = taskToWrite(id);
      checkCustomPropertyValue(customDefinitions, name, value);
      write(() => {
        // Options typed in are added to the definition, as Orca's does.
        if (value.kind === "single" || value.kind === "multi") {
          const typed =
            value.kind === "multi"
              ? value.value
              : value.value === null
                ? []
                : [value.value];
          customDefinitions = customDefinitions.map((d) =>
            d.name === name && (d.kind === "single" || d.kind === "multi")
              ? {
                  ...d,
                  choices: [...new Set([...d.choices, ...typed])],
                }
              : d,
          );
        }
        block.task = {
          ...block.task,
          customProperties: { ...block.task.customProperties, [name]: value },
        };
      });
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

    async updateTasks(taskWrites) {
      // Every task is checked before any is written: one that fails leaves
      // them all as they were.
      const checked = taskWrites.map((taskWrite) => {
        const block = taskToWrite(taskWrite.id);
        refuseUnreadable(block, taskWrite.id, taskWrite);
        return { block, taskWrite };
      });
      write(() => {
        for (const { block, taskWrite } of checked) {
          applyWrite(block, taskWrite);
        }
      });
    },

    async updateTask(id, taskWrite) {
      const block = taskToWrite(id);
      refuseUnreadable(block, id, taskWrite);
      write(() => applyWrite(block, taskWrite));
    },

    async readTaskGraph() {
      /** The nearest ancestor block carrying a task, plain blocks skipped. */
      const parentTaskOf = (id: number): TaskId | null => {
        const seen = new Set<number>([id]);
        let parentId = blocks.get(id)?.parentId;
        while (parentId !== undefined && !seen.has(parentId)) {
          const parent = blocks.get(parentId);
          if (!parent) return null;
          if (parent.task) return parentId;
          seen.add(parentId);
          parentId = parent.parentId;
        }
        return null;
      };
      /** The nearest ancestor block carrying the project tag (ADR 0025). */
      const projectBlockOf = (id: number): ProjectId | undefined => {
        const seen = new Set<number>([id]);
        let parentId = blocks.get(id)?.parentId;
        while (parentId !== undefined && !seen.has(parentId)) {
          const parent = blocks.get(parentId);
          if (!parent) return undefined;
          if (parent.project) return parentId;
          seen.add(parentId);
          parentId = parent.parentId;
        }
        return undefined;
      };
      const projects = [];
      for (const [id, block] of blocks) {
        if (!block.project || projectTagPaused) continue;
        const parentId = parentTaskOf(id);
        const projectBlock = projectBlockOf(id);
        projects.push({
          project: block.project,
          position: block.position,
          ...(block.page && { page: true }),
          // A project block may sit below a task (ADR 0025).
          ...(parentId !== null && { parentId }),
          ...(projectBlock !== undefined && { projectBlock }),
        });
      }
      const tasks = [];
      for (const [id, block] of blocks) {
        if (!block.task) continue;
        const projectBlock = projectTagPaused ? undefined : projectBlockOf(id);
        const stored = block.completionHistory;
        const lastCompletion =
          stored?.kind === "readable"
            ? lastCompletionIn(stored.history)
            : undefined;
        const lastSkip =
          stored?.kind === "readable" ? lastSkipIn(stored.history) : undefined;
        tasks.push({
          task: block.task,
          parentId: parentTaskOf(id),
          position: block.position,
          ...(lastCompletion && { lastCompletion }),
          ...(lastSkip && { lastSkip }),
          ...(stored?.kind === "readable" &&
            stored.history.length > 0 && {
              completionHistory: stored.history,
            }),
          ...(block.myDay && { myDay: block.myDay }),
          ...(block.page && { page: true }),
          ...(block.parentId === undefined && { root: true }),
          ...(projectBlock !== undefined && { projectBlock }),
          ...(!projectTagPaused &&
            block.projectValues?.[0] && {
              projectSetting: block.projectValues[0],
            }),
        });
      }
      return {
        tasks,
        projects,
        ...(projectTagPaused && { projectsPaused: true }),
      };
    },

    async readCandidates() {
      const read = (property: ChoiceProperty) => {
        const values = new Set(choices[property]);
        for (const block of blocks.values()) {
          for (const value of block.task?.[property] ?? []) values.add(value);
        }
        return [...values];
      };
      return { contexts: read("contexts"), labels: read("labels") };
    },

    async readCompletionHistory(id) {
      const block = blocks.get(id);
      const empty: CompletionHistoryRead = { kind: "readable", history: [] };
      if (!block?.task) return empty;
      return block.completionHistory ?? empty;
    },

    async readMyDay(id) {
      const block = blocks.get(id);
      const empty: MyDayRead = { kind: "readable", entries: [] };
      if (!block?.task) return empty;
      return block.myDay ?? empty;
    },

    async discardUnreadable(id, data) {
      const block = taskToWrite(id);
      if (data === "completionHistory") {
        if (block.completionHistory?.kind !== "unreadable") return;
        write(() => {
          block.completionHistory = { kind: "readable", history: [] };
        });
        return;
      }
      if (block.task[data].kind !== "unreadable") return;
      // The empty value of each, as the codecs write it.
      const empty = {
        recurrence: { kind: "none" },
        review: {
          kind: "plan",
          plan: { interval: null, lastReviewed: null, reviewOn: null },
        },
        reminders: { kind: "list", reminders: [] },
      } as const;
      write(() => {
        block.task = { ...block.task, [data]: empty[data] };
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
        block.completionHistory = undefined;
        block.myDay = undefined;
        block.task = freshTask(id, block.text, block.created);
      });
      return { kind: "converted", id };
    },

    async dropTask(id) {
      const block: StoredBlock = taskToWrite(id);
      write(() => {
        block.completionHistory = undefined;
        block.myDay = undefined;
        block.task = undefined;
        // In the same undo, no dependency is left pointing at it (ADR 0016).
        for (const other of blocks.values()) {
          if (other.task?.dependencies.includes(id)) {
            other.task = {
              ...other.task,
              dependencies: other.task.dependencies.filter((d) => d !== id),
            };
          }
        }
      });
    },

    async createTasks(placement, newTasks, also = []) {
      if (placement.kind !== "journal" && !blocks.has(placement.blockId)) {
        throw new Error(`no block ${placement.blockId}`);
      }
      // Checked before anything is written, as the port says.
      const targets = also.map((taskWrite) => {
        const block = taskToWrite(taskWrite.id);
        refuseUnreadable(block, taskWrite.id, taskWrite);
        return { block, taskWrite };
      });
      // The parent the new tasks go below, and the last position before
      // them: after the block's last block below it, as Orca's lastChild and
      // after put it; at the end of the notes for a journal.
      let parentId: number | undefined;
      let last: number;
      if (placement.kind === "journal") {
        parentId = undefined;
        last = Math.max(
          0,
          ...[...blocks.values()].map((block) => block.position),
        );
      } else {
        const anchor = placement.blockId;
        parentId =
          placement.kind === "lastChild"
            ? anchor
            : (blocks.get(anchor) as StoredBlock).parentId;
        const below = [...blocks.entries()].filter(
          ([id]) => id === anchor || isBelow(id, anchor),
        );
        last = Math.max(...below.map(([, block]) => block.position));
      }
      const ids = newTasks.map(() => nextId++);
      write(() => {
        for (const block of blocks.values()) {
          if (block.position > last) block.position += newTasks.length;
        }
        newTasks.forEach((newTask, index) => {
          const id = ids[index] as number;
          const created = new Date(0);
          if (placement.kind === "journal") {
            // get-journal-block picks the journal by local date (journal-capture J3).
            const { now } = placement;
            journalDays.set(id, {
              year: now.getFullYear(),
              month: now.getMonth() + 1,
              day: now.getDate(),
            });
          }
          store(id, {
            text: newTask.text,
            created,
            parentId,
            position: last + 1 + index,
            notConvertible: undefined,
            task: {
              ...freshTask(id, newTask.text, created),
              ...newTask.initial,
              status: newTask.status,
            },
            completionHistory: undefined,
            myDay: undefined,
            page: false,
            tags: [],
            project: undefined,
          });
        });
        for (const { block, taskWrite } of targets)
          applyWrite(block, taskWrite);
      });
      return ids;
    },

    async readOutline(id) {
      // Each block's own text, its children in note order; a task's text is
      // its task's, as Orca shows it.
      const outlineOf = (blockId: number): OutlineBlock => {
        const block = blocks.get(blockId) as StoredBlock;
        const children = [...blocks.entries()]
          .filter(([, child]) => child.parentId === blockId)
          .sort(([, a], [, b]) => a.position - b.position)
          .map(([childId]) => outlineOf(childId));
        return {
          text: (block.task?.text ?? block.text).trim(),
          isTask: block.task !== undefined,
          children,
        };
      };
      return blocks.has(id) ? outlineOf(id) : null;
    },

    async getProject(id) {
      if (projectTagPaused) return null;
      return blocks.get(id)?.project ?? null;
    },

    async updateProjectStatus(id, status) {
      const block = blocks.get(id);
      if (!block?.project) throw new Error(`block ${id} is not a project`);
      const project = block.project;
      write(() => {
        block.project = { ...project, status };
      });
    },

    async dropProject(id, tasks) {
      const block = blocks.get(id);
      if (!block?.project) throw new Error(`block ${id} is not a project`);
      const dropped: StoredBlock[] = tasks.map((taskId) => taskToWrite(taskId));
      const droppedIds = new Set(tasks);
      write(() => {
        block.project = undefined;
        for (const task of dropped) {
          task.completionHistory = undefined;
          task.myDay = undefined;
          task.task = undefined;
        }
        for (const other of blocks.values()) {
          // No 所属项目 setting is left pointing at it, done tasks' included.
          if (other.projectValues?.some((value) => value.target === id)) {
            other.projectValues = other.projectValues.filter(
              (value) => value.target !== id,
            );
          }
          // As dropTask: no dependency is left on a dropped task (ADR 0016).
          const dependencies = other.task?.dependencies ?? [];
          if (other.task && dependencies.some((d) => droppedIds.has(d))) {
            other.task = {
              ...other.task,
              dependencies: dependencies.filter((d) => !droppedIds.has(d)),
            };
          }
        }
      });
    },

    async appendSubtask(parentId, text, initial = {}) {
      taskToWrite(parentId);
      // After the parent's last block below it, as Orca's lastChild puts it.
      const below = [...blocks.entries()].filter(
        ([id]) => id === parentId || isBelow(id, parentId),
      );
      const last = Math.max(...below.map(([, block]) => block.position));
      const id = nextId++;
      write(() => {
        for (const block of blocks.values()) {
          if (block.position > last) block.position += 1;
        }
        const created = new Date();
        store(id, {
          text,
          created,
          parentId,
          position: last + 1,
          notConvertible: undefined,
          // Properties not given keep the defaults, as Orca fills them.
          task: { ...freshTask(id, text, created), ...initial },
          completionHistory: undefined,
          myDay: undefined,
          page: false,
          tags: [],
          project: undefined,
        });
      });
      return id;
    },

    async appendSummaryToJournal(title, parts, now) {
      // Copied, so the caller changing its parts later changes nothing here.
      const written = parts.map((part) => ({
        heading: part.heading,
        items: [...part.items],
      }));
      write(() => {
        // get-journal-block picks the journal by local date (journal-capture J3).
        journalSummaries.push({
          day: {
            year: now.getFullYear(),
            month: now.getMonth() + 1,
            day: now.getDate(),
          },
          title,
          parts: written,
        });
      });
    },

    async appendTaskToJournal(text, now, initial = {}) {
      const { project, ...properties } = initial;
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
          // Appended at the end of a journal: after every block so far.
          position: positionOf(undefined),
          notConvertible: undefined,
          // Properties not given keep the defaults, as Orca fills them.
          task: { ...freshTask(id, text, now), ...properties },
          completionHistory: undefined,
          myDay: undefined,
          page: false,
          tags: [],
          project: undefined,
          // 所属项目 (#151): written in the same undo as the task tag.
          ...(project !== undefined && {
            projectValues: [{ refId: nextRefId++, target: project }],
          }),
        });
      });
      return id;
    },
  };
}
