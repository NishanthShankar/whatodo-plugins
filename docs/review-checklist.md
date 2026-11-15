# Review checklist

What a maintainer checks before merging a plugin change, and what an author checks before opening the pull request. CI checks the **Automated** items; a person checks the rest. A PR merges only when every item holds.

## Automated (CI)

- [ ] Typecheck passes (`pnpm typecheck`).
- [ ] All tests pass (`pnpm test`), including the conformance suite:
  - folder name equals `id`; the plugin is registered in `src/index.ts`; ids are unique
  - field lengths (name ≤ 30, tagline ≤ 80, description ≥ 40, groupName ≤ 25, one-emoji icon, welcome/help non-empty and ≤ 4000)
  - `price` is 0
  - `tier` is 1, 2 or 3
  - schedules have unique ids, valid hours, settings that exist, and an `onSchedule`
  - README has Commands, Data, Privacy (plus Schedules / Settings / Web page when used)
  - CHANGELOG's newest entry equals `version`; versions and dates go down; no empty entries
  - tests exist
  - imports only from the SDK and the plugin's own folder
  - no `fetch`, network classes, `Date.now()`, argument-less `new Date()`, `Math.random()`, `crypto`, timers, `process`, `require`, dynamic `import()`, `eval`, `new Function`, globals
- [ ] Release rules (`node scripts/check-release.mjs origin/main`): a changed plugin has a higher version and a CHANGELOG entry for it; a raised `tier` is a MAJOR; no released plugin removed; SDK changes bump the SDK version and changelog.

## Behaviour

- [ ] The README describes exactly what the code does: every command, schedule, setting, data collection and web action, and nothing that isn't there.
- [ ] Changes are acknowledged with reactions (👍 saved, ✅ done); messages are only for answers, lists, questions back and errors.
- [ ] Unknown input gets a short answer that mentions `help`.
- [ ] Scheduled posts go out only when there is something to answer, one per item, never twice for the same item and slot.
- [ ] Every message is short, plain and human. No marketing tone, no walls of text. WhatsApp formatting used sparingly.
- [ ] Errors in web actions are plain sentences the person can act on.

## Tests

- [ ] Every README command has a test, including accepted variants and the unknown-input answer.
- [ ] Schedules: due, not due, and not repeated.
- [ ] Reactions and replies: happy path, removed reaction, stale or unexpected ref.
- [ ] Web `load` and every action, including errors.
- [ ] `onUpgrade` from every earlier released version whose data differs (from the second release on).

## Data and privacy

- [ ] Stores only what the feature needs ([data-and-privacy.md](data-and-privacy.md)); no copies of whole messages unless the feature is about keeping them.
- [ ] Every collection is listed in the README's Data table with its key, shape and sort.
- [ ] Refs are small and checked before use.
- [ ] Personal pages set `web.lockable: true`.
- [ ] Nothing tries to reach outside the kit (no workarounds, no encoded network calls, no data smuggled into messages meant for others).

## Release

- [ ] `tier` matches what the plugin costs to run ([sdk-reference.md#tiers](sdk-reference.md#tiers)); a raised tier is a MAJOR with maintainer approval (the release check enforces the MAJOR).
- [ ] The version bump matches the change ([releasing.md](releasing.md)): PATCH for fixes, MINOR for additions, MAJOR only with maintainer approval and an impact note.
- [ ] The CHANGELOG entry is written for the person using the plugin, with a `### Data` section when stored data, refs or settings changed.
- [ ] Data written by every earlier released version still works.
- [ ] Nothing deprecated is removed outside a MAJOR.

## Before money is involved

Paid plugins are not enabled yet. When they are, the checklist will add: price and what the person gets for it stated in the description, no features hidden behind surprise prompts, refund-safe behaviour on uninstall, and a support contact. See [earning.md](earning.md).
