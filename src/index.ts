import habits from "./plugins/habits";
import type { PluginDef } from "./sdk";

export * from "./sdk";

/** Every plugin in this repo. whatodo lists these in its marketplace. */
export const plugins: PluginDef[] = [habits];
