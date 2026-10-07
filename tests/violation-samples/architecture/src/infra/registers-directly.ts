// Violation sample: infra registers with Orca directly instead of through the
// registry in platform. Other Orca calls are allowed in infra.
export function wire() {
  orca.commands.registerCommand("x.run", () => {}, "Run");
  orca.commands.unregisterCommand("x.run");
  return orca.invokeBackend("get-block", 1);
}
