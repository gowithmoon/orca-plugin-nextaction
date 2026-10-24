import { createReadPromptContext } from "../application/ai/prompt-context";
import { createReadUserInstructions } from "../application/ai/user-instructions";
import { systemClock } from "../infra/system-clock";
import { describeError } from "../shared/describe-error";
import { setupL10N, t } from "../shared/l10n/l10n";
import zhCN from "../shared/l10n/zh-cn";
import { createLoadAiInstructions } from "./ai-instructions";
import { uiLanguage } from "./ai-language";
import { createLoadDayBoundary } from "./day-boundary";
import { createExtractTasksFeature } from "./extract-tasks-feature";
import { createPanelFeature } from "./panel-feature";
import { createPopupStyleFeature } from "./popup-style-feature";
import { createProjectMenuFeature } from "./project-menu-feature";
import { createProjectPanelFeature } from "./project-panel-feature";
import { createRegistry, type Registry } from "./registry";
import { createLoadReminderDefaultTime } from "./reminder-default-time";
import { createReminderFeature } from "./reminder-feature";
import {
  applySettingsSchema,
  readSettings,
  type Settings,
  type SettingsDefinition,
  settingsDefinition,
} from "./settings";
import { createSplitSubtasksFeature } from "./split-subtasks-feature";
import { createLoadStartPreviewDays } from "./start-preview-days";
import { createStatusIconFeature } from "./status-icon-feature";
import { createTaskActionsFeature } from "./task-actions-feature";
import { createTaskChangesFeature } from "./task-changes-feature";
import { createTaskMenuFeature } from "./task-menu-feature";
import { createTaskPanelFeature } from "./task-panel-feature";
import { createTaskTagFeature } from "./task-tag-feature";

export interface FeatureContext {
  pluginName: string;
  registry: Registry;
  /** Current setting values, read from Orca with plugin defaults filled in. */
  settings: () => Settings;
  /**
   * This load is being released (unload, or a failed load rolling back):
   * what unmounts now must not write.
   */
  releasing: () => boolean;
}

/** A unit of plugin functionality that performs its own registrations. */
export type FeatureModule = (context: FeatureContext) => void | Promise<void>;

export interface Plugin {
  load(pluginName: string): Promise<void>;
  unload(): Promise<void>;
}

export function createPlugin(options: {
  features: FeatureModule[];
  settings?: SettingsDefinition;
}): Plugin {
  const definition = options.settings ?? settingsDefinition;
  // Belongs to this plugin instance only: Orca creates a fresh module on every load.
  let current:
    | { pluginName: string; registry: Registry; releasing: boolean }
    | undefined;
  // The load still in progress, if any; unload waits for it so nothing registers after release.
  let loading: Promise<void> | undefined;

  /** Releases everything registered so far; returns the failure summary, if any. */
  const release = async (): Promise<string | undefined> => {
    if (current) current.releasing = true;
    try {
      await current?.registry.disposeAll();
      return undefined;
    } catch (error) {
      return describeError(error);
    }
  };

  return {
    load(pluginName) {
      const run = async () => {
        setupL10N(orca.state.locale, { "zh-CN": zhCN });
        const registry = createRegistry(pluginName);
        const mine = { pluginName, registry, releasing: false };
        current = mine;
        try {
          await applySettingsSchema(pluginName, definition);
          const settings = () => readSettings(pluginName, definition);
          const releasing = () => mine.releasing;
          for (const feature of options.features) {
            await feature({ pluginName, registry, settings, releasing });
          }
        } catch (error) {
          // The original load error is what Orca and the user need; a rollback
          // failure must not replace it.
          const rollbackFailure = await release();
          const reason = describeError(error);
          orca.notify(
            "error",
            rollbackFailure
              ? t(
                  "Failed to load: ${reason}. Cleanup also failed: ${cleanup}",
                  {
                    reason,
                    cleanup: rollbackFailure,
                  },
                )
              : t("Failed to load: ${reason}", { reason }),
            { title: pluginName },
          );
          throw error;
        }
      };
      const attempt = run();
      loading = attempt;
      return attempt.finally(() => {
        if (loading === attempt) loading = undefined;
      });
    },
    async unload() {
      // A failed load already rolled back and reported itself; unload only waits.
      await loading?.catch(() => undefined);
      const failure = await release();
      if (failure && current) {
        orca.notify(
          "error",
          t("Failed to unload: ${reason}", { reason: failure }),
          {
            title: current.pluginName,
          },
        );
      }
    },
  };
}

/**
 * The plugin with every feature wired together (the composition root).
 * Features are created before any load and in dependency order; the list
 * below is the load order, released in reverse. Later roadmap steps add more.
 */
