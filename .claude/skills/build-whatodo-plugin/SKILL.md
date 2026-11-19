---
name: build-whatodo-plugin
description: Build, change, release or review a Zelfred plugin in this repo. Use when creating a new plugin, changing or releasing an existing one (version bump, changelog, data migration), or reviewing a plugin pull request.
---

# Build a Zelfred plugin

A plugin lives in its own WhatsApp group with one person and the Zelfred number. It reacts to events (message, reaction, schedule, web call, install, upgrade) and acts only through the kit. People keep data in plugins and will pay for them, so every change is a **release**: versioned, changelogged, tested, data-compatible, reviewed.

Pick the branch, then run its steps in order. Each step ends on its completion criterion; don't start the next step until it holds.

## Branch A: new plugin

1. **Conversation.** Write the plugin's README draft first: Commands (every message and its acknowledgement), what the plugin posts and when, Data (collection, key, shape, sort), Settings, Web page if any, Privacy. Acknowledge changes with reactions (👍 saved, ✅ done only); messages are for answers. Guide: `docs/building-a-plugin.md` steps 0-1.
   *Done when every command has a defined acknowledgement and every stored thing has a row in the Data table.*
2. **Scaffold.** `pnpm new <id> "<Name>" "<emoji>"`, then `pnpm check`.
   *Done when the untouched scaffold passes.*
3. **Handlers.** Implement against `docs/sdk-reference.md`. Handlers are **deterministic**: time from `kit.now`/`kit.today`/`kit.time`, ids from `kit.id()`, later work via schedules, imports only from the SDK and the plugin folder. Attach small refs to posts that expect reactions or replies; validate refs before use. End `onMessage` with `kit.unsure(fallback)`, never your own "didn't get that"; declare `understand` intents + `onIntent` so Zelfred's intent model can route unclear messages (sdk-reference "Understanding unclear messages").
   *Done when every command, schedule, reaction and web action in the README has code.*
4. **Tests.** Cover everything in `docs/testing.md` "What to cover", using `createTestKit`.
   *Done when `pnpm check` passes and every README command row has a test.*
5. **Docs.** README matches code exactly; CHANGELOG `## [1.0.0] - YYYY-MM-DD` with `### Added` and `### Data`; plugin added to the repo README table.
   *Done when the conformance suite passes on README and CHANGELOG.*
6. **Hand-off.** Run Branch C on your own change, then open the PR with the template filled in.

## Branch B: change a released plugin

1. Read `docs/releasing.md`. Classify the change: PATCH (fix), MINOR (addition, old behaviour intact), MAJOR (anything existing people rely on changes; needs maintainer approval).
   *Done when the bump is chosen and justified in one sentence.*
2. Make the change. If stored data, refs or settings change shape, write an idempotent `onUpgrade` that handles every earlier released version.
3. Tests for the change, plus an upgrade test from each earlier version whose data differs.
4. Bump `version`; add the CHANGELOG entry at the top (with `### Data` when anything stored changed); update the README.
5. `pnpm check` and `pnpm release:check`.
   *Done when both pass.*
6. Run Branch C, then open the PR.

## Branch C: review

Apply every item of `docs/review-checklist.md` to the diff, Automated and human sections alike, and `docs/data-and-privacy.md` to anything stored or read.
*Done when each checklist item is marked holds / fails with the evidence (file and line, or the test that shows it). Any fail blocks the merge.*

## Rules that never bend

- Fix the plugin; leave `src/conformance.test.ts` and `scripts/check-release.mjs` as they are.
- A released plugin's `id` stays, its data from every earlier version keeps working, and the plugin is never deleted.
- `price` stays 0 until `docs/earning.md` says paid plugins are live.
