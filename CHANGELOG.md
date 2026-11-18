# Changelog: SDK

Changes to the plugin SDK (`src/sdk.ts`) and the test kit (`src/testing.ts`). Each plugin has its own CHANGELOG in its folder. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions: [Semantic Versioning](https://semver.org/). The package version and `SDK_VERSION` are the same number.

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
