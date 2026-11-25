# Testing a plugin

Every plugin ships with tests in `src/plugins/<id>/__tests__/`. CI runs them, plus the conformance suite (`src/conformance.test.ts`), on every pull request. Reviewers read your tests to learn what the plugin promises, so name them after behaviour ("skips habits already done today"), not functions.

## The test kit

`createTestKit` (from `whatodo-plugins/testing`, or `../../../testing` inside this repo) gives you an in-memory kit that behaves like Zelfred's: data goes through a JSON round trip, `send` rejects empty or over-long messages, `list` sorts the same way, settings start from the plugin's defaults.

```ts
import { describe, expect, it } from "vitest";
import water from "..";
import { createTestKit } from "../../../testing";

it("logs a glass and reacts", async () => {
  const t = createTestKit({ today: "2026-11-15", hour: 14 });
  await t.message(water, "💧");
  expect(t.reactions).toEqual(["👍"]);
  expect(t.dump()["glasses/2026-11-15"]).toBe(1);
});
```

### Options

| Option | Default | Meaning |
|---|---|---|
| `today` | `"2026-11-15"` | `kit.today` and `kit.time.day()` |
| `hour` | `21` | `kit.time.hour()`; also sets `kit.now` |
| `person` | `{ name: "Test Person", timezone: "Asia/Kolkata" }` | `kit.person`. Add `currency: "INR"` for a person whose currency Zelfred already knows; `t.kit.person.currency` shows what `kit.learn` recorded. |
| `settings` | `{}` | Install settings, layered over the plugin's defaults |

### Driving events

