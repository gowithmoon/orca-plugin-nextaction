import { createPlugin } from "./platform/bootstrap";
import { createStatusIconFeature } from "./platform/status-icon-feature";
import { createTaskMenuFeature } from "./platform/task-menu-feature";
import { createTaskTagFeature } from "./platform/task-tag-feature";

// Feature modules are wired in here; later roadmap steps add more.
const taskTag = createTaskTagFeature();
const plugin = createPlugin({
  features: [
    // Before the task tag feature, so it hears the outcome of startup.
    createStatusIconFeature(taskTag.names),
    taskTag.feature,
    createTaskMenuFeature(taskTag.repository, taskTag.names),
  ],
});

export const load = (pluginName: string) => plugin.load(pluginName);
export const unload = () => plugin.unload();
