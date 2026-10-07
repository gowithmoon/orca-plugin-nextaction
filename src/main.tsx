import { createPlugin } from "./platform/bootstrap";

// Feature modules are wired in here by later roadmap steps.
const plugin = createPlugin({ features: [] });

export const load = (pluginName: string) => plugin.load(pluginName);
export const unload = () => plugin.unload();
