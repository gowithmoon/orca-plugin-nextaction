import { createPlugin } from "./platform/bootstrap";
import { createDayBoundaryFeature } from "./platform/day-boundary";
import { createStatusIconFeature } from "./platform/status-icon-feature";
import { createTaskTagFeature } from "./platform/task-tag-feature";

// Feature modules are wired in here; later roadmap steps add more.
const taskTag = createTaskTagFeature();
const plugin = createPlugin({
  features: [
    // Before the task tag feature, so it hears the outcome of startup.
    createStatusIconFeature(taskTag.names),
    taskTag.feature,
    createDayBoundaryFeature(),
  ],
});

export const load = (pluginName: string) => plugin.load(pluginName);
export const unload = () => plugin.unload();
