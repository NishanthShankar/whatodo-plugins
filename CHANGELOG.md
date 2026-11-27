# Changelog: SDK

Changes to the plugin SDK (`src/sdk.ts`) and the test kit (`src/testing.ts`). Each plugin has its own CHANGELOG in its folder. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions: [Semantic Versioning](https://semver.org/). The package version and `SDK_VERSION` are the same number.

## [1.40.0] - 2026-11-27

### Added

- `FileReadEvent.read` may be `{ state: "limit" }`: the file was not read because the person's readings for the day are used up, so an app can say so and keep what it had, instead of treating it as a failed reading.

## [1.39.0] - 2026-11-27

### Added

- `MailEvent.sent`: when the mail was sent (for a forward from the person's own mailbox, when the original came), so an app can order mail as a mailbox would. Written by the sender, never trusted.

## [1.38.0] - 2026-11-27

### Added

- `MailRead.site`: the company a PDF seems to be from, the one web domain that clearly wins in its own text, mail services left out. A name only, never proof. Lets "Read again" name bills forwarded before `MailEvent.forwarded` existed.

## [1.37.0] - 2026-11-27

### Added

- `MailRead.kind` ("bill", "not-bill", "unsure") and `MailRead.sort` (ticket, statement, insurance, papers, quote, proforma, pay, other): whether a mailed PDF is a bill at all, from words Zelfred found and its file's name. "not-bill" only when the signs are clear; treat "unsure" as a bill.
- `MailEvent.forwarded: { domain }`: for a forward from the person's own mailbox, the domain of the original sender in its forwarded header block. A domain only; not checked, so for naming and sorting, never trust.

## [1.36.0] - 2026-11-27

### Added

- `kit.files.read(id, ref)` and `onFileRead({ fileId, ref, read })`: read one of the install's PDFs again with Zelfred's bill reader, for a page button such as "Read again"; `read` is a `MailRead`. At most 20 a day for a person. Needs "mail". Test kit: `t.fileRead(plugin, id, read)` and `t.fileReads`.
- `MailEvent.messageId`: the mail's own Message-ID, cleaned and capped at 200 characters, to link back to it in the person's Gmail (`#search/rfc822msgid:`, URL-encoded). Works only in Gmail and only in the mailbox it came through. Never shown as text, sent, logged or counted.

## [1.35.0] - 2026-11-27

### Added

- `MailFile.read` (`MailRead`): what Zelfred read inside a mailed PDF, with its own code in a closed place that keeps nothing: `state` (read, locked, picture, failed) and, when read, `amount`, `currency`, `date`, `due`, `number`, `gstins` (at most 4) and `seller`. Missing when not read in time. Every fact is "the bill says": show it as editable, never as true in Zelfred's voice; a due date never becomes a reminder without the person's yes for that sender.

## [1.34.0] - 2026-11-27

### Added

- `MailEvent.lines`: how many WhatsApp lines the plugin may still send for this mail (0 past the day's cap, for old mail, or at quiet hours). Read it before starting something that waits for an answer; Zelfred drops anything past it.
- `mailSummary: { one, many }` on a plugin with "mail": the one line Zelfred posts in its group at 8pm when its lines caused by mail were held back past the owner's cap (2 a day across all apps). Without it Zelfred uses plain words of its own.
- `MailFile.name`: the attachment's name as its sender wrote it, made safe to show (no control or direction-changing characters, no slashes, at most 100 characters). Optional: missing when the mail gave none. Sender-written text, to show and never to trust.

## [1.33.0] - 2026-11-27

### Added

- New permission `"mail"` with `onMail(event, kit)`: a plugin is told of each mail that comes to the person's Zelfred mail address (name@zelfred.com) from a sender they accepted, with the sender (address, domain, company or the person's own mailbox), the person's label and the mail's PDFs as file ids. It answers `"took"`, `"not-for-me"` or `"could-not-read"`. The mail's text and subject are not passed on. Not with `"vault"`; Zelfred never gives it to health apps.
- Testing: `t.mail(plugin, mail({ ... }))`.

## [1.32.0] - 2026-11-26

### Added
- Permission `"sort"`: `kit.sort(text, choices, ref, { after })` puts a few words in one of the plugin's own groups, `after` seconds later (0 to 600). The answer arrives in `onSorted(event, kit)` as `{ ref, choice, confidence }`; `choice` is null when none fitted, the model is off or it failed. Zelfred takes numbers out before the words go to its sorting model (jev).
- Test kit: `t.sorts` and `t.sorted(plugin, text, choice, confidence?)`.
- TripExpenses 1.10.0 (`expense-tracker`) is the first to use it.

## [1.31.0] - 2026-11-25

### Added
- Permission `"parcels"`: Zelfred asks a carrier where a parcel is. `kit.parcels.read(what, ref)` takes a tracking link or number as the person sent it; the answer arrives in `onParcel(event, kit)` as `event.parcel` (`Parcel`: carrier, number, stage, the carrier's own status line, place, time, expected day) with the `ref`. Every call is answered: a parcel that can't be tracked comes back with `found: false` and a `reason` (`"unsupported"`, `"unknown"`, `"unavailable"`). FedEx and UPS to begin with; which carriers are asked is Zelfred's to change, with no plugin release.
- Test kit: `t.parcelReads`, `t.parcel(plugin, what, found)` and the `parcel()` builder.

## [1.30.0] - 2026-11-25

### Added
- `onDeleted(event, kit)` with `DeletedEvent` (`{ ref, group, sender }`): a person deleted for everyone a message of theirs that the plugin marked with `kit.mark`.
- Test kit: `t.deleted(plugin, ref, group?, from?)`.
- TripExpenses 1.9.0 (`expense-tracker`) is the first to use it.

## [1.29.0] - 2026-11-25

### Added
- `event.mentions` on a message (`Sender[]`): the people tagged in it with an @, Zelfred itself left out, each with the id they have as a sender. Their tags are taken out of `event.text`, so a message that only tags people arrives with an empty text. Only with the "members" permission.
- Test kit: `mentions` in the last argument of `t.message`.
- TripExpenses 1.5.0 (`expense-tracker`) is the first to use it.

## [1.28.0] - 2026-11-24

### Added
- `onGroupInfo(event, kit)` with `GroupInfoEvent` (`{ group, what: "name" | "description", value }`): someone gave one of the plugin's groups a new name or description. Zelfred looks when a message arrives in a group of a plugin that has the handler, and tells the plugin before that message. Its own changes never arrive. Not for `"vault"` plugins.
- Test kit: `t.groupInfo(plugin, what, value, group?)`.
- TripExpenses 1.1.0 (`expense-tracker`) is the first to use it.

## [1.27.0] - 2026-11-23

### Added
- `kit.person.currency`: the currency the person counts in, as a three letter code, or null while Zelfred doesn't know it.
- `kit.learn({ currency })`: a plugin that finds out tells Zelfred, so the person is asked once and not by every plugin. Zelfred keeps it only while it knows nothing; a later call changes nothing.
- Test kit: `person.currency` in the options, and `t.kit.person.currency` to read what was learnt.
- Plugin Simple Expense Tracker 1.0.0 (`expense-tracker`), the first to use it.

## [1.26.0] - 2026-11-23

### Added
- `kit.reactTo(ref, emoji)`: react to the person's own messages marked with that ref (`kit.mark`), from a page call, a schedule or another message. For showing in WhatsApp what changed elsewhere.
- Test kit: `t.reactTos`.
- Wishlist 1.3.0 is the first to use it.

## [1.25.0] - 2026-11-22

### Added
- Permission `"photos"`: the photos people send in the plugin's groups. Zelfred keeps each file and hands the plugin its id, type and size in `event.photos`; a photo with no words arrives with an empty `event.text`, and a caption is the text. `kit.send(text, { photo: id })` sends one back with the text as its caption. `kit.files.get(id)` says whether an id is one of the install's files, for an id that came from the page. Videos, voice notes and other files are not passed on.
- Permission `"location"`: a position shared in the plugin's groups, as `event.place` (`{ lat, lng, name, address }`).
- `definePlugin` refuses `"photos"` or `"location"` together with `"vault"`.
- Test kit: `photo(id)`, a seventh argument to `t.message` (`{ photos, place }`), `t.addFile(id)` for a picture added on the page, and `photo` on each entry of `t.sent`.
- Plugin SafeButWhere 1.0.0 (unlisted), the first to use both.

### Note
- The type changes for this version reached `main` a commit early, inside the 1.24.0 commit. Nothing used them until now.

## [1.24.0] - 2026-11-22

### Added
- Permission `"share"`: pages anyone with the link can open without signing in. `kit.share.url(key)` makes the address, `kit.share.find(key)` reads it, `kit.share.remove(key)` closes it for good. `web.shared(kit, key)` returns what the page shows as a `SharedPage` (a title, an intro, sections of items, a summary); Zelfred draws it. `definePlugin` refuses `"share"` together with `"vault"`, and either half of sharing without the other.
- `links: { price: true }` on a plugin: each link Zelfred reads for it also carries `price` and `currency` (null when the page names none).
- `kit.links.read(url, ref)` and `onLink(event, kit)`: have a link read that didn't arrive in a message (one typed on the plugin's page), and get what was found a moment later with the same `ref`.
- Test kit: `t.shares`, `t.shared(plugin, key)`, `t.reads`, `t.link(plugin, link)`.
- Plugin Wishlist 1.0.0 (unlisted), the first to use all three.

## [1.23.0] - 2026-11-21

### Added
- `kit.ask(question, options, { multiple: true })`: a tick list. One poll where each person ticks every option that applies (2 to 12 options). It works like `keep`: the poll stays, no confirm line is posted, and every change counts while the question is open. `onAnswer` gets `choices` (everything that person has ticked now), `added` and `removed` (what this change did); `choice` is the first ticked option, or -1 when nothing is. Taking every tick away arrives too.
- Test kit: `t.answer(plugin, ref, [0, 2])` answers a tick list with what is ticked now. `t.asked[n].multiple`.

## [1.22.0] - 2026-11-20

### Added
- `kit.groups.rename(key, name)`: give one of the install's extra groups a new name (1-25 characters). A group still being made gets the new name when it is made. It does nothing for a group that isn't open, or for one the person already had and handed over. The test kit's `groups` map shows the new name.

## [1.21.0] - 2026-11-20

### Added
- Permission `"vault"`: nobody but the person can read what is written in the plugin's group. Every message there is locked on arrival with a key only the person's browser holds, and the plugin is told through the new `onEntry(event, kit)` that an entry was added, edited or removed: its id, kind and time, never its words. The plugin's `welcome` is pinned in the group, because "help" can't be asked for there.
- `definePlugin` refuses a vault plugin that has `onMessage`, `understand`, `onGroup`, or the `"links"` or `"members"` permission, and refuses `onEntry` without `"vault"`.
- Test kit: `t.entry(plugin, { id, change?, kind?, at?, source? })`. `t.message` throws for a vault plugin.

### Changed
- Test kit: `kit.time.day(ms)` works out the day of the instant it is given. It used to answer the kit's own day whatever it was asked; for the kit's own `now` it still does.

## [1.20.1] - 2026-11-19

### Changed
- The product has a new name, Zelfred. Comments and docs use it. Nothing in the SDK behaves differently.

## [1.20.0] - 2026-11-19

### Added
- Keys and callback addresses can be limited to some of an install's groups. An endpoint's `run(kit, params, scope)` gets `scope.groups` (the keys of the groups the calling key may see, null for the main one; `null` for no limit) and must keep to it. `kit.emit(event, data, { group })` says which group, or groups, an event happened in, so telcurio only calls the addresses that asked for that group.
- Test kit: `t.api(plugin, name, params, { groups })`, and `t.emitted[n].group`.

## [1.19.0] - 2026-11-19

### Added
- Permission `"api"`, and `api` on a plugin: read endpoints (`api.get`) the person's own other systems can call with a key they make on the plugin's page, and events (`api.events`) telcurio calls their address for. telcurio checks keys, limits calls and signs callbacks; the plugin only says what to return.
- `kit.emit(event, data)`: something happened that the person's systems may want to hear about. The event must be listed in `api.events`.
- Test kit: `t.api(plugin, name, params?)` calls an endpoint, and `t.emitted` lists what was emitted.

## [1.18.0] - 2026-11-19

### Added
- `msg([...])` and `fixed("...")` (src/copy.ts): a plugin writes each message as a list of wordings in its own `copy.ts` and one is picked each time it is sent; `fixed` is for text that code compares against and must have one wording. `useRandom(fn)` replaces the random source in tests. Every plugin in this repo now keeps its text this way.

## [1.17.0] - 2026-11-18

### Added
- `onGroup(event, kit)`: a plugin that has it can be handed a WhatsApp group the person already had. `event.kind` is `"joined"` or `"left"`, `event.key` is telcurio's key for the group (it starts with `x-`) and `event.name` its WhatsApp name. After `"joined"` the group works like one made with `kit.groups.open`, except that `kit.groups.close` only stops listening there. Needs `"groups"`; `definePlugin` refuses it otherwise.
- Test kit: `t.group(plugin, kind, key, name)`.

## [1.16.0] - 2026-11-18

### Added
- `kit.ask(..., { intro, mention })`: `intro` is a message posted just before the poll, for what a poll's question can't carry (more than 255 characters, bold, a mention). With `mention` (a `sender.id`), `{{mention}}` in the intro tags that person. A mention needs `"members"`.
- Test kit: `t.asked[n].intro` and `.mention`.

## [1.15.0] - 2026-11-18

### Added
- `kit.person.id`: the owner's id, the same one their events carry as `sender.id`. A plugin that keeps records per person can now find the owner's own outside an event, on a page load or in a schedule. Test kit: `"owner"`.

## [1.14.0] - 2026-11-18

### Added
- `web.loadFor(kit, sender, args)`: data for the page of someone else in the plugin's groups, a friend who takes part and has their own telcurio login. Return only what that person may see. Needs `"members"`; `definePlugin` refuses it otherwise.
- Test kit: `t.loadFor(plugin, from, args?)`.

## [1.13.1] - 2026-11-18

### Fixed
- Test kit: a question in a plugin with `"members"` is only treated as shared once someone other than the owner has written or answered in that group, as telcurio does. Before, every question of such a plugin stayed open and posted no confirm line, even with the owner alone in the group.

## [1.13.0] - 2026-11-18

### Added
- `Sender.profile`: whether the person has a telcurio profile of their own. True for the owner; usually false for someone a friend brought into a group.
- `kit.signUp(senderId)`: records that a person agreed to have their own profile. Ask them first with `kit.ask`. From then on their events carry `sender.profile: true`. Needs `"members"`.
- Test kit: `t.signedUp`, and `profile` on the senders it makes (true for the owner, false for a named member until they are signed up).

## [1.12.1] - 2026-11-18

### Changed
- telcurio no longer puts a 🕐 on a message while it reads its links. Reading is quick enough that the plugin's own reaction is the answer. No type or call changes.

## [1.12.0] - 2026-11-18

### Added
- `IntentEvent.group`: the key of the extra group an unclear message was sent in. While `onIntent` handles it, `kit.send` answers in that group, as it does in `onMessage`. Before this, an intent from an extra group was answered in the main group.
- Test kit: a `group` argument on `t.intent` (the seventh).

## [1.11.0] - 2026-11-18

### Added
- `kit.ask(..., { keep: true })`: a question whose poll stays after it is answered. No confirm line is posted, the person can change their answer as often as they like while it is open, and each change arrives as `onAnswer` with `changed: true`. It closes with `kit.close(ref)` or when the same ref is asked again; the poll is left in the chat and a later change on it is refused. For answers people correct, like a daily check-in.
- telcurio now sends a poll as a real poll to a chat that hasn't written in 24 hours, when the person who added the plugin has saved telcurio's number. Everyone else still gets the numbered list. Nothing changes in the SDK for this.
- Test kit: `keep` on each entry of `t.asked`; `t.answer` leaves a kept question open and posts no confirm line.

## [1.10.0] - 2026-11-18

### Added
- Permission `"links"`: telcurio reads the public details of the links people send and hands them to the plugin. A plugin still can't reach the internet itself.
- `MessageEvent.links`: for a plugin with `"links"`, a message with a link arrives with `links: Link[]` (at most 3, in order). `Link = { url, canonical, site, kind, found, title, description, author, image, seconds }`. `canonical` is the same however a link was shared; `found` is false when the page couldn't be read. YouTube and Instagram are read in full (title, caption, channel or account, picture, length); other sites give what their page says about itself.
- While telcurio reads the links it shows a 🕐 on the person's message. The plugin's own reaction replaces it; with none, telcurio takes the clock off.
- `kit.mark(ref)`: remember the person's message being handled, the way `ref` on `kit.send` remembers one of the plugin's. A reaction to it arrives in `onReaction` and a reply to it carries `quotedRef`, with that ref.
- Test kit: `link(url, found?)` builds a `Link`, `t.message` takes `links` as its sixth argument (refused without `"links"`), and `t.marks` lists the refs given to `kit.mark`.

## [1.9.0] - 2026-11-18

### Added
- Questions: `kit.ask(question, options, { ref?, group?, confirm? })` asks for a choice between 2 to 100 options. Use it for every structured answer, a yes or no included. telcurio sends a WhatsApp poll (the question with a numbered list when a poll can't be sent), and a typed answer (the option's number or text) counts too. Each answer arrives as `onAnswer(event, kit)` with `AnswerEvent = { ref, choice, option, changed?, group, sender }`.
- One person and telcurio in the group: the first answer settles the question. The poll is deleted so it can't be changed, and `confirm` (default `"{{question}}: {{option}}"`, `false` for none) is posted as the record.
- Several people in the group (`"members"`): the poll stays and everyone's first answer counts. A person may change theirs once, ever; telcurio tells them, and after that refuses. The question stays open until `kit.close(ref)`.
- `kit.close(ref)`: settles a question. Its polls are deleted and no more answers are taken. Also for when a message that wasn't one of the options answered it.
- More than 12 options go out as several polls, at most three at a time, with "See more" as the last option when there are more.
- `checkAsk(question, options)`: the limits of a question, exported so telcurio and the test kit apply the same ones.
- Test kit: `t.asked` (questions asked, with `open`) and `t.answer(plugin, ref, choice, from?)`, which settles, confirms and marks changes as telcurio does.

## [1.8.0] - 2026-11-18

### Added
- Permission `"members"`: the plugin hears everyone in its groups, not only the person who added it. Without it nothing changes: messages and reactions from other people in the group never reach the plugin. `definePlugin` refuses `"members"` together with `"lock-members"`.
- `sender` on `MessageEvent`, `ReactionEvent` and `IntentEvent`: `Sender = { id, name, owner }`. `id` is the same for a person on every event and is not a phone number; `name` is their WhatsApp name when known; `owner` is true for the person who added the plugin. telcurio always sets it, for every plugin.
- `kit.person` is still the person who added the plugin (their name, zone and settings), whoever sent the event.
- Test kit: a `from` argument on `t.message`, `t.react` and `t.intent`. Leave it out for the person who added the plugin, or pass a name (`"Asha"`) for another member. The kit refuses another member's event for a plugin without `"members"`.

## [1.7.1] - 2026-11-17

### Changed
- The product is now called telcurio. Comments and docs use the new name. No change to any type or behaviour. The package is still `whatodo-plugins` and addresses like app.whatodo.today stay as they are.

## [1.7.0] - 2026-11-17

### Added
- Permission `"lock-members"` (blocks adding members): the plugin's groups are made with telcurio as the only admin and set so only admins can add people. Reserved for now: the name is fixed and `definePlugin` accepts it, but telcurio doesn't enforce it yet. No plugin uses it.

## [1.6.0] - 2026-11-17

### Added
- Extra groups: `kit.groups.open(key, { name, hello? })` asks telcurio for another WhatsApp group for the install (the person and telcurio, like the main one) and `kit.groups.close(key)` stops using it. `kit.send(text, { group })` posts there; until the group exists the message goes to the main group.
- `MessageEvent.group` and `ReactionEvent.group`: the key of the extra group an event came from. While handling it, `kit.send` defaults to that group.
- Permissions: `permissions` on `PluginDef` lists what a plugin may do beyond its own group and storage: `"hooks"` (receive requests from outside), `"groups"` (make extra groups) and `"replies"` (be called back on replies; reserved, not built yet). telcurio shows them before the plugin is added and refuses what isn't listed. `definePlugin` rejects unknown names and an `onHook` without `"hooks"`.
- Test kit: `t.groups`, `group` on each entry of `t.sent`, and a `group` argument on `t.message` and `t.react`. The kit refuses `kit.hooks.url` and `kit.groups.open` for a plugin that didn't ask for the permission.

## [1.5.0] - 2026-11-17

### Added
- Hooks: a plugin can receive requests from outside telcurio (a form on a website, another service). `kit.hooks.url(key)` gives the install a web address for `key`, `kit.hooks.remove(key)` closes it, and each request arrives as `onHook(event, kit)` with `HookEvent = { key, fields, files, origin }`. telcurio answers the sender itself and caps how often and how much can be sent.
- Files: a hook request can carry files. The plugin gets `HookFile = { id, field, name, type, size }` and keeps the ids; telcurio keeps the bytes and serves them only to the person on the plugin's page. `kit.files.remove(id)` deletes one.
- `unlisted` on `PluginDef`: the plugin is left out of the store and the public site, and only people telcurio allows can add it.
- Test kit: `t.hook(plugin, key, fields?, files?, origin?)`, `t.hooks` (open hook keys) and `t.removedFiles`.

## [1.4.0] - 2026-11-16

### Added
- Intent understanding: `understand` (`intents`, optional `targets(kit)`) and `onIntent(event, kit)` on `PluginDef`, and `kit.unsure(fallback)`. When `onMessage` can't read a message it calls `kit.unsure`; telcurio asks its intent model which declared intent (and target) the message means and calls `onIntent`, or posts the fallback. `definePlugin` checks intent ids and that `onIntent` exists.
- Test kit: `t.unsures`, `t.intent(plugin, text, intent, target?, confidence?)` and `t.targets(plugin)`.

## [1.3.0] - 2026-11-16

### Added
- `kit.react` works in `onReaction`: it reacts to the plugin's own message that the person reacted to, so a plugin can acknowledge a reaction. `kit.react("")` removes it.

## [1.2.1] - 2026-11-16

### Changed
- `Listing.title` is documented as the full page title, brand included ("... | telcurio").
- The conformance suite now requires `listing` on every plugin in this repo, with a title that names WhatsApp.

## [1.2.0] - 2026-11-16

### Added
- `listing` on `PluginDef` (`Listing = { title, description, h1 }`): the plugin's public page text on whatodo.today, written for search. Title at most 60 characters, description at most 155, heading at most 80; `definePlugin` checks them. Optional in SDK 1.x; the conformance suite requires it for plugins in this repo once every plugin has one.

## [1.1.0] - 2026-11-16

### Added
- `tier` on `PluginDef` (`Tier = 1 | 2 | 3`): how much a plugin costs the platform to run (1 no or low cost, 2 medium, 3 high). Optional in SDK 1.x; `definePlugin` rejects other values. The conformance suite requires it for plugins in this repo.

## [1.0.0] - 2026-11-16

### Added
- `definePlugin` with required `id`, `version`, `sdk`, marketplace fields, `welcome`, `help`, `price`.
- Events: `onInstall`, `onUpgrade`, `onMessage`, `onReaction`, `onSchedule`; web `load` and `actions`; `lockable` pages.
- Kit: `now`, `today`, `person`, `settings`/`setSettings`, `store` (get, put, delete, list by prefix or sort range), `send` with refs, `react`, `id`, `time` helpers.
- Schedules: daily at a fixed hour, at an hour held in a setting, or hourly.
- `whatodo-plugins/testing`: `createTestKit` for plugin tests.
- `compareVersions`, `SDK_VERSION`.
