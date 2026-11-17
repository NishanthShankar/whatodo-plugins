import forms from "./plugins/forms";
import habits from "./plugins/habits";
import lmpTracker from "./plugins/lmp-tracker";
import type { PluginDef } from "./sdk";

export * from "./sdk";

/** Every plugin in this repo. telcurio lists these in its marketplace, except the ones marked `unlisted`. */
export const plugins: PluginDef[] = [habits, lmpTracker, forms];
