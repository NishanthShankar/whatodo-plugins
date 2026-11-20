# SDK reference

The contract between a plugin and Zelfred, SDK version **1** (`src/sdk.ts` is the source of truth; this page explains it). Import from `whatodo-plugins/sdk` (or `../../sdk` inside this repo).

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
| `tier` | `1 \| 2 \| 3` | yes in this repo (optional in the SDK type) | Platform cost tier: how much the plugin costs Zelfred to run, not its price. See [Tiers](#tiers). |
| `welcome` | string | yes | Posted in the group right after install. |
| `help` | string | yes | Posted when the person sends `help`, `?`, `menu` or `commands` (Zelfred handles this; `onMessage` doesn't see those). |
| `listing` | `{ title, description, h1 }` | yes in this repo (optional in the SDK type) | The plugin's public page on whatodo.today: search title (≤ 60), meta description (≤ 155), main heading (≤ 80). Write for what people search ("Habit tracker on WhatsApp"), not the plugin's name. |
| `settings` | `Record<string, Json>` | no | Defaults for a new install. |
| `schedules` | `ScheduleDef[]` | no | Daily or hourly triggers. |
| `onInstall` | `(kit) => Promise<void>` | no | Once, when an install is created (before the group exists: don't `send` here). |
| `onUpgrade` | `(fromVersion, kit) => Promise<void>` | no | Once per install, before any other handler, the first time a newer version handles an event for it. Migrate stored data. Must be idempotent. |
| `onMessage` | `(event: MessageEvent, kit) => Promise<void>` | no | A message in the plugin's group: from the installer, or from anyone in the group with the `"members"` permission. |
| `onReaction` | `(event: ReactionEvent, kit) => Promise<void>` | no | The installer (anyone in the group, with `"members"`) reacted to or un-reacted a message the plugin sent with a `ref`. |
| `onSchedule` | `(event: ScheduleEvent, kit) => Promise<void>` | no | A schedule fired. |
| `onAnswer` | `(event: AnswerEvent, kit) => Promise<void>` | no | Someone answered a question asked with `kit.ask`. See [Asking a question](#asking-a-question). Since SDK 1.9.0. |
| `onHook` | `(event: HookEvent, kit) => Promise<void>` | no | A request arrived at one of the install's hooks. See [Hooks](#hooks-requests-from-outside). Since SDK 1.5.0. |
| `onEntry` | `(event: EntryEvent, kit) => Promise<void>` | no | An entry was added, edited or removed in a `"vault"` plugin's group. The plugin never sees what it says. See [A vault](#a-vault-entries-nobody-else-can-read). Since SDK 1.21.0. |
| `onGroup` | `(event: GroupEvent, kit) => Promise<void>` | no | The person handed the plugin a WhatsApp group they already had, or took it back. Having it is what makes the plugin a choice for existing groups. Needs `"groups"`. Since SDK 1.17.0. |
| `permissions` | `Permission[]` | no | What it may do beyond its own group and storage: `"hooks"`, `"groups"`, `"replies"`, `"lock-members"`, `"members"`. See [Permissions](#permissions). Since SDK 1.6.0. |
| `unlisted` | boolean | no | Left out of the store and the public site; only people Zelfred allows can add it. For plugins still being tried out. Since SDK 1.5.0. |
| `web` | `WebDef` | no | Data and actions for the plugin's web page. |

### ScheduleDef

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Unique within the plugin. Shows up as `event.id`. |
| `hour` | `number` | Once a day at that local hour (0-23). |
| | `{ setting: string }` | Once a day at the hour stored in that setting; `null` in the setting turns it off. The setting must have a default in `settings`. |
| | `"hourly"` | Once at the start of every local hour. Decide what's due with `kit.time.hour(kit.now)`. |

Slots run at most once per install: a daily schedule once per local day, an hourly one once per local hour. Zelfred checks twice an hour, so a slot may fire up to ~30 minutes into its hour.

### WebDef

| Field | Type | Meaning |
|---|---|---|
| `lockable` | boolean | The person may lock the page behind their Zelfred PIN. Use it for anything personal. |
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
interface MessageEvent  { text: string; quotedRef: Json | null; group?: string | null; sender?: Sender }
interface ReactionEvent { emoji: string | null; ref: Json; group?: string | null; sender?: Sender }   // emoji null: reaction removed
interface ScheduleEvent { id: string }
interface IntentEvent   { text: string; intent: string; target: string | null; confidence: number; sender?: Sender }
interface AnswerEvent   { ref: Json | null; choice: number; option: string; changed?: boolean; group?: string | null; sender?: Sender }   // since SDK 1.9.0
interface Sender        { id: string; name: string | null; owner: boolean }   // who sent it; since SDK 1.8.0
interface HookEvent     { key: string; fields: Record<string, string>; files: HookFile[]; origin: string | null }
interface HookFile      { id: string; field: string; name: string; type: string; size: number }
interface GroupEvent    { kind: "joined" | "left"; key: string; name: string }   // since SDK 1.17.0
interface EntryEvent    { change: "added" | "edited" | "removed"; id: string; kind: string; at: number; source: "whatsapp" | "web"; sender?: Sender }   // "vault" plugins; since SDK 1.21.0
```

- `text` is trimmed by Zelfred; it is never empty.
- `quotedRef` is the `ref` of **your** message the person replied to, or `null`. Replies to their own messages or to messages without a ref give `null`.
- Only the installer's messages and reactions reach the plugin.
- `group` is the key of the extra group (`kit.groups.open`) the event happened in, or `null` for the main group. Making a group takes a little while and can fail and be retried, so never wait for it: keep working in the main group until events start arriving with the key.
- `GroupEvent` reaches `onGroup`. A plugin that has `onGroup` can be handed a WhatsApp group the person already had: they pick the plugin for it on the web, or in the chat with Zelfred after adding Zelfred to a group. On `"joined"`, record the group under `key` (it starts with `x-`) the way you record groups you opened yourself; `kit.send` in the handler posts in that group. From then on events there carry `group: key`. On `"left"` the person chose something else for the group: tidy your records, Zelfred has already stopped listening. `kit.groups.close(key)` on such a group only stops listening; nobody is taken out. Other people are usually in these groups already, so think about what your plugin does with their messages (see [More than one person in the group](#more-than-one-person-in-the-group)).
- `IntentEvent` reaches `onIntent` only after `onMessage` called `kit.unsure()`; see [Understanding unclear messages](#understanding-unclear-messages).

## Kit

| Member | Type | Meaning |
|---|---|---|
| `now` | number | The event's moment (ms). Use instead of `Date.now()`. |
| `today` | string | Today in the person's zone, `YYYY-MM-DD`. |
| `person` | `{ name: string \| null; timezone: string }` | The installer. `name` is what they set in Zelfred (may be null). |
| `settings` | `Record<string, Json>` | Defaults merged with the install's values. |
| `setSettings(patch)` | `Promise<void>` | Merge a patch into the install's settings. |
| `store` | `Store` | Per-install storage, below. |
| `groups.open(key, { name, hello? })` | `Promise<void>` | Ask for an extra WhatsApp group for this install (the person and Zelfred). `name` ≤ 25 chars; `hello` is posted once it exists. Does nothing if `key` is already open. Since SDK 1.6.0. |
| `groups.close(key)` | `Promise<void>` | Stop using that group. Zelfred stops listening and posting there. Since SDK 1.6.0. |
| `send(text, { ref?, group? })` | void | Post in the plugin's group after the handler finishes. With `group`, post in that extra group instead (the main group until it exists). While handling an event from an extra group, that group is the default. ≤ 4000 chars. WhatsApp formatting (`*bold*`, `_italic_`) works. Attach `ref` to recognise reactions and replies. |
| `react(emoji)` | void | React to the message being handled; the last call wins. In `onMessage` that is the person's message, in `onReaction` the plugin's own message they reacted to (acknowledge their reaction). `""` removes it. Ignored in schedules and web calls. Since SDK 1.3.0. |
| `unsure(fallback)` | void | `onMessage` only: you couldn't read the message. With `understand`, Zelfred works out the intent and calls `onIntent`; otherwise, or if it isn't sure, it posts `fallback`. Since SDK 1.4.0. |
| `id()` | string | A short random id for new records. |
| `hooks.url(key)` | `Promise<string>` | The web address of this install's hook `key` (lowercase letters, digits, dashes), made on first use. Anyone who has it can POST to it; each request arrives as `onHook`. Not on page loads. Since SDK 1.5.0. |
| `hooks.remove(key)` | `Promise<void>` | Close a hook. Its address stops working. Since SDK 1.5.0. |
| `files.remove(id)` | `Promise<void>` | Delete a file that arrived through a hook. Since SDK 1.5.0. |
| `time.day(ms)` | string | `YYYY-MM-DD` of an instant in the person's zone. |
| `time.shiftDay(day, n)` | string | Add `n` days to a `YYYY-MM-DD`. |
| `time.hour(ms)` | number | Local hour (0-23) of an instant. |

`send` and `react` are queued and carried out after the handler returns, only if it didn't throw. Delivery goes through Zelfred's WhatsApp gateway: inside 24 hours of the person's last message in the group it is immediate; otherwise it is queued and rate-limited, so scheduled posts can arrive a little late. Keep scheduled posts few.

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

## Permissions

By default a plugin can only hear its own group, post there, and keep its own data. Anything more is a permission it lists in `permissions`. Zelfred shows the list to the person before they add the plugin, and refuses a call the plugin didn't ask for. Since SDK 1.6.0.

| Permission | Lets the plugin | Status |
|---|---|---|
| `"hooks"` | Receive requests from outside Zelfred: `kit.hooks`, `onHook`, and the files that come with them. | Built (SDK 1.5.0) |
| `"api"` | Let the person's own other systems read the install's data with a key, and be called when something happens: `api`, `kit.emit`. | Built (SDK 1.19.0), private for now |
| `"groups"` | Make extra WhatsApp groups for the install: `kit.groups`, `kit.send(text, { group })`. | Built (SDK 1.6.0) |
| `"replies"` | Be called back when someone replies. | Reserved: the name is fixed so plugins and people can plan for it; nothing is built yet. |
| `"lock-members"` | Block adding members: its groups (the main one and any extra ones) are made with Zelfred as the only admin and set so only admins can add people. For plugins whose group must stay between the person and Zelfred. | Reserved (SDK 1.7.0): Zelfred doesn't enforce it yet. |
| `"members"` | Hear everyone in its groups, not only the person who added it. Each message, reaction and intent says who sent it in `event.sender`. Can't be combined with `"lock-members"`. | Built (SDK 1.8.0) |
| `"links"` | Get the public details of links people send: `event.links`. Zelfred opens the link, not the plugin. | Built (SDK 1.10.0) |
| `"vault"` | Nothing: it takes reading away. What is written in the plugin's group is locked on arrival with a key only the person's browser holds. The plugin gets `onEntry` and never a message. See [A vault](#a-vault-entries-nobody-else-can-read). | Built (SDK 1.21.0), unlisted plugins only until the locking is reviewed |

Ask for the fewest that the feature needs. For a listed plugin, adding a permission is a MAJOR bump: people agreed to the old list. An unlisted plugin can add one in a MINOR.

## A vault: entries nobody else can read

For a plugin where people write things only they should read (a journal). With `"vault"` in `permissions`:

- **Every message in the group is an entry.** It is locked the moment it arrives, before Zelfred's backend sees it, with a public key made in the person's browser. Zelfred stores the locked entry and reacts 👍 once it is stored and confirmed. Nobody can open it without the person's passphrase: not the plugin, not Zelfred.
- **The plugin hears `onEntry` and nothing else about it.**

  ```ts
  interface EntryEvent {
    change: "added" | "edited" | "removed";
    id: string;       // the same on every event about this entry
    kind: "text" | "image" | "voice" | "audio" | "video" | "file" | "sticker" | "location" | "contact" | "other";
    at: number;       // the moment it belongs to (ms)
    source: "whatsapp" | "web";
    sender?: Sender;
  }
  ```

  Count days, keep a streak, say one line after the first entry. `kit.send` in `onEntry` posts in the group; for an entry written on the page there is no message to answer, so say nothing.
- **No typed commands.** Nothing typed is read, so `help` is an entry like any other. `definePlugin` refuses a vault plugin with `onMessage`, `understand`, `onGroup`, `"links"` or `"members"`. Settings are changed on the page (`web.actions`) or with `kit.ask`, whose answers stay readable.
- **The `welcome` is pinned** in the group and is also the group's description. Keep it to what the person must know: what can and can't be read, and at most three instructions. `help` is never sent.
- **❌ on a message removes its entry**, and an edit replaces its words. Zelfred does both; the plugin hears `"removed"` or `"edited"`.
- **The page is Zelfred's.** The person unlocks it with a passphrase and the entries are opened in their browser. `web.load` still runs and returns only what the plugin knows (counts, dates, settings).
- **Reactions, `kit.ask`, schedules and `kit.send` work as everywhere.** What the plugin sends is not locked: never put anything in a message that should be private. A poll answer is readable by Zelfred.
- **The group is made only after the person has set a passphrase** on the website, since there is nothing to lock with before that.

What to tell people: Zelfred reads each message once, to lock it, and can't open it after that. Never write "end to end encrypted"; it isn't. The chat on the phone, and WhatsApp's own backup, still hold the readable message.

Test with `t.entry(plugin, { id, change?, kind?, at?, source? })`.

## Links

A plugin can't reach the internet. With the `"links"` permission Zelfred does it for one thing: when a message has a link, Zelfred opens it and hands the plugin what the page says about itself. Since SDK 1.10.0.

```ts
async onMessage(event, kit) {
  for (const l of event.links ?? []) {
    // l.url, l.canonical, l.site, l.kind, l.found, l.title, l.description, l.author, l.image, l.seconds
  }
}
```

- `event.links` is set only when the message has a link: at most 3, in the order they appear. `event.text` is still the whole message, links included.
- `canonical` is the link without tracking parts, and the same for every way of sharing one thing (`youtu.be/ID`, a shorts link and a watch link are one). Key on it to spot a repeat.
- `site` is `"YouTube"`, `"Instagram"` or the site's own name. `kind` is `"video"`, `"short"`, `"reel"`, `"post"` or `"page"`.
- `found: false` means the page couldn't be read (private, deleted, blocked, too slow). The other details are then null. Still do something useful with the bare link.
- `description` is the description or caption (up to 5000 characters), `author` the channel or account, `seconds` the length when the site gives it.
- `image` is an address, not a file. Instagram's stop working after some days; YouTube's don't.
- Reading takes a second or two, so the message reaches you that much later. Zelfred shows nothing meanwhile; react when you have handled it.
- Only public pages are read, with no login. What is said or shown inside a video is not available.

## Remembering the person's message

`kit.send(text, { ref })` lets you recognise reactions and replies to your own message. `kit.mark(ref)` does the same for the person's message you are handling in `onMessage`: a reaction to it arrives in `onReaction` with that ref, and a reply to it carries it as `quotedRef`. Use it when their message is the record itself (the link they saved). Since SDK 1.10.0.

- One ref per message; calling it again replaces the first.
- `kit.react` inside `onReaction` is ignored for a marked message: their own reaction is already showing on it.

## Asking a question

Whenever the plugin needs a structured answer, ask with `kit.ask`. That covers a plain yes or no. Never write your own "reply A, B or C". Since SDK 1.9.0.

```ts
kit.ask("Did you meditate today?", ["Yes", "No"], { ref: { habit: id, day: kit.today } });

async onAnswer(event, kit) {
  // event.choice: 0 or 1. event.option: "Yes". event.ref: { habit, day }. event.sender: who.
}
```

**How it is sent.** A WhatsApp poll. When a poll can't be sent (the chat hasn't written in the last 24 hours), the question goes out as text with a numbered list and "Reply with the number". The plugin doesn't need to know which.

**Typed answers count.** Someone who ignores the poll and types the option's number or its text has answered: `onAnswer` runs, exactly as for a tap. It goes to the poll they quoted, or to the only open question in the group; with several open and nothing quoted it is an ordinary message and reaches `onMessage`.

**Answers outside the options.** If "3 days" answers "When shall I remind you?", it reaches `onMessage` like any message. When the plugin takes it as the answer, it calls `kit.close(ref)` so the poll is deleted. An unrelated message leaves the question open.

**One person in the group** (the usual case): the first answer settles the question. The poll is deleted so the answer can't be changed, and the `confirm` line is posted as the record: by default `"{{question}}: {{option}}"`, so "Did you meditate today?: Yes". Give your own (`confirm: "🌱 Meditate, done"`) or `false` and say something in `onAnswer`. A poll older than two days can't be deleted by WhatsApp: it stays, and the first answer still counts.

**A question that stays** (`keep: true`): for an answer the person may want to correct, like a daily check-in. The poll is not deleted and no confirm line is posted; the poll shows the answer. Every change counts while the question is open and arrives as `onAnswer` with `changed: true`. Removing the tick is not an answer: the last one stays. Close it with `kit.close(ref)` or by asking the same ref again; the poll stays in the chat, and Zelfred says once that it is closed if someone changes it later. Since SDK 1.11.0.

**Several people in the group** (the `"members"` permission): the poll stays where everyone can see it. Each person's first answer counts and arrives as its own `onAnswer`. A person may change their answer once, ever: it arrives again with `changed: true`, and Zelfred tells them later changes won't count. After that a change is refused and they are told so. Keep the answer per `sender.id`. Nothing settles the question until the plugin calls `kit.close(ref)`, which deletes the polls.

**Limits.** 2 to 100 different options, up to 100 characters each; the question up to 255. A poll holds 12 options, so a longer list goes out as several polls, at most three at a time. When there are more, the last option is "See more" and the next ones follow when someone picks it. An answer in any of them answers the question, and all of them are deleted together.

**Asking again** with the same `ref` replaces the earlier question.

**Before you build a question into a plugin, decide with the owner:** what the `confirm` line says, what happens when several people are in the group, when the question is closed, and whether the options could ever run past three polls (36). These are product choices, not defaults to guess.

## More than one person in the group

By default a plugin hears one person: the one who added it. Other people in the group are ignored. A plugin for something shared (a list a household keeps, a vote) asks for the `"members"` permission and then hears everyone the person adds to the group. Since SDK 1.8.0.

- `event.sender` says who sent a message, reaction or intent: `{ id, name, owner }`. Zelfred sets it for every plugin; without `"members"` it is always the owner.
- Store `sender.id` when you need to remember who did something. It stays the same for that person and is not a phone number. `sender.name` is their WhatsApp name: show it, but don't use it as a key, because names change and two people can share one.
- `kit.person`, `kit.settings`, `kit.today` and the store all belong to the install, so they are the owner's whoever is writing. Times are in the owner's zone.
- `event.sender.profile` says whether that person has a Zelfred profile of their own. Someone a friend added to the group usually doesn't. A plugin may offer them one: ask with `kit.ask`, and on their yes call `kit.signUp(sender.id)`. Never sign someone up without their yes, and keep the offer to one ask per person. Since SDK 1.13.0.
- `web.loadFor(kit, sender, args)` is what a friend sees on the web once they log in to Zelfred themselves: their own numbers in what the owner set up. Return only what that person may see. Since SDK 1.14.0.
- `kit.person.id` is the owner's own `sender.id`, for finding their records when there is no event (a page load, a schedule). Since SDK 1.15.0.
- There is no list of the group's members. You learn of a person when they first write or react, so keep your own record if you need one.
- Platform commands (`mentions on`, `reset pin`) only work for the owner.
- Anyone in the group can read everything the plugin posts there. Don't ask for `"members"` in a plugin that holds private data.

## Hooks: requests from outside

A plugin that needs to hear from the outside world (a form on a website, another service) opens a hook. Since SDK 1.5.0.

```ts
const url = await kit.hooks.url("contact");   // https://.../hook/<token>
// ...later, someone POSTs to it:
async onHook({ key, fields, files, origin }, kit) {
  await kit.store.put("submissions", kit.id(), { key, fields, files: files.map((f) => f.id) }, kit.now);
  kit.send(`New from ${key}: ${fields.name ?? "someone"}`);
}
```

- The address takes a POST with JSON, a URL-encoded form or a multipart form (with files), from any site. Zelfred answers the sender (`{ ok: true }`, or a redirect to the `_next` field for a plain form) before the plugin runs, so `onHook` can't answer them.
- Zelfred drops a request whose `_gotcha` field is filled (a trap for bots), caps how many requests a hook takes per minute and per day, and caps field count, field length, file count (5) and file size (10 MB each). What reaches `onHook` is already inside those limits. Fields starting with `_` are Zelfred's and are not passed on.
- Files stay with Zelfred. The plugin gets `{ id, field, name, type, size }` for each and stores the ids. Its web page shows a file by id through Zelfred, which checks that the file belongs to the person looking. `kit.files.remove(id)` deletes one; removing the plugin's data should remove its files too.
- A hook brings in other people's details (whoever filled in the form). Store only what the feature needs and give the person a way to delete it. See [data-and-privacy.md](data-and-privacy.md).
- Every request can turn into a WhatsApp message. Keep `kit.send` to one short message per request, and bundle when many arrive.

## An API for the person's other systems

With the `"api"` permission a plugin can open read endpoints and events to the person's own scripts and backends. Nothing is reachable until the person makes a key on the plugin's page.

```ts
api: {
  get: {
    links: { about: "The saved links, newest first.", params: { limit: "How many, up to 100." }, run: async (kit, p) => list(kit, p) },
  },
  events: { "link.added": "A link was saved." },
},
```

- `GET /api/v1/<plugin id>/<name>?limit=5` with `Authorization: Bearer <key>` runs `get[name].run(kit, { limit: "5" })` and sends back `{ ok: true, data }`. The kit is read-only, as on a page load.
- `await kit.emit("link.added", data)` in any handler that can write. Zelfred posts it to the address the person set up, signed, and tries again if it fails. The plugin never learns whether anyone is listening.
- The person can limit a key or a callback address to some of the install's groups. `run(kit, params, scope)` gets `scope.groups` (group keys, `null` in the list for the main group; `null` instead of a list for no limit) and must return nothing from other groups. `kit.emit(event, data, { group })` names the group, or groups, an event happened in.
- Return and emit only what the person may see themselves. In a group with other people that includes what those people sent, so think about what you put in.
- Zelfred does the keys, the limits, the signing and the retries. A plugin still can't reach the internet itself.

## Understanding unclear messages

Since SDK 1.4.0. People don't always use your exact commands ("I want to start going to the gym on mondays"). Declare what they might want, and Zelfred's intent model (jev) picks one when your own parser can't:

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
2. Zelfred asks the model one question: which intent (and, with `targets`, which target) the message means. It runs outside the transaction, so it takes a second or two.
3. If the model is confident, `onIntent` runs with the message text, the intent id, the target id (or null) and the confidence. If not, or if the model is off, the fallback is posted. Nothing runs twice.

Rules:
- **The model only chooses.** It returns an intent id and a target id, never text. Read names, days and times out of `text` yourself, more leniently than in `onMessage` since you now know what the person wants.
- **Intents** are 2 to 20 lowercase snake_case ids with a plain description each. Describe what the person wants, not your command syntax. `definePlugin` checks this.
- **targets(kit)** gets a read-only kit (no `send`, no writes). Return at most 50; labels are what a person would call the thing.
- `onIntent` gets a normal kit: store, send, react. Acknowledge as you would for the command (👍 saved). When the intent needs something the text doesn't have, ask a short question with the exact command.
- The message text goes to the intent model to be classified and is not stored there or by Zelfred. See [data-and-privacy.md](data-and-privacy.md).

## Helpers

| Export | Meaning |
|---|---|
| `SDK_VERSION` | the SDK version (`"1.4.0"`). |
| `compareVersions(a, b)` | Negative, zero or positive, comparing semver strings. Use in `onUpgrade`. |
| `Json`, `Kit`, `PluginDef`, `Tier`, `Listing`, … | Types. |

## Testing

`whatodo-plugins/testing` exports `createTestKit`: see [testing.md](testing.md).

## Versioning of the SDK

The SDK follows semver. A minor version adds things (new kit methods, new schedule kinds) without breaking plugins. A major version may break them; Zelfred runs plugins only against the SDK major they declare in `sdk`. Changes are listed in [../CHANGELOG.md](../CHANGELOG.md).
