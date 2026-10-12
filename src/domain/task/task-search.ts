// Matching a task against what is searched for (#112), shared by the three
// searches (the all tasks view, adding to My Day, picking a dependency) so
// they never drift apart. Pure.
import type { Task } from "./task";

/**
 * The task's text holds every word of `search` (split on white space).
 */
export function matchesSearch(
  search: string,
  task: Pick<Task, "text" | "searchText">,
): boolean {
  const words = search
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== "");
  // Joined on a line break, so no word is found across the two.
  const text = `${task.text}\n${task.searchText}`.toLowerCase();
  return words.every((word) => text.includes(word));
}
