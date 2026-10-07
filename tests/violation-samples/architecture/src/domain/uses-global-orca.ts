// Violation sample: domain reads the global orca. Mentions in comments and
// strings, like "orca.state", must not be reported.
export function locale(): string {
  return orca.state.locale;
}
