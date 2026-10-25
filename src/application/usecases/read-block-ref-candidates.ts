// Use case: the blocks the task panel offers to add to a block reference
// custom property (GLOSSARY: 自定义属性, #115), e.g. the people a task can be
// delegated to. Searched under the property's scope (`typeArgs.scope`, a tag
// name) as set in Orca, every block when it has none. Only a record: a
// target that is a task is not a dependency.

import {
  type CustomPropertyDefinition,
  checkCustomPropertyValue,
} from "../../domain/task/custom-property";
import type { BlockCandidate, TaskRepository } from "../ports/task-repository";

/**
 * The candidates for the block reference custom property `name` whose text
 * holds `search`. Fails with `CustomPropertyChangedError` when `name` is no
 * longer a block reference property (the user may just have changed it in
 * Orca). Errors are thrown as they are.
 */
export type ReadBlockRefCandidates = (
  name: string,
  search: string,
) => Promise<readonly BlockCandidate[]>;

/** Searches under the scope of `name` among the definitions read. */
function readCandidates(
  repository: TaskRepository,
  readDefinitions: () => Promise<CustomPropertyDefinition[]>,
): ReadBlockRefCandidates {
  return async (name, search) => {
    const definition = checkCustomPropertyValue(await readDefinitions(), name, {
      kind: "blockRefs",
      value: [],
    });
    return repository.searchBlocks(
      search,
      definition.kind === "blockRefs" ? definition.scope : null,
    );
  };
}

/** For a block reference custom property of the task tag. */
export function createReadBlockRefCandidates(deps: {
  repository: TaskRepository;
}): ReadBlockRefCandidates {
  const { repository } = deps;
  return readCandidates(repository, () =>
    repository.readCustomPropertyDefinitions(),
  );
}

/** For a block reference custom property of the project tag (#235). */
export function createReadProjectBlockRefCandidates(deps: {
  repository: TaskRepository;
}): ReadBlockRefCandidates {
  const { repository } = deps;
  return readCandidates(repository, () =>
    repository.readProjectCustomPropertyDefinitions(),
  );
}
