import { definePlugin } from "../../sdk";

/**
 * __NAME__
 *
 * Storage
 *   (list each collection: key, data shape, sort)
 */

const HELP = ["*__NAME__*", "", "_example_ does something"].join("\n");

export default definePlugin({
  id: "__ID__",
  version: "1.0.0",
  sdk: "1",
  name: "__NAME__",
  icon: "__ICON__",
  tagline: "One line that says what it does.",
  description: "Two or three sentences for the marketplace card: what it does, how you use it in WhatsApp.",
  groupName: "__ICON__ __NAME__",
  price: 0,
  tier: 1,
  listing: {
    title: "__NAME__ on WhatsApp: what people search for | whatodo",
    description: "One or two sentences for search results: what it does, that it runs in WhatsApp, free, no app.",
    h1: "__NAME__ on WhatsApp",
  },
  welcome: "__ICON__ You've installed *__NAME__*.\n\nTry _example_. Send _help_ any time.",
  help: HELP,

  async onMessage(event, kit) {
    const text = event.text.trim().toLowerCase();
    if (text === "example") {
      await kit.store.put("examples", kit.today, { at: kit.now }, kit.today);
      return kit.react("👍");
    }
    kit.unsure("I didn't get that. Send _help_ to see what I can do.");
  },
});
