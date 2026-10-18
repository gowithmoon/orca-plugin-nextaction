// "Extract tasks" (#204): the window's root and style sheet, the use cases it
// runs with Orca's AI chat behind the AiChat port (ADR 0026), and where it
// starts: the block menu, an editor command for the block at the cursor and
// its `/` entry. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type { ReadPromptContext } from "../application/ai/prompt-context";
import type { TaskRepository } from "../application/ports/task-repository";
import {
  createCreateExtractedTasks,
  type ExtractPlacement,
} from "../application/usecases/create-extracted-tasks";
import { createDraftExtractedTasks } from "../application/usecases/draft-extracted-tasks";
import type { CalendarDate } from "../domain/task/task";
import { createOrcaAiChat } from "../infra/orca/orca-ai-chat";
import { systemClock } from "../infra/system-clock";
import { t } from "../shared/l10n/l10n";
import {
  createExtractTasksBlockMenuCommand,
  createExtractTasksEditorCommand,
} from "../ui/commands/extract-tasks-command";
import { createMemoryStore } from "../ui/components/memory-store";
import { createExtractTasksWindow } from "../ui/extract/extract-tasks-window";
import { extractTasksCss } from "../ui/styles/extract-tasks-style";
import type { FeatureModule } from "./bootstrap";

export function createExtractTasksFeature(deps: {
  repository: TaskRepository;
  today: () => CalendarDate;
  promptContext: ReadPromptContext;
  /** The task tag block's ID; `undefined` while task features are paused. */
  taskTagBlockId: () => number | undefined;
}): FeatureModule {
  return ({ pluginName, registry }) => {
    registry.css("extractTasksStyle", extractTasksCss);
    const root = registry.reactRoot("extractTasksWindow", null);
    const open = createExtractTasksWindow(
      {
        draftExtractedTasks: createDraftExtractedTasks({
          repository: deps.repository,
          chat: createOrcaAiChat(),
          promptContext: deps.promptContext,
        }),
        createExtractedTasks: createCreateExtractedTasks({
          repository: deps.repository,
          clock: systemClock,
        }),
        // Made on each load: "below the selection" again after a load (#204).
        placement: createMemoryStore<ExtractPlacement>("below"),
        today: deps.today,
        pluginName,
      },
      root.render,
    );
    // Registered after the root, so they are released before it: nothing
    // opens the window into a root that is going away. No shortcut is
    // assigned: the user binds one in Orca's settings.
    registry.blockMenuCommand(
      "extractTasks.block",
      createExtractTasksBlockMenuCommand({
        open,
        taskTagBlockId: deps.taskTagBlockId,
      }),
    );
    const editorId = registry.editorCommand(
      "extractTasks",
      createExtractTasksEditorCommand(open, pluginName),
      // It only opens the window; the write is the repository's own undo.
      () => undefined,
      { label: t("Extract tasks") },
    );
    // Released before the command it calls (slash-commands).
    registry.slashCommand("extractTasksSlash", {
      icon: "ti ti-sparkles",
      group: t("NextAction"),
      title: t("Extract tasks"),
      command: editorId,
    });
  };
}
