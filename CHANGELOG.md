# Changelog: SDK

Changes to the plugin SDK (`src/sdk.ts`) and the test kit (`src/testing.ts`). Each plugin has its own CHANGELOG in its folder. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions: [Semantic Versioning](https://semver.org/). The package version and `SDK_VERSION` are the same number.

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
