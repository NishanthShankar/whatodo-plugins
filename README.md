# whatodo-plugins

Plugins for [whatodo](https://whatodo.today), the todo list you run from WhatsApp.

Each plugin gets its own WhatsApp group with the person who installs it and the whatodo bot. whatodo sends the plugin what happens there (messages, reactions, a daily schedule, calls from its web page) and gives it a small kit to answer with: post in the group, react, keep its own data, read the person's time zone and settings.

Plugins never touch WhatsApp or whatodo's database directly, and their handlers run inside a transaction, so they have to be deterministic (no network calls, use `kit.now`).

## Plugins

| Plugin | What it does |
|---|---|
| 🌱 [Habits](src/plugins/habits) | One check-in per habit every night; react ✅ or 👍 if you did it. Streaks as 🟩⬜. |

## Writing one

```ts
import { definePlugin } from "whatodo-plugins/sdk";

export default definePlugin({
  id: "water",
  name: "Water",
  icon: "💧",
  tagline: "Drink enough water.",
  description: "…",
  groupName: "💧 Water",
  price: 0,
  welcome: "You've installed Water…",
  help: "…",
  async onMessage(event, kit) {
    await kit.store.put("glasses", kit.today, 1);
    kit.react("👍");
  },
});
```

See `src/sdk.ts` for the full interface. Add the plugin to `src/index.ts` and open a pull request.

## Develop

```sh
pnpm install
pnpm typecheck
pnpm test
```
