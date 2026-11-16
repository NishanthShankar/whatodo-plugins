# Data and privacy

People trust whatodo with their WhatsApp. A plugin borrows that trust, so it gets the least it needs and keeps the least it can.

## What a plugin can see

| Source | What arrives | What never arrives |
|---|---|---|
| Messages | Text the **installer** sends in the plugin's own group | Other chats, other groups, other members, whatodo's private chat, media files |
| Replies | `quotedRef`: the ref of the plugin's own message being replied to | The text of other messages |
| Reactions | Emoji on the plugin's own messages (with refs) | Reactions elsewhere |
| Person | Time zone; name as set in whatodo | Phone number, contacts, other plugins installed |
| Storage | Its own rows for this install | Other installs, other plugins, whatodo's tables (todos, lists, users) |
| Network | Nothing | Any network access |
| Hooks | With a hook open: the text fields and the file names, types and sizes of each request sent to it | The files' bytes; the sender's IP address |
| Intent model | With `understand`: an intent id, a target id and a confidence for a message the plugin was unsure about | The model's own text; anything about other messages |

How it's enforced:

1. **Runtime.** whatodo builds a kit for one install and calls the handler with it. Storage queries are scoped to that install by the runtime, posting goes only to that install's group, and handlers run inside a database transaction with no other handles. A plugin's messages and reactions are routed only from its own group, and only from the installer.
2. **CI.** `src/conformance.test.ts` rejects plugins that import anything except the SDK and their own files, or use network, timer, clock, randomness, process or eval APIs.
3. **Review.** A maintainer reads every change against [review-checklist.md](review-checklist.md).

Plugins in this repo are first-party code bundled into whatodo; the boundary today is the kit plus CI plus review. Hosted third-party plugins (later) will run outside whatodo entirely and talk to it only through the same events and actions.

When a plugin calls `kit.unsure()` and declares `understand`, whatodo (not the plugin) sends that one message's text, the plugin's intent descriptions and its target labels to its intent model (jev, by TypeSafe, through OpenRouter) to be classified. whatodo keeps only the model's answer, token counts and cost, never the text.

Known gap: `kit.person.name` is available to every plugin. It will move behind a permission shown at install.

## What to store

- **Only what the feature needs.** A habit tracker stores habit names and done-days; it doesn't store every message.
- **Derived, not raw.** Store "done on 2026-11-15", not the message that said so.
- **Small values.** One record per row; use keys and sort values for history instead of growing one big value.
- **No secrets.** Never ask people to send passwords, OTPs, card numbers or IDs in a plugin group.
- **Nothing for other people.** A plugin's group has one person in it; don't design features that collect data about anyone else. The exception is a plugin whose job is to receive things for the person, through a hook (a form on their website). It stores what was sent, only for them, shows it only to them, and lets them delete it.

## Retention and removal

- Uninstalling keeps the install's data so a reinstall picks up where it left off. (Deleting data on request will be a whatodo feature, not something each plugin implements.)
- Don't build features that depend on keeping data forever; old rows may be archived in future.

## Writing the Privacy section

Every plugin README has `## Privacy`, stating plainly:

1. What the plugin reads (normally: its own group's messages, its own data, time zone, and the name if used).
2. What it stores, in the person's words ("habit names and the days you did them").
3. That nothing leaves whatodo.

If any of those isn't true for your plugin, it isn't ready.
