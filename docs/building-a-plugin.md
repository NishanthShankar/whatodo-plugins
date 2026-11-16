# Building a plugin

The whole path from idea to a plugin people can install. Follow the steps in order; each one ends with a check that tells you it's done. The exact contract of every type is in [sdk-reference.md](sdk-reference.md); this guide is the how and why.

## 0. Understand where your plugin lives

Every installed plugin gets **its own WhatsApp group** with exactly two members: the person who installed it and the whatodo number. The group's name is your `groupName` ("🌱 Habits"). Everything happens there:

- The person types in the group; your `onMessage` gets the text. No @mention needed, it's their chat with your plugin.
- Your plugin posts in the group with `kit.send`, and reacts to the person's message with `kit.react`.
- The person reacts to your messages (✅ on a check-in); your `onReaction` gets the emoji and the `ref` you attached when you sent it.
- The person replies to one of your messages (swipe to reply); your `onMessage` gets `quotedRef`, the `ref` of the message they replied to.
- Your schedules fire at hours in the person's own time zone; `onSchedule` posts whatever is due.
- Optionally, a web page on whatodo.today shows your plugin's data and lets the person change it through your `web.actions`.

Your plugin never sees anything outside that group and its own stored data. Design for that: if a feature needs more, it doesn't belong in a plugin yet (open an issue instead).

**Done when:** you can describe your plugin as "in its group, the person sends X and the plugin does Y; at time T the plugin asks Z".

## 1. Design the conversation before the code

Write down, in the plugin's README draft:

1. **Commands.** Every message the person can send, and what happens. Keep them short and forgiving: accept `done read`, `did read`, `read done` if that's how people talk. Number references (`done 2`) help when names are long.
2. **Acknowledgement.** Changes are acknowledged with a reaction, not a message: 👍 for "saved", ✅ only for "done". Messages are for answers (lists, questions back, errors). This is a whatodo-wide rule: people asked for fewer replies.
3. **What the plugin starts.** Scheduled messages (check-ins, summaries, nudges). One message per thing to answer (so a reaction maps to one item), sent only when there is something to answer.
4. **Data.** Each collection, its key, the data shape, the sort value. Store the minimum: see [data-and-privacy.md](data-and-privacy.md).
5. **Settings.** Things the person can change (a check-in hour), with defaults.
6. **Web page.** Only if the chat can't show it well (a month-long grid, a chart, bulk edits).
7. **Unknown input.** What the plugin says when it doesn't understand: always point to `help`.

**Done when:** the README draft has Commands, Data and Privacy sections (and Schedules / Settings / Web page if used) and every command has a defined acknowledgement.

## 2. Scaffold

```sh
pnpm new <id> "<Name>" "<emoji>"
```

This copies `templates/plugin` into `src/plugins/<id>`, fills in the names and registers the plugin in `src/index.ts`. Rules for the fields (checked by `src/conformance.test.ts`):

