# telcurio plugins

> **Draft.** The positioning below is waiting to be vetted. The technical parts (how plugins work, the rules, the release process) are current.

## The platform

**telcurio is a secure way for WhatsApp bots to connect to you.**

People already live in WhatsApp. Bots there today are a trust problem: you give a number your messages and hope it behaves, and every bot is its own app, its own account, its own idea of privacy. telcurio turns that around.

- **One account, many bots.** You add plugins to your telcurio account the way you add apps to a phone. Each plugin gets its own WhatsApp group with you and the telcurio number, named after the plugin ("🌱 Habits"). You talk to it there, like any chat.
- **A plugin only sees its own group.** It gets the messages you send in that group, reactions to its own messages, its own stored data, your time zone, and the settings you chose for it. It cannot read your other chats, your todos, other groups, other plugins' data, or anything on the internet. It cannot message anyone else. That is enforced by how plugins run, not by a promise: see [Security model](#security-model).
- **Nothing to install, nothing new to learn.** No app, no sign-up per bot. Remove a plugin and it stops posting; add it back and your data is still there.
- **Built on what telcurio already is.** telcurio started as a todo list you run from WhatsApp: write "pay rent friday 5pm" and it's on your list, with reminders, a morning summary, shared group lists and a website. Plugins extend the same account.

### For developers

Write a plugin once, in TypeScript, against a small SDK. telcurio handles WhatsApp (sending, reactions, replies, groups, rate limits and the 24 hour messaging window), scheduling in each person's time zone, storage, the website, login and the PIN lock. You write how the bot behaves.

The goal is a marketplace where developers publish plugins and **earn from them**. Today every plugin is free and plugins live in this repo; paid plugins, revenue share and outside developers publishing their own come next. See [docs/earning.md](docs/earning.md) for what is planned and what is not decided yet. Because people will pay for plugins and trust them with their data, the bar for every plugin is high: strict rules checked by CI, tests for everything, versioned releases with changelogs, and review before anything ships.

### Where this is going

1. **Now:** first-party plugins in this repo, bundled into telcurio. All free.
2. **Next:** paid plugins with checkout and payouts; outside developers contributing plugins here under review.
3. **Later:** plugins hosted by their developers and connected over webhooks, with the same event-in, actions-out contract and permissions shown at install. An open marketplace.

## Plugins

| Plugin | Version | Tier | What it does |
|---|---|---|---|
| 🌱 [Habits](src/plugins/habits) | 1.1.2 | 1 | Daily check-ins per habit; react ✅ or 👍 if you did it. Streaks as 🟩⬜. |
| 🌸 [Period Tracker](src/plugins/lmp-tracker) | 2.0.0 | 1 | Period and pregnancy tracker: next period, fertile window, due date, weekly updates. |

## How a plugin works

```
person's WhatsApp ──► "🌱 Habits" group ──► telcurio ──► plugin.onMessage(event, kit)
                                                  ◄── kit.send / kit.react / kit.store
```

- telcurio calls the plugin with **events**: a message in its group, a reaction to one of its messages, a schedule firing, a call from its web page, an install or an upgrade.
- The plugin answers through the **kit**: post in its group, react to the message, read and write its own data, change its settings.
- Handlers run inside a database transaction, so they are **deterministic**: no network, no timers, no clock other than `kit.now`.

```ts
import { definePlugin } from "whatodo-plugins/sdk";

export default definePlugin({
  id: "water",
  version: "1.0.0",
  sdk: "1",
  name: "Water",
  icon: "💧",
  tagline: "Drink enough water, one glass at a time.",
  description: "Send a 💧 every time you finish a glass. I keep count for the day and nudge you in the afternoon.",
  groupName: "💧 Water",
  price: 0,
  tier: 1,
  welcome: "💧 You've installed *Water*. Send 💧 after each glass.",
  help: "*Water*\n\n💧 logs a glass\n_today_ shows the count",
  async onMessage(event, kit) {
    if (event.text.trim() === "💧") {
      const n = ((await kit.store.get<number>("glasses", kit.today)) ?? 0) + 1;
      await kit.store.put("glasses", kit.today, n, kit.today);
      return kit.react("👍");
    }
    kit.send("Send 💧 after each glass.");
  },
});
```

## Security model

What a plugin can and cannot do is decided by telcurio's runtime and checked by CI here.

| A plugin can | A plugin cannot |
|---|---|
| Read messages the installer sends in its own group | Read any other chat, group or plugin |
| See reactions and replies to its own messages | See who else is in WhatsApp, or message anyone |
| Store and read its own data, per install | Read telcurio's data (todos, lists, other users) |
| Post and react in its own group | Make network calls, use timers, read the clock directly |
| Read the installer's time zone and name, and its own settings | Import anything but the SDK and its own files |

The runtime gives each handler a kit scoped to one install; there is no other handle to the database or to WhatsApp. The conformance tests in `src/conformance.test.ts` reject plugins that import anything else or use `fetch`, `Date.now`, `Math.random`, timers, `process`, `eval` and friends. Details: [docs/data-and-privacy.md](docs/data-and-privacy.md).

Known gap: every plugin can read the installer's name. It will become a permission shown at install.

## Docs

| Doc | Read it when |
|---|---|
| [docs/building-a-plugin.md](docs/building-a-plugin.md) | Writing a new plugin, start to finish |
| [docs/sdk-reference.md](docs/sdk-reference.md) | You need the exact contract of the kit, events and definition |
| [docs/testing.md](docs/testing.md) | Writing tests with the test kit |
| [docs/releasing.md](docs/releasing.md) | Changing a released plugin: versions, changelogs, data migrations |
| [docs/review-checklist.md](docs/review-checklist.md) | Before opening a pull request, and when reviewing one |
| [docs/data-and-privacy.md](docs/data-and-privacy.md) | Deciding what to store and what a plugin may see |
| [docs/earning.md](docs/earning.md) | Pricing and payouts (planned) |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Opening a pull request |

Building with Claude Code? The repo carries a skill, `.claude/skills/build-whatodo-plugin`, that follows this process.

## Develop

```sh
pnpm install
pnpm new water "Water" "💧"   # scaffold a plugin
pnpm check                    # typecheck + tests + conformance
pnpm release:check            # release rules against origin/main
```

## License

MIT. See [LICENSE](LICENSE).
