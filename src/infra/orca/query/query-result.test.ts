// `query` does not throw on failure: it returns an object such as
// `{ code: "SQLITE_ERROR" }` (docs/spikes/tag-property-query.md).
import { describe, expect, it } from "vitest";
import { OrcaError } from "../orca-error";
import { blockIdsFromQueryResult } from "./query-result";

describe("blockIdsFromQueryResult", () => {
  it("returns the block IDs of a successful query", () => {
    expect(blockIdsFromQueryResult([201, 305, 17])).toEqual([201, 305, 17]);
  });

  it("returns no IDs for an empty result", () => {
    expect(blockIdsFromQueryResult([])).toEqual([]);
  });

  it("turns an error object into a plugin error instead of an empty result", () => {
    expect(() => blockIdsFromQueryResult({ code: "SQLITE_ERROR" })).toThrow(
      new OrcaError('query returned {"code":"SQLITE_ERROR"}'),
    );
  });
});