| Field | Rule |
|---|---|
| `id` | lowercase letters, digits, dashes; 2-31 chars; equals the folder name; **never changes once released** |
| `version` | `1.0.0` for a first release (`0.x.y` for a preview) |
| `sdk` | `"1"`: the SDK major you wrote against |
| `name` | 1-30 chars |
| `icon` | one emoji |
| `tagline` | 1-80 chars, one line for the marketplace card |
| `description` | at least 40 chars: what it does and how you use it in WhatsApp |
| `groupName` | 1-25 chars, usually `"<icon> <Name>"` |
| `price` | `0` (paid plugins are not enabled yet) |
| `tier` | `1`, `2` or `3`: what it costs the platform to run ([sdk-reference.md#tiers](sdk-reference.md#tiers)) |
| `listing` | `{ title, description, h1 }` for the plugin's public page: research what people search and write for that (title ≤ 60, description ≤ 155) |
| `welcome` | posted right after install: what it is, the first thing to try, "send help" |
| `help` | the command list, posted when the person sends `help` |

**Done when:** `pnpm check` passes with the scaffold untouched.

## 3. Write the handlers

Handlers get an event and a kit. Read [sdk-reference.md](sdk-reference.md) for every method. The rules that matter most:

**Deterministic only.** Handlers run inside a database transaction that can be retried. Use `kit.now`, `kit.today` and `kit.time.*` for time, `kit.id()` for new ids, schedules for anything later. Never `fetch`, `Date.now()`, `new Date()`, `Math.random()`, timers, `process`, `require`, dynamic `import()`, `eval`. CI rejects them.

**Imports.** Only `../../sdk` (or `whatodo-plugins/sdk`) and files inside your own folder. Put shared helpers in your folder (`src/plugins/<id>/streaks.ts`).

**Parsing messages.** Trim and lower-case, match the commands you designed, and finish with `kit.unsure("I didn't get that. Send help.")` rather than sending that yourself. Keep the parser in one place at the top of `onMessage`; test every pattern.

**Unclear messages.** Declare `understand` (your intents, and optionally `targets`) and `onIntent`, and whatodo's intent model handles what your parser can't: "I want to start going to the gym on mondays" arrives as `add_habit` and you read the name and days out of the text. See [sdk-reference.md](sdk-reference.md#understanding-unclear-messages).

**Refs.** When you post something the person might react to or reply to, attach a small `ref`: `kit.send(text, { ref: { habitId, day } })`. It comes back on `onReaction` and as `quotedRef` on replies. Keep refs tiny and self-describing; check their shape before trusting them (a reply to an old message brings an old ref back).

**Storage.** One collection per kind of thing. Keys are strings you choose; put what you look up by in the key (`<habitId>:<day>`) and use `list({ prefix })`. Use `sort` for ordered reads and ranges (`list({ from, to })`). Data must survive JSON (no `undefined`, `Date`, `Map`). Everything you store is per install: two people never share data.

**Settings.** Defaults go in `settings` on the definition. Read `kit.settings`, change with `kit.setSettings(patch)`.

**Schedules.** Declare them on the definition:

```ts
schedules: [{ id: "checkin", hour: "hourly" }]          // every local hour
schedules: [{ id: "summary", hour: 8 }]                 // 8am daily
schedules: [{ id: "nightly", hour: { setting: "checkinHour" } }] // hour from a setting; null = off
```

`onSchedule` runs at most once per slot (once a day, or once an hour for hourly) per install. Post only what's due; check what was already answered so you never ask twice.

**Errors.** In chat handlers, answer the person in words ("I can't find "read". Send habits to see them."). In web actions, `throw new Error("Plain sentence")`; whatodo shows the message to the person.

**Done when:** every command, schedule and reaction from step 1 has code, and the plugin never imports or calls anything outside the kit.

## 4. Test everything

Tests are required (CI fails without them) and are the reviewer's main evidence. Use the test kit; see [testing.md](testing.md) for its API and patterns. Cover:

- every command, including the variations you accept and the unknown-input answer
- every schedule: what it sends, and that it sends nothing when nothing is due, and nothing twice
- every reaction and reply path, including a stale or foreign `ref`
- every web action and `load`, including the errors
- settings changes
- `onUpgrade` from every earlier released version (from your second release on)

**Done when:** `pnpm check` passes and every row of your README's Commands table has a test.

## 5. Optional: a web page

Add `web` to the definition:

```ts
web: {
  lockable: true,                       // the person can put it behind their whatodo PIN
  async load(kit, args) { return {...} },   // read-only: any write throws
  actions: { async rename(kit, { id, name }) { ... } },
}
```

`load` runs read-only (it may not write). Actions run like other handlers. Return JSON only. The page itself is a React component in whatodo's website; today it is added by the whatodo team, so describe the page in your README (`## Web page`: what `load` returns, each action's arguments) and open an issue.

**Done when:** `load` and each action are tested and documented in the README.

## 6. Document

Finish the plugin's README (it is the marketplace's detailed page and the reviewer's spec): what it does, Commands, Schedules, Settings, Data, Web page, Privacy. Write the first CHANGELOG entry (`## [1.0.0] - YYYY-MM-DD`, with `### Added` and `### Data`). Add the plugin to the table in the repo README.

**Done when:** the README matches the code exactly and the conformance tests for README and CHANGELOG pass.

## 7. Open a pull request

Follow [CONTRIBUTING.md](../CONTRIBUTING.md) and fill in the PR template. CI runs typecheck, tests, conformance and the release rules. A maintainer reviews against [review-checklist.md](review-checklist.md). After merge, whatodo pins the new commit and deploys; your plugin appears in the marketplace.

**Done when:** CI is green and the PR checklist is ticked honestly.

## Changing a released plugin

Read [releasing.md](releasing.md) first. Every change bumps the version, adds a CHANGELOG entry, and keeps existing installs working: people's data from every earlier version must still load, migrated by `onUpgrade` if its shape changed.
