// Showing a task on the task map (#221), from its search box or the task
// menu's "Show in task map": it is selected and centered, the collapsed
// boxes holding it are expanded for now (the collapse state kept), and the
// filter relaxed as `FindOnTaskMap.locate` says. Leaving the map puts the
// filter back as it was before, unless it was changed since, and folds the
// boxes expanded for now.
import type {
  FindOnTaskMap,
  TaskMapPlace,
} from "../../../application/usecases/find-on-task-map";
import type { TaskMapInput } from "../../../application/usecases/read-task-map";
import type { TaskId } from "../../../domain/task/task";
import { placeBoxKeys } from "./task-map-canvas";
import { noBoxes, type TaskMapStores } from "./task-map-stores";

/** The filter before a task was shown, and the one it was relaxed to. */
const relaxed = new WeakMap<
  TaskMapStores,
  { readonly before: TaskMapInput; readonly to: TaskMapInput }
>();

/** Shows task `id`, found at `place`, on the map the stores hold. */
export function showOnTaskMap(
  stores: TaskMapStores,
  id: TaskId,
  place: TaskMapPlace,
): void {
  stores.expanded.set(new Set(placeBoxKeys(place)));
  const before = relaxed.get(stores)?.before ?? stores.filter.current();
  relaxed.set(stores, { before, to: place.input });
  stores.filter.set(place.input);
  stores.selected.set(id);
  stores.locate.set(id);
}

/** The task map is left: the filter put back, the boxes expanded folded. */
export function leftTaskMap(stores: TaskMapStores): void {
  stores.expanded.set(noBoxes);
  const filter = relaxed.get(stores);
  relaxed.delete(stores);
  if (filter && stores.filter.current() === filter.to) {
    stores.filter.set(filter.before);
  }
}

/**
 * The filter the user chose: the one before a task was shown, while the
 * filter is still the one relaxed for it; else the current one. The next
 * task shown is relaxed from it, so one shown before leaves nothing on.
 */
export function chosenFilter(stores: TaskMapStores): TaskMapInput {
  const filter = relaxed.get(stores);
  const current = stores.filter.current();
  return filter && current === filter.to ? filter.before : current;
}

/**
 * Finds task `id` and shows it on the map, the filter relaxed from the one
 * chosen; `false` when no map could show it (it is no task).
 */
export async function revealOnTaskMap(
  find: FindOnTaskMap,
  stores: TaskMapStores,
  id: TaskId,
): Promise<boolean> {
  const place = await find.locate(chosenFilter(stores), id);
  if (!place) return false;
  showOnTaskMap(stores, id, place);
  return true;
}
