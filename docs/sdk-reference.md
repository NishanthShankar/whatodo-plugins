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
| `listing` | `{ title, description, h1 }` | yes in this repo (optional in the SDK type) | The plugin's public page on zelfred.com: search title (≤ 60), meta description (≤ 155), main heading (≤ 80). Write for the problem and the words people search ("Subscription tracker and renewal reminders"), not the plugin's name. It need not say WhatsApp: that is the channel, not what the app is for. |
| `settings` | `Record<string, Json>` | no | Defaults for a new install. |
| `schedules` | `ScheduleDef[]` | no | Daily or hourly triggers. |
| `onInstall` | `(kit) => Promise<void>` | no | Once, when an install is created (before the group exists: don't `send` here). |
| `onUpgrade` | `(fromVersion, kit) => Promise<void>` | no | Once per install, before any other handler, the first time a newer version handles an event for it. Migrate stored data. Must be idempotent. |
| `onMessage` | `(event: MessageEvent, kit) => Promise<void>` | no | A message in the plugin's group: from the installer, or from anyone in the group with the `"members"` permission. |
| `onDeleted` | `(event: DeletedEvent, kit) => Promise<void>` | no | A person deleted for everyone a message of theirs that the plugin marked with `kit.mark`. Since SDK 1.30.0. |
| `onReaction` | `(event: ReactionEvent, kit) => Promise<void>` | no | The installer (anyone in the group, with `"members"`) reacted to or un-reacted a message the plugin sent with a `ref`. |
| `onSchedule` | `(event: ScheduleEvent, kit) => Promise<void>` | no | A schedule fired. |
| `onAnswer` | `(event: AnswerEvent, kit) => Promise<void>` | no | Someone answered a question asked with `kit.ask`. See [Asking a question](#asking-a-question). Since SDK 1.9.0. |
| `onHook` | `(event: HookEvent, kit) => Promise<void>` | no | A request arrived at one of the install's hooks. See [Hooks](#hooks-requests-from-outside). Since SDK 1.5.0. |
| `onEntry` | `(event: EntryEvent, kit) => Promise<void>` | no | An entry was added, edited or removed in a `"vault"` plugin's group. The plugin never sees what it says. See [A vault](#a-vault-entries-nobody-else-can-read). Since SDK 1.21.0. |
| `onGroup` | `(event: GroupEvent, kit) => Promise<void>` | no | The person handed the plugin a WhatsApp group they already had, or took it back. Having it is what makes the plugin a choice for existing groups. Needs `"groups"`. Since SDK 1.17.0. |
| `onGroupInfo` | `(event: GroupInfoEvent, kit) => Promise<void>` | no | Someone gave one of the plugin's groups a new name or description. Zelfred finds out when the next message arrives there and tells the plugin before that message's `onMessage`. Zelfred's own changes never arrive. Not for `"vault"`. Since SDK 1.28.0. |
| `onParcel` | `(event: ParcelEvent, kit) => Promise<void>` | no | A parcel asked about with `kit.parcels.read` was looked up. Needs `"parcels"`. See [Parcels](#parcels). Since SDK 1.31.0. |
| `onMail` | `(event: MailEvent, kit) => Promise<MailAnswer>` | no | A mail came to the person's Zelfred mail address from a sender they accepted: `{ id, at, label, from: { address, domain, kind }, files }`; each file has `id`, `type`, `size` and, since SDK 1.34.0, an optional cleaned `name`. Answer `"took"` (its PDFs stay with the plugin, as photos do), `"not-for-me"` or `"could-not-read"`. Never the mail's text or subject. Needs `"mail"`. Since SDK 1.33.0. |
| `onSorted` | `(event: SortEvent, kit) => Promise<void>` | no | Words given to `kit.sort` were sorted: `{ ref, choice, confidence }`, `choice` null when none fitted. Needs `"sort"`. See [Sorting](#sorting). Since SDK 1.32.0. |
| `onLink` | `(event: LinkEvent, kit) => Promise<void>` | no | A link asked for with `kit.links.read` was read. Needs `"links"`. See [Links](#links). Since SDK 1.24.0. |
| `links` | `{ price?: boolean }` | no | What more to look for on the links read for this plugin. `price`: what the thing costs. Needs `"links"`. Since SDK 1.24.0. |
| `permissions` | `Permission[]` | no | What it may do beyond its own group and storage. See [Permissions](#permissions). Since SDK 1.6.0. |
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
| `shared` | `(kit, key) => Promise<SharedPage \| null>` | What the shared page for `key` shows to anyone holding its address. Read-only. Needs `"share"`. See [Shared pages](#shared-pages-a-page-anyone-can-open). Since SDK 1.24.0. |

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
interface MessageEvent  { text: string; quotedRef: Json | null; group?: string | null; sender?: Sender; links?: Link[]; photos?: Photo[]; place?: Place; mentions?: Sender[] }   // mentions: who was tagged, with "members"; since SDK 1.29.0
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

- `text` is trimmed by Zelfred; it is never empty, except for a plugin with `"photos"` or `"location"`: a photo or a position sent with no words arrives with an empty text.
- `quotedRef` is the `ref` of **your** message the person replied to, or `null`. Replies to their own messages or to messages without a ref give `null`.
- Only the installer's messages and reactions reach the plugin.
- `group` is the key of the extra group (`kit.groups.open`) the event happened in, or `null` for the main group. Making a group takes a little while and can fail and be retried, so never wait for it: keep working in the main group until events start arriving with the key.
- `GroupEvent` reaches `onGroup`. A plugin that has `onGroup` can be handed a WhatsApp group the person already had: they pick the plugin for it on the web, or in the chat with Zelfred after adding Zelfred to a group. On `"joined"`, record the group under `key` (it starts with `x-`) the way you record groups you opened yourself; `kit.send` in the handler posts in that group. From then on events there carry `group: key`. On `"left"` the person chose something else for the group: tidy your records, Zelfred has already stopped listening. `kit.groups.close(key)` on such a group only stops listening; nobody is taken out. Other people are usually in these groups already, so think about what your plugin does with their messages (see [More than one person in the group](#more-than-one-person-in-the-group)).
- `GroupInfoEvent` reaches `onGroupInfo`: `{ group, what: "name" | "description", value }`. `value` is the new name without Zelfred's "by Zelfred" ending, or the new description, and empty when it was removed. The first description Zelfred sees in a group is taken as where things stand, not as a change.
- `IntentEvent` reaches `onIntent` only after `onMessage` called `kit.unsure()`; see [Understanding unclear messages](#understanding-unclear-messages).

## Kit

| Member | Type | Meaning |
|---|---|---|
| `now` | number | The event's moment (ms). Use instead of `Date.now()`. |
| `today` | string | Today in the person's zone, `YYYY-MM-DD`. |
| `person` | `{ name: string \| null; timezone: string; currency: string \| null }` | The installer. `name` is what they set in Zelfred (may be null). `currency` is the one they count in ("INR"), or null while Zelfred doesn't know it (since SDK 1.27.0). |
| `learn({ currency })` | `Promise<void>` | Tell Zelfred something about the installer it didn't know yet, so they are asked once and not by every plugin. Kept only while Zelfred knows nothing; a later call changes nothing. Pass only what that person said themselves, never a guess or what someone else in the group said. Since SDK 1.27.0. |
| `settings` | `Record<string, Json>` | Defaults merged with the install's values. |
| `setSettings(patch)` | `Promise<void>` | Merge a patch into the install's settings. |
| `store` | `Store` | Per-install storage, below. |
| `groups.open(key, { name, hello? })` | `Promise<void>` | Ask for an extra WhatsApp group for this install (the person and Zelfred). `name` ≤ 25 chars; `hello` is posted once it exists. Does nothing if `key` is already open. Since SDK 1.6.0. |
| `groups.close(key)` | `Promise<void>` | Stop using that group. Zelfred stops listening and posting there. Since SDK 1.6.0. |
| `groups.rename(key, name)` | `Promise<void>` | Give that group a new name (1-25 chars). A group still being made gets it when it is made. Does nothing for a group that isn't open or that the person handed over. Since SDK 1.22.0. |
| `send(text, { ref?, group?, photo? })` | void | Post in the plugin's group after the handler finishes. With `group`, post in that extra group instead (the main group until it exists). While handling an event from an extra group, that group is the default. ≤ 4000 chars. WhatsApp formatting (`*bold*`, `_italic_`) works. Attach `ref` to recognise reactions and replies. |
| `react(emoji)` | void | React to the message being handled; the last call wins. In `onMessage` that is the person's message, in `onReaction` the plugin's own message they reacted to (acknowledge their reaction). `""` removes it. Ignored in schedules and web calls. Since SDK 1.3.0. |
| `unsure(fallback)` | void | `onMessage` only: you couldn't read the message. With `understand`, Zelfred works out the intent and calls `onIntent`; otherwise, or if it isn't sure, it posts `fallback`. Since SDK 1.4.0. |
| `id()` | string | A short random id for new records. |
| `hooks.url(key)` | `Promise<string>` | The web address of this install's hook `key` (lowercase letters, digits, dashes), made on first use. Anyone who has it can POST to it; each request arrives as `onHook`. Not on page loads. Since SDK 1.5.0. |
| `hooks.remove(key)` | `Promise<void>` | Close a hook. Its address stops working. Since SDK 1.5.0. |
| `files.remove(id)` | `Promise<void>` | Delete a file that arrived through a hook, or a photo. Since SDK 1.5.0. |
| `files.get(id)` | `Promise<{ id, type, size } \| null>` | One of this install's files, or null. Since SDK 1.25.0. |
| `share.url(key)` | `Promise<string>` | The address of this install's shared page `key`, made on first use. Anyone who has it can open the page. Not on page loads. Since SDK 1.24.0. |
| `share.find(key)` | `Promise<string \| null>` | The address for `key` if one was made. Works on page loads. Since SDK 1.24.0. |
| `share.remove(key)` | `Promise<void>` | Stop sharing. The address stops working for good; `url(key)` afterwards makes a new one. Since SDK 1.24.0. |
| `links.read(url, ref)` | `Promise<void>` | Ask Zelfred to read a link that didn't come in a message. `onLink` is called with what it found and `ref`. Since SDK 1.24.0. |
| `parcels.read(what, ref)` | `Promise<void>` | Ask Zelfred where a parcel is. `what` is a tracking link or number. `onParcel` is called with the answer and `ref`. Since SDK 1.31.0. |
| `sort(text, choices, ref, { after })` | `Promise<void>` | Put a few words in one of your own groups, `after` seconds later (0 to 600). `onSorted` is called with the choice and `ref`. Since SDK 1.32.0. |
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
| `"share"` | Make pages anyone with the link can open, signed in or not: `kit.share`, `web.shared`. Zelfred draws the page, limits how often it is opened and can take it down. Can't be combined with `"vault"`. See [Shared pages](#shared-pages-a-page-anyone-can-open). | Built (SDK 1.24.0), unlisted plugins only for now |
| `"photos"` | Get the photos people send in its groups, as ids (`event.photos`), and send one back (`kit.send` with `photo`). Zelfred keeps the files. See [Photos](#photos). | Built (SDK 1.25.0) |
| `"location"` | Get a position shared in its groups: `event.place`. See [A position](#a-position). | Built (SDK 1.25.0) |
| `"parcels"` | Have Zelfred ask a carrier where a parcel is: `kit.parcels.read`, `onParcel`. See [Parcels](#parcels). | Built (SDK 1.31.0): FedEx and UPS |
| `"sort"` | Have Zelfred put a few words in one of the plugin's groups: `kit.sort`, `onSorted`. See [Sorting](#sorting). | Built (SDK 1.32.0) |
| `"mail"` | Be told of mail to the person's Zelfred mail address from senders they accepted, with its PDFs as file ids: `onMail`. Every such plugin answers for every mail. Not with `"vault"`; health apps never get it. | Built (SDK 1.33.0) |
| `"vault"` | Nothing: it takes reading away. What is written in the plugin's group is locked on arrival with a key only the person's browser holds. The plugin gets `onEntry` and never a message. See [A vault](#a-vault-entries-nobody-else-can-read). | Built (SDK 1.21.0), unlisted plugins only until the locking is reviewed |

Ask for the fewest that the feature needs. For a listed plugin, adding a permission is a MAJOR bump: people agreed to the old list. An unlisted plugin can add one in a MINOR.

## Photos

A plugin never holds a picture. With the `"photos"` permission Zelfred keeps each photo sent in the plugin's groups and hands over an id. Since SDK 1.25.0.

```ts
async onMessage(event, kit) {
  for (const p of event.photos ?? []) {
    // p.id, p.type ("image/jpeg"), p.size (bytes). event.text is the caption, or "".
    await kit.store.put("things", kit.id(), { photo: p.id, what: event.text || null }, kit.now);
  }
}
// Later: send it back, with the text as its caption.
kit.send("Blue file, top shelf.", { photo: thing.photo, ref });
```

- **One photo per message.** WhatsApp sends each photo of an album as its own message, one after another, and only one of them carries the caption. Decide what a caption means for the others.
- **A photo with no words** arrives with `event.text === ""`. Without `"photos"` it never reaches the plugin at all.
- **Only pictures:** JPEG, PNG and WebP up to 8 MB. Videos, voice notes and documents are not passed on.
- **Sending one back:** `kit.send(text, { photo: id })`. The caption is up to 1000 characters and may be empty. Only the install's own photos can be sent, and only into its own groups.
- **On the page:** Zelfred shows a photo by its id to the signed-in person, and lets the page add one. The page hands the new id to one of the plugin's actions; check it with `await kit.files.get(id)` (null when it isn't this install's) before storing it.
- **Deleting:** `kit.files.remove(id)`. A plugin that removes a record removes its photo. A photo the plugin turns away (it is full) must be removed too, or it stays behind.
- **Limits:** 2000 photos per install. Past that Zelfred turns a new one away and says so; the plugin isn't called.
- **Links are not read** for a message that carries a photo, even with `"links"`.
- Can't be combined with `"vault"`.

Test with `t.message(plugin, "caption", null, null, undefined, undefined, { photos: [photo("p1")] })`, `t.sent[n].photo` and `t.addFile(id)`.

## A position

With the `"location"` permission, a position a person shares in the plugin's groups (WhatsApp's "Location") arrives as `event.place`: `{ lat, lng, name, address }`. `name` and `address` are set when they picked a named place. A comment sent with it is `event.text`; with none, the text is empty. A live location arrives once, with where the person was when they started sharing. Since SDK 1.25.0.

Test with `t.message(plugin, "", null, null, undefined, undefined, { place: { lat, lng, name: null, address: null } })`.

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

**Prices.** A plugin about things to buy sets `links: { price: true }`. Each link then also carries `price` (in the currency's ordinary unit: `24990`, `19.99`) and `currency` (`"INR"`), or null when the page names none. A page that shows no price to a link preview is read a second time the way a shopper's browser would. A shop can show a different price to a different visitor, and some shops turn Zelfred away, so treat the price as a first guess the person can correct. Since SDK 1.24.0.

**A link that didn't come in a message.** A link typed on the plugin's page reaches a `web.actions` handler, which can't wait for a page to be read. Store what you have, call `await kit.links.read(url, ref)`, and fill in the rest in `onLink(event, kit)`, which gets `event.link` and your `ref` a moment later. Since SDK 1.24.0.

```ts
actions: {
  async add(kit, { url }) {
    const id = kit.id();
    await kit.store.put("items", id, { url, reading: true });
    await kit.links.read(String(url), { item: id });
  },
},
async onLink(event, kit) {
  const { item } = event.ref as { item: string };
  await kit.store.put("items", item, { url: event.link.url, title: event.link.title, price: event.link.price ?? null });
},
```

## Parcels

A plugin can't reach a carrier. With the `"parcels"` permission Zelfred asks for it, with its own account at the carrier. Since SDK 1.31.0.

```ts
permissions: ["parcels"],
async onMessage(event, kit) {
  const id = kit.id();
  await kit.store.put("parcels", id, { what: event.text, asked: kit.now });
  await kit.parcels.read(event.text, { parcel: id });   // a link or a bare number, as it was sent
},
async onParcel(event, kit) {
  const { parcel, ref } = event;
  // parcel.found, parcel.reason, parcel.carrier, parcel.carrierName, parcel.number,
  // parcel.stage, parcel.status, parcel.place, parcel.at, parcel.due
},
```

- **Hand over what the person sent.** Zelfred works out the carrier and the number from a tracking link or a bare number. Don't parse carriers in the plugin: which ones Zelfred can ask changes without a plugin release.
- **Every call is answered**, a moment later, in `onParcel`. `found: false` comes with a `reason`: `"unsupported"` (Zelfred has no way to track this; say so and don't ask again), `"unknown"` (the carrier doesn't know the number) or `"unavailable"` (the carrier couldn't be asked just now; ask again later and don't tell the person it can't be tracked).
- `carrier` and `number` are set whenever Zelfred could read them, also when `found` is false. Key on the two together to spot a repeat.
- `stage` is Zelfred's reading of where the parcel is: `"label"`, `"transit"`, `"out"`, `"delivered"`, `"problem"`, or null. `status` is the carrier's own latest line and `place` where it happened; show those to the person.
- `at` is when that happened (ms), `due` the day the carrier expects to deliver (`YYYY-MM-DD`). Either can be null.
- **To keep watching**, ask again from an `"hourly"` schedule and compare with what you stored. Stop when `stage` is `"delivered"`. At most 30 calls while handling one event, so cap how many parcels an install watches.
- Carriers today: FedEx and UPS. Anything else comes back `"unsupported"`.

Test with `t.parcelReads` and `await t.parcel(plugin, what, parcel({ status: "Out for delivery", stage: "out" }))`.

## Sorting

A plugin can't call a model. With the `"sort"` permission it hands Zelfred a few words and its own groups, and hears back which group fits. Since SDK 1.32.0.

```ts
await kit.sort("dinner at the shack", { "🍔": "lunch, chai, dinner", "🚕": "cab, auto, fuel" }, { id }, { after: 30 });

async onSorted(event, kit) {
  if (event.choice === null) return;          // none fitted, or the model is off
  // check nobody put it somewhere themselves in the meantime, then act
}
```

- Zelfred takes every number out of `text` and the choices before they go to the model. The model is run outside Zelfred (jev, by TypeSafe), so send only what the person wrote about the thing itself: never a phone number, an address or anything from a locked app.
- `after` lets people do it themselves first. The answer can arrive after they did, so check before acting.
- Every call is answered once. Below Zelfred's confidence threshold the choice is null.
- At most 30 calls while handling one event. Not on page loads.

Test with `t.sorts` and `await t.sorted(plugin, text, "🍔")`.

## Shared pages: a page anyone can open

Everything a plugin shows is behind the person's sign in, except this. With the `"share"` permission a plugin can open a page to anyone holding its address: a wishlist to send to family. Since SDK 1.24.0.

```ts
permissions: ["share"],
web: {
  async load(kit) { … },
  async shared(kit, key) {
    const list = await kit.store.get<List>("lists", key);
    if (!list) return null;                       // "this page is gone"
    return { title: list.name, intro: "3 things wanted.", sections: [{ items: [{ title: "Desk lamp", url: "https://…", image: "https://…", detail: "example.com", value: "₹2,400" }] }] };
  },
},
```

- `await kit.share.url(key)` makes the address (a long random one, tied to nothing about the person) and returns it. `kit.share.remove(key)` closes it for good; asking for the url again makes a new one, so old copies of the link stay dead. `kit.share.find(key)` reads it without making one.
- `web.shared(kit, key)` says what the page shows. It runs read-only on every visit, so the page is always current. Return `null` when the thing is gone.
- The plugin gives words, addresses and numbers (`SharedPage`: a title, an intro, sections of items, a summary). Zelfred draws the page. No plugin can put its own code or markup on it.
- **Never say whose it is.** No name, no number, no id of a person. Leave the person's own notes out unless they chose to show them.
- What Zelfred does around it: outbound links are checked and marked as untrusted, the page is kept out of search engines, each address can only be opened so often, anyone can report a page and Zelfred can take one down. The person opening it is a stranger to Zelfred and is never written to.
- In the test kit: `t.shares` lists the open keys and `await t.shared(plugin, key)` returns what the page would show.

## Remembering the person's message

`kit.send(text, { ref })` lets you recognise reactions and replies to your own message. `kit.mark(ref)` does the same for the person's message you are handling in `onMessage`: a reaction to it arrives in `onReaction` with that ref, and a reply to it carries it as `quotedRef`. Use it when their message is the record itself (the link they saved). Since SDK 1.10.0.

`kit.reactTo(ref, emoji)` puts a reaction on the person's messages you marked with that ref, from anywhere: a call from the page, a schedule, another message. Use it to show in WhatsApp what changed elsewhere (a ✅ on a thing ticked on the page). The ref must equal the one given to `kit.mark`; `""` takes the reaction off; nothing happens when no message carries the ref. Since SDK 1.26.0.

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

**A tick list** (`multiple: true`): one poll where each person ticks everything that applies, like the habits they did today. 2 to 12 options. It always works like `keep`. `onAnswer` gets `event.choices` (everything that person has ticked now, in the options' order), `event.added` and `event.removed` (what this change did); `event.choice` is the first ticked option, or -1 when nothing is. Here taking a tick away is an answer, and so is taking them all away (`choices` is empty). Since SDK 1.23.0.

```ts
kit.ask("Tick what you did today", ["Meditate", "Read", "Gym"], { multiple: true, ref: { day: kit.today } });
// onAnswer: for (const i of event.added ?? []) ...; for (const i of event.removed ?? []) ...
```

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
