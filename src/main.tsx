import { createPlugin } from "./platform/bootstrap";
import { createPanelFeature } from "./platform/panel-feature";
import { createStatusIconFeature } from "./platform/status-icon-feature";
import { createTaskChangesFeature } from "./platform/task-changes-feature";
import { createTaskMenuFeature } from "./platform/task-menu-feature";
import { createTaskTagFeature } from "./platform/task-tag-feature";

// Feature modules are wired in here; later roadmap steps add more.
const taskChanges = createTaskChangesFeature();
const taskTag = createTaskTagFeature(() => taskChanges.changes.changed());
const panel = createPanelFeature(taskTag.repository, taskChanges.changes);
const plugin = createPlugin({
  features: [
    // First, so its timers and hooks exist before anything writes, and are
    // released last.
    taskChanges.feature,
    // Before the task tag feature, so it hears the outcome of startup.
    createStatusIconFeature(taskTag.names),
    taskTag.feature,
    createTaskMenuFeature(taskTag.repository, taskTag.taskTagBlockId),
    panel.feature,
  ],
});

export const load = (pluginName: string) => plugin.load(pluginName);
export const unload = () => plugin.unload();
