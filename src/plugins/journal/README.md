# 📓 Journal

A journal you write in WhatsApp and read on the web. Every message in its group, "📓 Journal", is an entry: words, photos, voice notes. Each one is read once, to lock it with a key made from your passphrase. After that nobody but you can open it, and that includes Zelfred and this plugin.

Unlisted for now: it isn't in the store or on the public site, and only people Zelfred allows can add it. Its locking has not been reviewed by a specialist yet.

Do not describe it as "end to end encrypted". It isn't: one process reads each message for a moment as it arrives, in order to lock it.

## Commands

There are none, on purpose. Nothing typed in this group is read, so `help`, `settings` or any other word is just another entry. What works without reading:

| In the group | What happens |
|---|---|
| Any message | It becomes an entry. Zelfred reacts 👍 once it is locked, stored and confirmed. |
| ❌ on your own message | That entry, and its file if it has one, is removed. |
| Editing a message | The entry's words are replaced. |

The note pinned at the top of the group stands in for `help`.

## Schedules

| Id | When | Does |
|---|---|---|
| `prompt` | once a day at `promptHour` | Sends "How was today?" if nothing was written that day. Off while `promptHour` is null. |

## Settings

| Key | Default | Meaning |
|---|---|---|
| `promptHour` | `null` | Local hour (0-23) of the evening prompt. `null`: no prompt. Set on the page; there is no WhatsApp message for it, because nothing typed here is read. |

## Web page

`app.whatodo.today/plugins/journal`, built by Zelfred. The person unlocks it with their passphrase and reads, searches, edits and writes there. Opening happens in the browser; nothing readable is sent back.

This plugin's part of the page is small: `web.load` returns the number of entries per day, the current streak and the best one, and the prompt hour. `setPromptHour` changes the prompt.

## Data

| Collection | Key | Data | Sort |
|---|---|---|---|
| `days` | `YYYY-MM-DD` | how many entries that day | the day |
| `state` | `first` | `1` once the first-entry line was sent | none |
| `state` | `streak` | the longest streak already announced | none |

The entries are not in this plugin's store. Zelfred keeps them, locked, and hands this plugin only `onEntry`: an id, a kind ("text", "image", "voice"), a time, and whether it was added, edited or removed.

## Privacy

- This plugin never receives a message, a caption, a file name or a file. It has no `onMessage` and can't have one.
- It knows when you wrote and what kind of thing it was, and so does Zelfred, along with each entry's size.
- The messages stay readable in the WhatsApp chat on your phone, and in WhatsApp's own backup if you have that on.
- The passphrase can't be reset by anyone. With the recovery key you can set a new one. Without either, the journal can't be opened.
