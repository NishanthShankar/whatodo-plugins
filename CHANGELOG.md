# Changelog: SDK

Changes to the plugin SDK (`src/sdk.ts`) and the test kit (`src/testing.ts`). Each plugin has its own CHANGELOG in its folder. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions: [Semantic Versioning](https://semver.org/). The package version and `SDK_VERSION` are the same number.

## [1.0.0] - 2026-11-16

### Added
- `definePlugin` with required `id`, `version`, `sdk`, marketplace fields, `welcome`, `help`, `price`.
- Events: `onInstall`, `onUpgrade`, `onMessage`, `onReaction`, `onSchedule`; web `load` and `actions`; `lockable` pages.
- Kit: `now`, `today`, `person`, `settings`/`setSettings`, `store` (get, put, delete, list by prefix or sort range), `send` with refs, `react`, `id`, `time` helpers.
- Schedules: daily at a fixed hour, at an hour held in a setting, or hourly.
- `whatodo-plugins/testing`: `createTestKit` for plugin tests.
- `compareVersions`, `SDK_VERSION`.
