// Violation sample: ui calls Orca's AI itself instead of going through a use
// case and the AiChat port.
export async function ask() {
  await orca.ai.sendMessage([{ role: "user", content: "Hi" }]);
  return orca.ai.sendStreamMessage([], new AbortController());
}
