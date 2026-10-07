import { OrcaError } from "../orca-error";

/**
 * The block IDs a `query` call returned. `query` reports failure by
 * returning an object such as `{ code: "SQLITE_ERROR" }` instead of throwing
 * (tag-property-query), so anything but an array is an error, never an
 * empty result.
 */
export function blockIdsFromQueryResult(result: unknown): number[] {
  if (!Array.isArray(result)) {
    throw new OrcaError(`query returned ${JSON.stringify(result)}`);
  }
  return result;
}
