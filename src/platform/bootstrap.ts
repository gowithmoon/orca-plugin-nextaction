import { describeError } from "../shared/describe-error";
import { setupL10N, t } from "../shared/l10n/l10n";
import zhCN from "../shared/l10n/zh-cn";
import { createLoadDayBoundary } from "./day-boundary";
import { createPanelFeature } from "./panel-feature";
import { createRegistry, type Registry } from "./registry";
import {
  applySettingsSchema,
  readSettings,
  type Settings,
  type SettingsDefinition,
  settingsDefinition,
} from "./settings";
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
  const taskTag = createTaskTagFeature(() => taskChanges.changes.changed());
  const { repository } = taskTag;
  const day = createLoadDayBoundary();
  const taskActions = createTaskActionsFeature(repository, day.dayBoundary);
  const taskPanel = createTaskPanelFeature({
    repository,
    changes: taskChanges.changes,
    today: day.today,
    taskActions: taskActions.taskActions,
  });
  const taskMenu = createTaskMenuFeature({
    repository,
    taskTagBlockId: taskTag.taskTagBlockId,
    dayBoundary: day.dayBoundary,
    openTaskPanel: (taskId) => {
      taskPanel.open(taskId);
    },
  });
  const panel = createPanelFeature({
    repository,
    changes: taskChanges.changes,
    today: day.today,
    taskActions: taskActions.taskActions,
    menuItems: taskMenu.items,
    taskPanel: { openPopup: taskPanel.open, formDeps: taskPanel.formDeps },
  });
  return createPlugin({
    features: [
      // First, so its timers and hooks exist before anything writes, and are
      // released last.
      taskChanges.feature,
      // Before anything reads the day boundary or opens a note.
      day.feature,
      taskActions.feature,
      // Before the task tag feature, so it hears the outcome of startup.
      createStatusIconFeature(taskTag.names),
      taskTag.feature,
      // Before the menus and the plugin panel that open it, so its root is
      // released after them.
      taskPanel.feature,
      taskMenu.feature,
      panel.feature,
    ],
  });
}
