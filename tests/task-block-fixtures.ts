// The Block samples of tests/fixtures/task-blocks.json as get-blocks returns
// them. JSON has no Date, so `created` is stored there as an ISO string and
// turned here into the Date Orca returns (multi-choices-created).
import fixtures from "./fixtures/task-blocks.json";

type Revived<T> = Omit<T, "created"> & { created: Date };

function revive<G extends Record<string, { created: string }>>(
  group: G,
): { [K in keyof G]: Revived<G[K]> } {
  return Object.fromEntries(
    Object.entries(group).map(([name, block]) => [
      name,
      { ...block, created: new Date(block.created) },
    ]),
  ) as { [K in keyof G]: Revived<G[K]> };
}

export const blocks = revive(fixtures.blocks);
export const tagBlocks = revive(fixtures.tagBlocks);
