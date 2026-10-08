import { createPlugin } from "./platform/bootstrap";
import { createPanelFeature } from "./platform/panel-feature";
import { createStatusIconFeature } from "./platform/status-icon-feature";
import { createTaskChangesFeature } from "./platform/task-changes-feature";
import { createTaskMenuFeature } from "./platform/task-menu-feature";
import { createTaskPanelFeature } from "./platform/task-panel-feature";
import { createTaskTagFeature } from "./platform/task-tag-feature";

// Feature modules are wired in here; later roadmap steps add more.
const taskChanges = createTaskChangesFeature();
const taskTag = createTaskTagFeature(() => taskChanges.changes.changed());
const taskPanel = createTaskPanelFeature(
  taskTag.repository,
  taskChanges.changes,
);
const panel = createPanelFeature(
  taskTag.repository,
  taskChanges.changes,
  taskPanel.open,
);
const plugin = createPlugin({
  features: [
    // First, so its timers and hooks exist before anything writes, and are
    // released last.
    taskChanges.feature,
    // Before the task tag feature, so it hears the outcome of startup.
    createStatusIconFeature(taskTag.names),
    taskTag.feature,
    // Before the menus and the plugin panel that open it, so its root is
    // released after them.
    taskPanel.feature,
    createTaskMenuFeature(
      taskTag.repository,
      taskTag.taskTagBlockId,
      taskPanel.open,
    ),
    panel.feature,
  ],
});

export const load = (pluginName: string) => plugin.load(pluginName);
export const unload = () => plugin.unload();
