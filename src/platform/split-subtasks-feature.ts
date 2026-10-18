// "Split into subtasks" (#202): the window's root and style sheet, and the
// use cases it runs, with Orca's AI chat behind the AiChat port (ADR 0026).
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
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
import type { FeatureModule } from "./bootstrap";

/**
 * The language the AI writes its questions and explanations in (#201 提示词
 * rule 5): Orca's interface language, as far as the plugin is translated.
 */
function uiLanguage(): string {
  return orca.state.locale.toLowerCase().startsWith("zh")
    ? "Simplified Chinese"
    : "English";
}

export function createSplitSubtasksFeature(deps: {
  repository: TaskRepository;
  dayBoundary: DayBoundarySetting;
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
