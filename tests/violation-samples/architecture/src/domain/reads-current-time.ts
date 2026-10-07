// Violation sample: domain reads the current time. Converting a given value is
// fine: new Date(at) and new Date(2026, 0, 1) must not be reported.
export function stamps(at: number) {
  return [new Date(), Date.now(), new Date(at), new Date(2026, 0, 1)];
}
