// Use case: find a task on the task map (#221), for the search box and "Show
// in task map": what the map's filter must let through for it to show, and
// the boxes it sits in (to expand them for the time being). Read on the map
// as the task map read builds it (read-task-map.ts), so the two never drift.
import type { ProjectId } from "../../domain/project/project";
import type { TaskId } from "../../domain/task/task";
import { matchesSearch } from "../../domain/task/task-search";
import type {
  ReadTaskMap,
  TaskMapInput,
  TaskMapNode,
  TaskMapRead,
} from "./read-task-map";

/** Where a task is on the map, and what shows it. */
export interface TaskMapPlace {
  /** The filter that shows it: the one given, relaxed only as it needs. */
  readonly input: TaskMapInput;
  /** The project whose box holds it; `null` for the no-project area. */
  readonly project: ProjectId | null;
  /** The parent tasks whose boxes hold it, outermost first. */
  readonly parents: readonly TaskId[];
}

export interface FindOnTaskMap {
  /** Where task `id` is, `input` relaxed to show it; `null` when no map could. */
  locate(input: TaskMapInput, id: TaskId): Promise<TaskMapPlace | null>;
  /**
   * The tasks found by `text` as the all tasks view searches (its text and
   * search text hold every word, `matchesSearch`), in the map's order:
   * project boxes first, then the no-project area, each in note order. Any
   * task the map could show counts, whatever its filter hides now; nothing
   * for no word.
   */
  search(text: string): Promise<TaskId[]>;
}

/** Everything the map can show: every area, done tasks, tasks with no relation. */
const everything: TaskMapInput = {
  projects: [],
  showDone: true,
  showUnrelated: true,
};

interface Found {
  readonly node: TaskMapNode;
  readonly project: ProjectId | null;
  readonly parents: readonly TaskId[];
  /** At the top of its area, with no subtask. */
  readonly alone: boolean;
}

function findIn(read: TaskMapRead, id: TaskId): Found | null {
  for (const area of read.areas) {
    const project = area.kind === "project" ? area.project.id : null;
    const walk = (
      node: TaskMapNode,
      parents: readonly TaskId[],
    ): Found | null => {
      if (node.task.id === id) {
        return {
          node,
          project,
          parents,
          alone: parents.length === 0 && node.children.length === 0,
        };
      }
      for (const child of node.children) {
        const found = walk(child, [...parents, node.task.id]);
        if (found) return found;
      }
      return null;
    };
    for (const node of area.tasks) {
      const found = walk(node, []);
      if (found) return found;
    }
  }
  return null;
}

export function createFindOnTaskMap(readTaskMap: ReadTaskMap): FindOnTaskMap {
  return {
    async locate(input, id) {
      const anywhere = findIn(await readTaskMap(everything), id);
      if (!anywhere) return null;
      let area = input;
      const own = anywhere.project ?? "none";
      if (area.projects.length > 0 && !area.projects.includes(own)) {
        area = { ...area, projects: [...area.projects, own] };
      }
      // The least turned on that shows it, as the map itself decides (a done
      // task stays as a box; a task loses its relations with a hidden one).
      const tries: TaskMapInput[] = [
        area,
        { ...area, showDone: true },
        { ...area, showUnrelated: true },
        { ...area, showDone: true, showUnrelated: true },
      ];
      for (const next of tries) {
        const found = findIn(await readTaskMap(next), id);
        if (found) {
          return {
            input: next,
            project: found.project,
            parents: found.parents,
          };
        }
      }
      return null;
    },
    async search(text) {
      if (text.trim() === "") return [];
      const out: TaskId[] = [];
      const walk = (node: TaskMapNode) => {
        if (matchesSearch(text, node.task)) out.push(node.task.id);
        node.children.forEach(walk);
      };
      for (const area of (await readTaskMap(everything)).areas) {
        area.tasks.forEach(walk);
      }
      return out;
    },
  };
}
