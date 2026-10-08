import { createNextActionPlugin } from "./platform/bootstrap";

const plugin = createNextActionPlugin();

export const load = (pluginName: string) => plugin.load(pluginName);
export const unload = () => plugin.unload();
