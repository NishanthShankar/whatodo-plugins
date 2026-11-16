# SDK reference

The contract between a plugin and whatodo, SDK version **1** (`src/sdk.ts` is the source of truth; this page explains it). Import from `whatodo-plugins/sdk` (or `../../sdk` inside this repo).

## definePlugin(def)

Validates and returns the definition. Throws on a bad `id`, a `version` that isn't `MAJOR.MINOR.PATCH`, an `sdk` major that doesn't match `SDK_VERSION`, or a `price` that isn't a whole number ≥ 0.

### PluginDef

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | yes | Stable id, `^[a-z][a-z0-9-]{1,30}$`. Never changes once released: installs and stored data hang off it. |
| `version` | string | yes | Plugin version, semver. Bumped on every release (see [releasing.md](releasing.md)). |
| `sdk` | string | yes | SDK major the plugin targets: `"1"`. |
| `name` | string | yes | Display name, ≤ 30 chars. |
| `icon` | string | yes | One emoji. |
| `tagline` | string | yes | Marketplace card line, ≤ 80 chars. |
| `description` | string | yes | Marketplace description, ≥ 40 chars. |
| `groupName` | string | yes | Name of the WhatsApp group created on install, ≤ 25 chars. |
| `price` | number | yes | Smallest currency unit (paise). Must be `0` today. |
| `tier` | `1 \| 2 \| 3` | yes in this repo (optional in the SDK type) | Platform cost tier: how much the plugin costs whatodo to run, not its price. See [Tiers](#tiers). |
| `welcome` | string | yes | Posted in the group right after install. |
| `help` | string | yes | Posted when the person sends `help`, `?`, `menu` or `commands` (whatodo handles this; `onMessage` doesn't see those). |
| `listing` | `{ title, description, h1 }` | yes in this repo (optional in the SDK type) | The plugin's public page on whatodo.today: search title (≤ 60), meta description (≤ 155), main heading (≤ 80). Write for what people search ("Habit tracker on WhatsApp"), not the plugin's name. |
| `settings` | `Record<string, Json>` | no | Defaults for a new install. |
| `schedules` | `ScheduleDef[]` | no | Daily or hourly triggers. |
| `onInstall` | `(kit) => Promise<void>` | no | Once, when an install is created (before the group exists: don't `send` here). |
| `onUpgrade` | `(fromVersion, kit) => Promise<void>` | no | Once per install, before any other handler, the first time a newer version handles an event for it. Migrate stored data. Must be idempotent. |
| `onMessage` | `(event: MessageEvent, kit) => Promise<void>` | no | A message from the installer in the plugin's group. |
| `onReaction` | `(event: ReactionEvent, kit) => Promise<void>` | no | The installer reacted to (or un-reacted) a message the plugin sent with a `ref`. |
| `onSchedule` | `(event: ScheduleEvent, kit) => Promise<void>` | no | A schedule fired. |
| `web` | `WebDef` | no | Data and actions for the plugin's web page. |

### ScheduleDef

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Unique within the plugin. Shows up as `event.id`. |
| `hour` | `number` | Once a day at that local hour (0-23). |
| | `{ setting: string }` | Once a day at the hour stored in that setting; `null` in the setting turns it off. The setting must have a default in `settings`. |
| | `"hourly"` | Once at the start of every local hour. Decide what's due with `kit.time.hour(kit.now)`. |

Slots run at most once per install: a daily schedule once per local day, an hourly one once per local hour. whatodo checks twice an hour, so a slot may fire up to ~30 minutes into its hour.

### WebDef

| Field | Type | Meaning |
|---|---|---|
| `lockable` | boolean | The person may lock the page behind their whatodo PIN. Use it for anything personal. |
| `load` | `(kit, args) => Promise<Json>` | Data for the page. Runs **read-only**: `store.put`, `store.delete`, `setSettings` and `send` throw. |
| `actions` | `Record<string, (kit, args) => Promise<Json \| void>>` | Changes the page can ask for. Throw `Error("Plain sentence")` to show the person a message. |

## Tiers

`tier` describes what a plugin costs the platform, so pricing and limits can be fair later (see [earning.md](earning.md)). Pick the lowest that's true and say why in the PR:

| Tier | Platform cost | Typical plugin |
|---|---|---|
| 1 | No or low | Keeps a little state, posts a few messages a day (Habits) |
| 2 | Medium | Posts many messages a day, stores a lot, or runs hourly work for most installs |
| 3 | High | Needs paid services or heavy processing (reserved; hosted plugins later) |

Raising a plugin's tier changes what people may pay for it, so it is a MAJOR release with maintainer approval. Lowering it is a MINOR.

## Events

```ts
interface MessageEvent  { text: string; quotedRef: Json | null }
interface ReactionEvent { emoji: string | null; ref: Json }   // emoji null: reaction removed
interface ScheduleEvent { id: string }
interface IntentEvent   { text: string; intent: string; target: string | null; confidence: number }
```

- `text` is trimmed by whatodo; it is never empty.
- `quotedRef` is the `ref` of **your** message the person replied to, or `null`. Replies to their own messages or to messages without a ref give `null`.
- Only the installer's messages and reactions reach the plugin.
- `IntentEvent` reaches `onIntent` only after `onMessage` called `kit.unsure()`; see [Understanding unclear messages](#understanding-unclear-messages).

## Kit

| Member | Type | Meaning |
|---|---|---|
| `now` | number | The event's moment (ms). Use instead of `Date.now()`. |
| `today` | string | Today in the person's zone, `YYYY-MM-DD`. |
| `person` | `{ name: string \| null; timezone: string }` | The installer. `name` is what they set in whatodo (may be null). |
| `settings` | `Record<string, Json>` | Defaults merged with the install's values. |
| `setSettings(patch)` | `Promise<void>` | Merge a patch into the install's settings. |
| `store` | `Store` | Per-install storage, below. |
| `send(text, { ref? })` | void | Post in the plugin's group after the handler finishes. ≤ 4000 chars. WhatsApp formatting (`*bold*`, `_italic_`) works. Attach `ref` to recognise reactions and replies. |
| `react(emoji)` | void | React to the message being handled; the last call wins. In `onMessage` that is the person's message, in `onReaction` the plugin's own message they reacted to (acknowledge their reaction). `""` removes it. Ignored in schedules and web calls. Since SDK 1.3.0. |
| `unsure(fallback)` | void | `onMessage` only: you couldn't read the message. With `understand`, whatodo works out the intent and calls `onIntent`; otherwise, or if it isn't sure, it posts `fallback`. Since SDK 1.4.0. |
| `id()` | string | A short random id for new records. |
| `time.day(ms)` | string | `YYYY-MM-DD` of an instant in the person's zone. |
| `time.shiftDay(day, n)` | string | Add `n` days to a `YYYY-MM-DD`. |
| `time.hour(ms)` | number | Local hour (0-23) of an instant. |

`send` and `react` are queued and carried out after the handler returns, only if it didn't throw. Delivery goes through whatodo's WhatsApp gateway: inside 24 hours of the person's last message in the group it is immediate; otherwise it is queued and rate-limited, so scheduled posts can arrive a little late. Keep scheduled posts few.

### Store

```ts
get<T>(collection, key): Promise<T | null>
put(collection, key, data: Json, sort?: string | number): Promise<void>
delete(collection, key): Promise<void>
list<T>(collection, { prefix?, from?, to?, limit? }): Promise<{ key, data: T, sort }[]>
```

- Scoped to one install: no two people, and no two plugins, ever share rows.
- `put` replaces the whole value; keeps the previous `sort` if you omit it on an update.
- `list` returns items in `sort` order, then key. `prefix` filters keys; `from`/`to` (inclusive) filter `sort`. Without a sort value, items come last.
- Values must be JSON. Keep each value small (a record, not a whole history).

## Understanding unclear messages

Since SDK 1.4.0. People don't always use your exact commands ("I want to start going to the gym on mondays"). Declare what they might want, and whatodo's intent model (jev) picks one when your own parser can't:

```ts
understand: {
  intents: {
    add_habit: "Start tracking a new habit, every day or on some days",
    set_days: "Change which days an existing habit is on",
    list: "See their habits and streaks",
  },
  // optional: what a message could be about, id -> label
  async targets(kit) {
    return Object.fromEntries((await kit.store.list<Habit>("habits")).map((h) => [h.key, h.data.name]));
  },
},
async onIntent({ text, intent, target }, kit) { /* read names, days, times from text */ },
```

1. `onMessage` runs first, always. When it can't read the message it calls `kit.unsure("I didn't get that. Send help.")` instead of sending that text itself.
2. whatodo asks the model one question: which intent (and, with `targets`, which target) the message means. It runs outside the transaction, so it takes a second or two.
3. If the model is confident, `onIntent` runs with the message text, the intent id, the target id (or null) and the confidence. If not, or if the model is off, the fallback is posted. Nothing runs twice.

Rules:
- **The model only chooses.** It returns an intent id and a target id, never text. Read names, days and times out of `text` yourself, more leniently than in `onMessage` since you now know what the person wants.
- **Intents** are 2 to 20 lowercase snake_case ids with a plain description each. Describe what the person wants, not your command syntax. `definePlugin` checks this.
- **targets(kit)** gets a read-only kit (no `send`, no writes). Return at most 50; labels are what a person would call the thing.
- `onIntent` gets a normal kit: store, send, react. Acknowledge as you would for the command (👍 saved). When the intent needs something the text doesn't have, ask a short question with the exact command.
- The message text goes to the intent model to be classified and is not stored there or by whatodo. See [data-and-privacy.md](data-and-privacy.md).

## Helpers

| Export | Meaning |
|---|---|
| `SDK_VERSION` | the SDK version (`"1.4.0"`). |
| `compareVersions(a, b)` | Negative, zero or positive, comparing semver strings. Use in `onUpgrade`. |
| `Json`, `Kit`, `PluginDef`, `Tier`, `Listing`, … | Types. |

## Testing

`whatodo-plugins/testing` exports `createTestKit`: see [testing.md](testing.md).

## Versioning of the SDK

The SDK follows semver. A minor version adds things (new kit methods, new schedule kinds) without breaking plugins. A major version may break them; whatodo runs plugins only against the SDK major they declare in `sdk`. Changes are listed in [../CHANGELOG.md](../CHANGELOG.md).
