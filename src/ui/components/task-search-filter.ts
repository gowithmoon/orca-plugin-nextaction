// The filter of the searches that pick a task from a Select (adding to My
// Day, picking a dependency; #112): a task is found by its text and its
// search text (`matchesSearch`), as in the all tasks view, and by its option
// label as Orca's default match found it (a page task's label is its alias,
// `shownText`), so nothing found before is lost.
import type { TaskId } from "../../domain/task/task";
import { matchesSearch } from "../../domain/task/task-search";
import type { SelectOption } from "../../orca.d.ts";

/** A task offered by such a search, its option's value being its ID. */
interface Searchable {
  readonly id: TaskId;
  readonly text: string;
  readonly searchText: string;
}

/**
 * A `filterFunction` for options whose values are the IDs of `candidates`.
 * It replaces Orca's default label/pinyin match, keeping both, so an option whose pinyin
 * holds the keyword is still found (as in `choices-field.tsx`; whether Orca
 * fills `pinyin` in is not measured, #41).
 */
export function taskSearchFilter(
  candidates: readonly Searchable[],
  options: readonly SelectOption[],
): (keyword: string, all?: SelectOption[]) => SelectOption[] {
  const byId = new Map(candidates.map((c) => [String(c.id), c]));
  return (keyword, all) => {
    const wanted = keyword.trim().toLowerCase();
    return (all ?? [...options]).filter((option) => {
      const candidate = option.value ? byId.get(option.value) : undefined;
      // Each word may come from the text, the search text or the label.
      const searchable = {
        text: candidate?.text ?? "",
        searchText: `${candidate?.searchText ?? ""}\n${option.label ?? ""}`,
      };
      return (
        matchesSearch(keyword, searchable) ||
        (wanted !== "" && option.pinyin?.toLowerCase().includes(wanted))
      );
    });
  };
}
