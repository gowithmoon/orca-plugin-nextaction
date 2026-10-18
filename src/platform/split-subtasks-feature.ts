// "Split into subtasks" (#202): the window's root and style sheet, and the
// use cases it runs, with Orca's AI chat behind the AiChat port (ADR 0026).
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type { ReadUserInstructions } from "../application/ai/user-instructions";
import type { DayBoundarySetting } from "../application/ports/day-boundary-setting";
import type { TaskRepository } from "../application/ports/task-repository";
import { createCreateSplitSubtasks } from "../application/usecases/create-split-subtasks";
import { createDraftSubtasks } from "../application/usecases/draft-subtasks";
import type { Task } from "../domain/task/task";
import { createOrcaAiChat } from "../infra/orca/orca-ai-chat";
import { systemClock } from "../infra/system-clock";
import {
  createSplitSubtasksWindow,
  type OpenSplitSubtasks,
} from "../ui/split/split-subtasks-window";
import { splitSubtasksCss } from "../ui/styles/split-subtasks-style";
import { uiLanguage } from "./ai-language";
import type { FeatureModule } from "./bootstrap";

export function createSplitSubtasksFeature(deps: {
  repository: TaskRepository;
  dayBoundary: DayBoundarySetting;
  userInstructions: ReadUserInstructions;
}): {
  feature: FeatureModule;
  /** Opens the window for a task; does nothing outside a load. */
  open: OpenSplitSubtasks;
} {
  let current: OpenSplitSubtasks = () => {};
  const feature: FeatureModule = ({ pluginName, registry }) => {
    registry.css("splitSubtasksStyle", splitSubtasksCss);
    const root = registry.reactRoot("splitSubtasksWindow", null);
    const open = createSplitSubtasksWindow(
      {
        draftSubtasks: createDraftSubtasks({
          repository: deps.repository,
          chat: createOrcaAiChat(),
          clock: systemClock,
          dayBoundary: deps.dayBoundary,
          uiLanguage,
          userInstructions: deps.userInstructions,
        }),
        createSplitSubtasks: createCreateSplitSubtasks({
          repository: deps.repository,
        }),
        pluginName,
      },
      root.render,
    );
    // Recorded after the root, so it is released first: nothing opens the
    // window into a root that is going away.
    current = open;
    registry.add(`${pluginName}.splitSubtasksOpen`, () => {
      current = () => {};
    });
  };
  return { feature, open: (parent: Task) => current(parent) };
}
