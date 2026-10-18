// Violation sample: platform may reach every layer, but not Orca's AI, which
// only infra calls.
export const send = () => orca.ai.sendMessage([]);
