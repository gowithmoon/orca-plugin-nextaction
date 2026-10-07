// The plugin's calls into Orca, each turning a failure into an `OrcaError`.
// Thin Orca side; verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type { APIMsg } from "../../orca.d.ts";
import { describeError } from "../../shared/describe-error";
import { OrcaError } from "./orca-error";

/** Calls a backend API. */
export async function invokeBackend(
  type: APIMsg,
  ...args: unknown[]
): Promise<unknown> {
  try {
    return await orca.invokeBackend(type, ...args);
  } catch (error) {
    throw new OrcaError(`${type} failed: ${describeError(error)}`);
  }
}

/** Runs an editor command without a cursor. */
export async function invokeEditorCommand(
  command: string,
  ...args: unknown[]
): Promise<unknown> {
  try {
    return await orca.commands.invokeEditorCommand(command, null, ...args);
  } catch (error) {
    throw new OrcaError(`${command} failed: ${describeError(error)}`);
  }
}

/**
 * Runs `write` as one undo step (tag-operations, round 2 F1/F2). Whether
 * `invokeGroup` rethrows an error from its callback is not measured, so the
 * failure is carried out of the group and thrown after it.
 */
export async function invokeGroup(write: () => Promise<void>): Promise<void> {
  let failure: { error: unknown } | undefined;
  try {
    await orca.commands.invokeGroup(async () => {
      try {
        await write();
      } catch (error) {
        failure = { error };
      }
    });
  } catch (error) {
    throw new OrcaError(`invokeGroup failed: ${describeError(error)}`);
  }
  if (failure) {
    throw failure.error instanceof OrcaError
      ? failure.error
      : new OrcaError(describeError(failure.error));
  }
}

/** The ID of the block whose alias is `name`, or `undefined` when there is none. */
export async function findAliasOwner(
  name: string,
): Promise<number | undefined> {
  const found = await invokeBackend("get-blockid-by-alias", name);
  const id: unknown =
    typeof found === "object" && found !== null && "id" in found
      ? found.id
      : undefined;
  return typeof id === "number" ? id : undefined;
}
