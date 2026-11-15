import habits from "./plugins/habits";
import lmpTracker from "./plugins/lmp-tracker";
import type { PluginDef } from "./sdk";

export * from "./sdk";

/** Every plugin in this repo. whatodo lists these in its marketplace. */
export const plugins: PluginDef[] = [habits, lmpTracker];
