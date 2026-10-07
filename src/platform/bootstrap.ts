import { setupL10N, t } from "../shared/l10n/l10n";
import zhCN from "../shared/l10n/zh-cn";
import { createRegistry, describeError, type Registry } from "./registry";
import {
  applySettingsSchema,
  readSettings,
  type Settings,
  type SettingsDefinition,
  settingsDefinition,
} from "./settings";

export interface FeatureContext {
  pluginName: string;
  registry: Registry;
  /** Current setting values, read from Orca with plugin defaults filled in. */
  settings: () => Settings;
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
  let current: { pluginName: string; registry: Registry } | undefined;
  // The load still in progress, if any; unload waits for it so nothing registers after release.
  let loading: Promise<void> | undefined;

  /** Releases everything registered so far; returns the failure summary, if any. */
  const release = async (): Promise<string | undefined> => {
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
        current = { pluginName, registry };
        try {
          await applySettingsSchema(pluginName, definition);
          const settings = () => readSettings(pluginName, definition);
          for (const feature of options.features) {
            await feature({ pluginName, registry, settings });
          }
        } catch (error) {
          // The original load error is what Orca and the user need; a rollback
          // failure must not replace it.
          await release();
          orca.notify(
            "error",
            t("Failed to load: ${reason}", { reason: describeError(error) }),
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