| Call | Does what Zelfred does when… |
|---|---|
| `await t.install(plugin)` | the plugin is installed (`onInstall`) |
| `await t.message(plugin, text, quotedRef?, group?, from?, links?)` | the person sends `text` (as a reply to a message with `quotedRef`). `help`/`?`/`menu`/`commands` post `plugin.help`, as Zelfred does. `links`: what Zelfred read from the links in it, each built with `link(url, { site, kind, title, ... })` from the test kit; needs the `"links"` permission. |
| `await t.react(plugin, emoji \| null, ref, group?, from?)` | the person reacts to (null: un-reacts) a message sent with `ref` |
| `from` on the three calls above and below | who sent it. Left out: the person who added the plugin. A name like `"Asha"`: another member of the group (her `sender.id` is `"asha"`). The plugin needs the `"members"` permission, or the kit throws as Zelfred would not have delivered it. |
| `await t.groupInfo(plugin, what, value, group?)` | someone gives a group of the plugin a new name (`"name"`) or description (`"description"`); `group` is an extra group's key, left out for the main group. Throws when the plugin has no `onGroupInfo`. |
| `await t.answer(plugin, ref, choice, from?)` | someone answers the open question asked with `ref` (`kit.ask`); `choice` counts from 0. Settles it and posts its `confirm` line when the owner is alone in that group; with `"members"` and someone else having written or answered there, it stays open and a second answer from the same person has `changed: true`. Throws when no such question is open. |
| `await t.schedule(plugin, id)` | schedule `id` fires |
| `await t.intent(plugin, text, intent, target?, confidence?, from?, group?)` | Zelfred's intent model read an unclear message as `intent` (about `target`). Checks both were declared, then calls `onIntent`. |
| `await t.targets(plugin)` | returns what `understand.targets` gives right now |
| `await t.upgrade(plugin, fromVersion)` | a new version meets an install made with `fromVersion` |
| `await t.load(plugin, args?)` | the web page loads |
| `await t.loadFor(plugin, from, args?)` | the web page loads for someone else in the plugin's groups (`web.loadFor`) |
| `await t.act(plugin, action, args?)` | the web page calls an action |
| `await t.link(plugin, link)` | Zelfred read a link the plugin asked for with `kit.links.read` (`onLink`, with that request's `ref`). Throws when nobody asked for that address. |
| `await t.parcel(plugin, what, found)` | Zelfred asked the carrier about a parcel the plugin asked for with `kit.parcels.read(what, ref)` (`onParcel`, with that request's `ref`). Build `found` with `parcel({ stage, status, place, ... })`, or `parcel({ found: false, reason })`. Throws when nobody asked about `what`. |
| `await t.message(plugin, text, null, null, undefined, undefined, { photos, place })` | a message with a photo (`photo("p1")`, needs `"photos"`) or a shared position (needs `"location"`); `text` may be `""` |
| `t.addFile(id)` | a picture was added on the plugin's page: `kit.files.get(id)` now finds it |
| `await t.shared(plugin, key)` | someone opens the shared page for `key`: returns what `web.shared` gives. Throws when nothing is shared under that key. |

### Reading results

| Property | Meaning |
|---|---|
| `t.sent` | `{ text, ref }[]` in order: everything posted in the group |
| `t.reactions` | emojis reacted, in order |
| `t.marks` | refs given to `kit.mark`, in order |
| `t.reactTos` | `{ ref, emoji }` for each `kit.reactTo`, in order |
| `t.signedUp` | sender ids given to `kit.signUp`, in order. A member made with a name has `profile: false` until then. |
| `t.asked` | questions asked with `kit.ask`, in order: `{ question, options, ref, group, confirm, open }` |
| `t.unsures` | fallback texts from `kit.unsure()`, in order (in Zelfred these trigger intent understanding) |
| `t.shares` | the shared pages that are open, by key (`kit.share.url`); a key is gone after `kit.share.remove` |
| `t.reads` | `{ url, ref }[]`: links asked for with `kit.links.read` and not answered yet |
| `t.parcelReads` | `{ what, ref }[]`: parcels asked about with `kit.parcels.read` and not answered yet |
| `t.dump()` | `{ "collection/key": data }` of everything stored |
| `t.kit.settings` | current settings |
| `t.setToday(day)`, `t.setHour(h)` | move the clock between events |

## What to cover

A plugin isn't reviewed until the tests show each of these:

1. **Every command** in the README, including the variants you accept, and the answer to input you don't understand.
2. **Acknowledgements:** the right reaction (👍 saved, ✅ done) and no extra message where a reaction is enough.
3. **Every schedule:** what it posts when something is due, that it posts nothing when nothing is due, and that it never repeats an item already answered. Move the clock with `setHour`/`setToday`.
4. **Reactions and replies:** the happy path, a removed reaction (`null`), and a stale or unexpected `ref` (another day, a deleted item, a shape from an older version) that must not crash or corrupt data.
5. **Web:** `load`'s shape, every action, and every error an action can throw (`await expect(t.act(...)).rejects.toThrow()`).
6. **Settings:** changing them changes behaviour.
7. **Upgrades** (from your second release): build the stored data exactly as the older version wrote it with `t.kit.store.put`, call `t.upgrade(plugin, "<old version>")`, then exercise the plugin. One test per earlier released version whose data shape differs.
8. **Duplicates and idempotence:** adding the same thing twice, ticking twice, upgrading twice.
9. **Intents** (with `understand`): that unreadable messages call `kit.unsure` (not `send`), every intent through `t.intent` with natural phrasings, a missing target, and text that lacks what the intent needs.

## Running

```sh
pnpm test                                   # everything
pnpm vitest run src/plugins/habits          # one plugin
pnpm vitest src/plugins/habits              # watch mode
pnpm check                                  # typecheck + tests + conformance (what CI runs)
```

## Conformance tests

`src/conformance.test.ts` checks every plugin for: folder name equals `id`; field lengths; `price` is 0; schedules are valid; README has the required sections; CHANGELOG's newest entry equals `version` with versions and dates going down; tests exist; imports stay inside the SDK and the plugin's folder; no forbidden APIs. When it fails, the message names the file and the rule. Fix the plugin; never edit the conformance suite to make a plugin pass.
