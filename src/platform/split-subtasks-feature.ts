// "Split into subtasks" (#202): the window's root and style sheet, and the
// use cases it runs, with Orca's AI chat behind the AiChat port (ADR 0026).
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type { ReadPromptContext } from "../application/ai/prompt-context";
import type { TaskRepository } from "../application/ports/task-repository";
import { createCreateSplitSubtasks } from "../application/usecases/create-split-subtasks";
import { createDraftSubtasks } from "../application/usecases/draft-subtasks";
import type { Task } from "../domain/task/task";
import { createOrcaAiChat } from "../infra/orca/orca-ai-chat";
import {
  createSplitSubtasksWindow,
  type OpenSplitSubtasks,
} from "../ui/split/split-subtasks-window";
import { splitSubtasksCss } from "../ui/styles/split-subtasks-style";
import type { FeatureModule } from "./bootstrap";

export function createSplitSubtasksFeature(deps: {
  repository: TaskRepository;
  promptContext: ReadPromptContext;
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
          promptContext: deps.promptContext,
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
