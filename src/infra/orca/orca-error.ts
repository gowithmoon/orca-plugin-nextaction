/** A call into Orca failed or returned something the plugin cannot use. */
export class OrcaError extends Error {
  override name = "OrcaError";
}
