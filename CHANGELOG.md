# Changelog: SDK

Changes to the plugin SDK (`src/sdk.ts`) and the test kit (`src/testing.ts`). Each plugin has its own CHANGELOG in its folder. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions: [Semantic Versioning](https://semver.org/). The package version and `SDK_VERSION` are the same number.

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
