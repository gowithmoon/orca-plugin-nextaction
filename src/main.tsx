import { createPlugin } from "./platform/bootstrap";
import { createDayBoundaryFeature } from "./platform/day-boundary";
import { createTaskTagFeature } from "./platform/task-tag-feature";

// Feature modules are wired in here; later roadmap steps add more.
const plugin = createPlugin({
  features: [createTaskTagFeature(), createDayBoundaryFeature()],
});

export const load = (pluginName: string) => plugin.load(pluginName);
export const unload = () => plugin.unload();
