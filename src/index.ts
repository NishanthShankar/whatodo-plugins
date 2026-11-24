import expenseTracker from "./plugins/expense-tracker";
import forms from "./plugins/forms";
import habits from "./plugins/habits";
import journal from "./plugins/journal";
import lmpTracker from "./plugins/lmp-tracker";
import mediastore from "./plugins/mediastore";
import safebutwhere from "./plugins/safebutwhere";
import subscriptionTracker from "./plugins/subscription-tracker";
import wishlist from "./plugins/wishlist";
import type { PluginDef } from "./sdk";

export * from "./sdk";

/** Every plugin in this repo. Zelfred lists these in its marketplace, except the ones marked `unlisted`. */
export const plugins: PluginDef[] = [habits, lmpTracker, forms, mediastore, journal, wishlist, safebutwhere, expenseTracker, subscriptionTracker];
