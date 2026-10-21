// What the task map shows (#217), as the view's header and the endpoint
// markers change it: the project filter and the two toggles. Revealing an
// endpoint's other end changes only what keeps it off the map: its area is
// added to the areas chosen (nothing to add when every area shows), done
// tasks are shown; nothing is taken away.
import type {
  TaskMapEndpoint,
  TaskMapInput,
  TaskMapReveal,
} from "../../../application/usecases/read-task-map";
import type { TaskId } from "../../../domain/task/task";

/** Nothing filtered: every area, done tasks and tasks with no relation hidden. */
export const noTaskMapFilter: TaskMapInput = {
  projects: [],
  showDone: false,
  showUnrelated: false,
};

/** How many of the filter's three fields differ from `noTaskMapFilter`. */
export function chosenTaskMapFilters(input: TaskMapInput): number {
  return (
    (input.projects.length > 0 ? 1 : 0) +
    (input.showDone ? 1 : 0) +
    (input.showUnrelated ? 1 : 0)
  );
}

/** `input` changed so that what `reveal` asks for shows. */
export function revealed(
  input: TaskMapInput,
  reveal: readonly TaskMapReveal[],
): TaskMapInput {
  let next = input;
  for (const change of reveal) {
    if (change.kind === "showDone") {
      next = { ...next, showDone: true };
    } else if (
      next.projects.length > 0 &&
      !next.projects.includes(change.area)
    ) {
      next = { ...next, projects: [...next.projects, change.area] };
    }
  }
  return next;
}

/** The markers on one side of one node: its endpoints there, in read order. */
export type EndpointMarkers = ReadonlyMap<
  TaskId,
  {
    readonly in: readonly TaskMapEndpoint[];
    readonly out: readonly TaskMapEndpoint[];
  }
>;

/** The endpoints grouped by the node they are drawn on, then by side. */
export function endpointMarkers(
  endpoints: readonly TaskMapEndpoint[],
): EndpointMarkers {
  const out = new Map<
    TaskId,
    { in: TaskMapEndpoint[]; out: TaskMapEndpoint[] }
  >();
  for (const endpoint of endpoints) {
    let sides = out.get(endpoint.at);
    if (!sides) {
      sides = { in: [], out: [] };
      out.set(endpoint.at, sides);
    }
    sides[endpoint.side].push(endpoint);
  }
  return out;
}
