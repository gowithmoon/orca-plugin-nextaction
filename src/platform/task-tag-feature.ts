import type { ProjectTagNamesSource } from "../application/ports/project-tag-names";
import type { TaskRepository } from "../application/ports/task-repository";
import type { TaskTagNamesSource } from "../application/ports/task-tag-names";
import { createConvertToTask } from "../application/usecases/convert-to-task";
import { createQuickCapture } from "../application/usecases/quick-capture";
import type { CalendarDate } from "../domain/task/task";
import { noteLanguageFor } from "../infra/orca/codec/names";
import { createOrcaTaskRepository } from "../infra/orca/repository/orca-task-repository";
import { projectTagNamesFor } from "../infra/orca/schema/project-tag-names";
import { projectTagSchema } from "../infra/orca/schema/project-tag-structure";
import { taskTagNamesFor } from "../infra/orca/schema/task-tag-names";
import { taskTagSchema } from "../infra/orca/schema/task-tag-structure";
import { systemClock } from "../infra/system-clock";
import { t } from "../shared/l10n/l10n";
import { createQuickCaptureCommand } from "../ui/capture/quick-capture-popup";
import { createConvertToTaskCommand } from "../ui/commands/convert-to-task-command";
import { quickCaptureCss } from "../ui/styles/quick-capture-style";
import type { FeatureModule } from "./bootstrap";
import { createTagLifecycle, type TagMessages } from "./tag-lifecycle";

/** What the user is told about the task tag; worded as before #141. */
const taskTagMessages: TagMessages = {
  listenerFailed: (reason) =>
    t("A feature could not follow the change of the task tag: ${reason}", {
      reason,
    }),
  setupFailed: (name, reason) =>
    t('Could not set up the task tag "${name}": ${reason}', { name, reason }),
  renameFailed: (name, reason) =>
    t('Could not rename the task tag "${name}": ${reason}', { name, reason }),
  empty: (name) =>
    t('The task tag name cannot be empty. It was set back to "${name}".', {
      name,
    }),
  taken: (requested, name) =>
    t(
      '"${requested}" is already used by another page or block, so the task tag was not renamed. The name was set back to "${name}".',
      { requested, name },
    ),
  refused: (name, properties) =>
    t(
      'A tag named "${name}" already exists and its properties ${properties} have a different type than the plugin needs. Task features are paused. Choose another task tag name in the plugin settings.',
      { name, properties },
    ),
  invalidated: (name, properties) =>
    t(
      'The properties ${properties} of the task tag "${name}" were changed to a different type. The plugin reads them as empty and will not write them until their type is changed back.',
      { name, properties },
    ),
};

/** What the user is told about the project tag (#143). */
const projectTagMessages: TagMessages = {
  listenerFailed: (reason) =>
    t("A feature could not follow the change of the project tag: ${reason}", {
      reason,
    }),
  setupFailed: (name, reason) =>
    t('Could not set up the project tag "${name}": ${reason}', {
      name,
      reason,
    }),
  renameFailed: (name, reason) =>
    t('Could not rename the project tag "${name}": ${reason}', {
      name,
      reason,
    }),
  empty: (name) =>
    t('The project tag name cannot be empty. It was set back to "${name}".', {
      name,
    }),
  taken: (requested, name) =>
    t(
      '"${requested}" is already used by another page or block, so the project tag was not renamed. The name was set back to "${name}".',
      { requested, name },
    ),
  refused: (name, properties) =>
    t(
      'A tag named "${name}" already exists and its properties ${properties} have a different type than the plugin needs. Projects are paused: every task reads as belonging to no project. Choose another project tag name in the plugin settings.',
      { name, properties },
    ),
  invalidated: (name, properties) =>
    t(
      'The properties ${properties} of the project tag "${name}" were changed to a different type. The plugin reads them as empty and will not write them until their type is changed back.',
      { name, properties },
    ),
};

/**
 * Finds or creates the task tag when the plugin loads and aligns it, then
 * follows renames in the settings (ADR 0002), through the shared tag
 * lifecycle. A failure, a refused takeover or invalidated properties are
 * reported to the user but do not fail the load, so the settings page stays
 * usable (e.g. to pick another name).
 */
