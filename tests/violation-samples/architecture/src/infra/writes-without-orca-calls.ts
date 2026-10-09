// Violation sample: infra writes through Orca's commands directly instead of
// through src/infra/orca/orca-calls.ts, which makes sure the active panel has
// an editor (ADR 0014). Backend calls are allowed.
export async function write() {
  await orca.commands.invokeGroup(async () => {
    await orca.commands.invokeEditorCommand("core.editor.setRefData", null);
  });
  return orca.invokeBackend("get-block", 1);
}
