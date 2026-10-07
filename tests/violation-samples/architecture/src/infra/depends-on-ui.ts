// Violation sample: infra depends on ui and React, including a re-export and a
// dynamic import. Importing the application ports is allowed.
import type { Clock } from "../application/ports/clock";
import { createRoot } from "react-dom/client";

export { TaskList } from "../ui/views/task-list";
export const view = () => import("../ui/panel/panel");
export type Wiring = [Clock, typeof createRoot];