export function createTaskTagFeature(
  /** Called after every write of the plugin's to a task, also a failed one. */
  onWritten: () => void,
  /** The current logical day, for the quick capture window's dates. */
  today: () => CalendarDate,
): {
  feature: FeatureModule;
  /** The tag's note-facing names, following every change of the tag state. */
  names: TaskTagNamesSource;
  /** Tasks in the notes; it reads the tag state on every call. */
  repository: TaskRepository;
  /** The task tag block's ID; `undefined` while task features are paused. */
  taskTagBlockId: () => number | undefined;
  /** The project tag's note-facing names, following its tag state (#144). */
  projectNames: ProjectTagNamesSource;
  /** The project tag block's ID; `undefined` while the project tag is paused. */
  projectTagBlockId: () => number | undefined;
  /**
   * Opens the quick capture popup, as its command does (the review's steps,
   * #99); does nothing outside a load.
   */
  openQuickCapture: () => void;
} {
  const tag = createTagLifecycle({
    schema: taskTagSchema,
    // Both keys are what they were before #141, so existing repos keep their
    // setting and cache.
    settingKey: "taskTagName",
    cacheKey: "taskTag",
    messages: taskTagMessages,
    logName: "task tag",
  });
  const names: TaskTagNamesSource = {
    current: () => taskTagNamesFor(tag.state()),
    subscribe: tag.subscribe,
  };
  // Independent of the task tag (#140): one paused leaves the other working.
  const projectTag = createTagLifecycle({
    schema: projectTagSchema,
    settingKey: "projectTagName",
    cacheKey: "projectTag",
    messages: projectTagMessages,
    logName: "project tag",
  });
  const projectNames: ProjectTagNamesSource = {
    current: () => projectTagNamesFor(projectTag.state()),
    subscribe: projectTag.subscribe,
  };

  const repository = createOrcaTaskRepository(
    tag.state,
    onWritten,
    projectTag.state,
  );
  // The quick capture popup's opener exists only while loaded.
  let openCapture: () => void = () => {};

  const feature: FeatureModule = async (context) => {
    // No shortcut is assigned: the user binds one in Orca's settings.
    context.registry.editorCommand(
      "convertToTask",
      createConvertToTaskCommand(
        createConvertToTask({ repository }),
        context.pluginName,
      ),
      // The repository's invokeGroup is the undo unit.
      () => undefined,
      { label: t("Convert to task") },
    );
    // Its own style sheet; the window look and the fields' styles come from
    // the popup styles feature. The popup's own root, empty until the command
    // opens it; unload unmounts it.
    context.registry.css("quickCaptureStyle", quickCaptureCss);
    const captureRoot = context.registry.reactRoot("quickCapturePopup", null);
    const quickCapture = createQuickCaptureCommand(
      createQuickCapture({ repository, clock: systemClock }),
      context.pluginName,
      today,
      captureRoot.render,
    );
    context.registry.command("quickCapture", quickCapture, t("Create task"));
    // Recorded after the root, so it is released first: nothing opens the
    // popup into a root that is going away.
    openCapture = () => void quickCapture();
    context.registry.add(`${context.pluginName}.quickCaptureOpen`, () => {
      openCapture = () => {};
    });
    const uiLanguage = noteLanguageFor(orca.state.locale);
    await tag.load(context, uiLanguage);
    // Views read again once projects are known, or after a rename (ADR
    // 0007): the task graph holds none while the tag is starting.
    context.registry.add(
      `${context.pluginName}.projectTagChanges`,
      projectTag.subscribe(onWritten),
    );
    await projectTag.load(context, uiLanguage);
  };

  const taskTagBlockId = () => {
    const state = tag.state();
    return state.kind === "ready" ? state.tagBlockId : undefined;
  };

  const projectTagBlockId = () => {
    const state = projectTag.state();
    return state.kind === "ready" ? state.tagBlockId : undefined;
  };

  return {
    feature,
    names,
    repository,
    taskTagBlockId,
    projectNames,
    projectTagBlockId,
    openQuickCapture: () => openCapture(),
  };
}
