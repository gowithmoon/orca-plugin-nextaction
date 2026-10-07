// Violation sample: application depends on React, by import and via the global.
import type { ReactNode } from "react";

export function view(node: ReactNode) {
  const { useState } = window.React;
  return { node, useState };
}
