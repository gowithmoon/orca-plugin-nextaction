// Violation sample: ui reaches past the use cases. Reading orca.state and using
// orca.components is allowed in ui and must not be reported, nor is React.
import { useState } from "react";
import { systemClock } from "../infra/system-clock";

export async function load(id: number) {
  const locale = orca.state.locale;
  const button = orca.components.Button;
  await orca.invokeBackend("get-block", id);
  await orca.commands.invokeEditorCommand("core.editor.insertTag", null);
  return { locale, button, useState, now: systemClock.now() };
}