export function createNextActionPlugin(): Plugin {
  const taskChanges = createTaskChangesFeature();
  const day = createLoadDayBoundary();
  const preview = createLoadStartPreviewDays(taskChanges.changes);
  const reminderTime = createLoadReminderDefaultTime();
  const taskTag = createTaskTagFeature(
    () => taskChanges.changes.changed(),
    day.today,
  );
  const { repository } = taskTag;
  const taskActions = createTaskActionsFeature(repository, day.dayBoundary);
  const taskPanel = createTaskPanelFeature({
    repository,
    changes: taskChanges.changes,
    today: day.today,
    dayBoundary: day.dayBoundary,
    startPreviewDays: preview.startPreviewDays,
    reminderDefaultTime: reminderTime.reminderDefaultTime,
    taskActions: taskActions.taskActions,
  });
  const aiInstructions = createLoadAiInstructions();
  // One reader shared by every AI feature (#203), so a block that is missing
  // or cannot be read warns once, not once per feature or request.
  const userInstructions = createReadUserInstructions({
    repository,
    setting: aiInstructions.aiInstructions,
    warn: (message) => console.warn(`[nextaction] ${message}`),
  });
  // What every AI request is given besides its material (#201), shared by
  // every AI feature.
  const promptContext = createReadPromptContext({
    clock: systemClock,
    dayBoundary: day.dayBoundary,
    uiLanguage,
    userInstructions,
  });
  const splitSubtasks = createSplitSubtasksFeature({
    repository,
    promptContext,
  });
  const extractTasks = createExtractTasksFeature({
    repository,
    today: day.today,
    promptContext,
    taskTagBlockId: taskTag.taskTagBlockId,
  });
  const taskMenu = createTaskMenuFeature({
    repository,
    taskTagBlockId: taskTag.taskTagBlockId,
    dayBoundary: day.dayBoundary,
    openTaskPanel: (taskId) => {
      taskPanel.open(taskId);
    },
    openCreateSubtask: taskTag.openCreateSubtask,
    openSplitSubtasks: splitSubtasks.open,
    // The panel feature is made below; called only once loaded.
    showInTaskMap: (taskId) => panel.showInTaskMap(taskId),
    names: taskTag.names,
  });
  const projectPanel = createProjectPanelFeature({
    repository,
    changes: taskChanges.changes,
    today: day.today,
    taskActions: taskActions.taskActions,
    // The project tag names are absent exactly while it is paused.
    projectsPaused: () => taskTag.projectNames.current() === undefined,
  });
  const projectMenu = createProjectMenuFeature({
    repository,
    projectTagBlockId: taskTag.projectTagBlockId,
    openProjectPanel: projectPanel.open,
  });
  const panel = createPanelFeature({
    repository,
    changes: taskChanges.changes,
    today: day.today,
    dayBoundary: day.dayBoundary,
    dayBoundaryChanges: day.changes,
    startPreviewDays: preview.startPreviewDays,
    taskActions: taskActions.taskActions,
    menuItems: taskMenu.items,
    projectMenuItems: projectMenu.items,
    taskPanel: { openPopup: taskPanel.open, formDeps: taskPanel.formDeps },
    openReviewPopup: taskPanel.openReviewPopup,
    openQuickCapture: taskTag.openQuickCapture,
    // The task tag block exists whenever tasks can be written.
    editorHost: {
      current: taskTag.taskTagBlockId,
      subscribe: taskTag.names.subscribe,
    },
    promptContext,
  });
  return createPlugin({
    features: [
      // First, so its timers and hooks exist before anything writes, and are
      // released last.
      taskChanges.feature,
      // Before anything reads the day boundary or opens a note.
      day.feature,
      // After the task change signal it gives on a change of the setting.
      preview.feature,
      reminderTime.feature,
      aiInstructions.feature,
      taskActions.feature,
      // Before the task tag feature, so it hears the outcome of startup.
      createStatusIconFeature(taskTag.names, taskTag.projectNames),
      // Before quick capture (in the task tag feature) and the task panel,
      // which both wear these styles.
      createPopupStyleFeature(),
      taskTag.feature,
      // Before the menus and the plugin panel that open it, so its root is
      // released after them.
      taskPanel.feature,
      // Before the project menu that opens it, so its root is released after it.
      projectPanel.feature,
      // Before the task menu that opens it, so its root is released after it.
      splitSubtasks.feature,
      extractTasks,
      taskMenu.feature,
      projectMenu.feature,
      panel.feature,
      // Last: it checks once loaded, so missed reminders are caught up with
      // every feature in place; its timer is released first.
      createReminderFeature({
        repository,
        changes: taskChanges.changes,
        names: taskTag.names,
        openInNotes: (taskId) => taskActions.taskActions.openInNotes(taskId),
      }),
    ],
  });
}
