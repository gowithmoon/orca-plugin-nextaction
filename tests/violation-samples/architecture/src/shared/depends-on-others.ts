// Violation sample: shared depends on another layer, React and the global orca.
import { useState } from "react";
import { createRegistry } from "../platform/registry";

export const helpers = { useState, createRegistry, locale: orca.state.locale };
