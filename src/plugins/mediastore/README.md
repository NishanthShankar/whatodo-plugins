# 🎬 MediaStore

Forward a YouTube video, a short or an Instagram reel and it is kept with its title, caption and who posted it, so you can find it later with a few words. Lives in its own WhatsApp group, "🎬 MediaStore". Not listed yet: only people telcurio allows can add it. The name may change.

## Commands

Send these in the MediaStore group.

| Message | What happens |
|---|---|
| a link, sent or forwarded | Saved with its details, then 👍 (a second or two later, while they are read). The very first time, one message explains that the caption is kept and how to find things. |
| a link with words of your own | Saved, and your words are kept as its note. 👍 |
| a link you already saved, in the same group | One copy stays. Its details are read again and a new note replaces the old. 👍 |
| a link already saved in another group | A second copy is saved here, tagged as forwarded with who sent it. 👍 |
| `find pasta` (also `search`, `look for`, `show me`) | Up to 5 links that match, best first. |
| `recent` (also `latest`, `list`, `last`) | Your latest 5 links. |
| `liked` / `important` | The ones you marked. |
| `undo` (also `delete last`) | Removes the last link you saved, and says which. |
| `count` | How many links you have, by site. |
| `new group recipes` | Makes a WhatsApp group for one kind of link. |
| `groups` | Lists your groups and how many links each has. |
| `close group recipes` | Closes that group. Its links stay saved. |
| `help` | The command list. |

A group you already have can be a MediaStore group too: add telcurio to it, then pick MediaStore for it in your chat with telcurio or on the web. `close group <its name>` stops the saving there without closing the chat.

On a link you sent (or on a single result the plugin posted):

| You | What happens |
|---|---|
| react ❤️ (any heart) | Liked. |
| react ⭐ (also 🌟 📌 ❗ 🚩 🔖) | Marked important. |
| change or remove your reaction | Takes back the mark that reaction set. |
| reply with words | Kept as your note. 👍 |
| reply `delete` | Removed. 👍 |
| reply `like`, `unlike`, `important`, `not important`, `no note` | Does that. 👍 |
| reply `move` (also `move this`, `wrong group`) | A poll of the groups it can go to. Pick one and it is moved: "Moved to *recipes*." |
| reply `move to recipes` / `move to main` | Puts it under that group. 👍 |

A message can hold up to 3 links; each is saved. In one of your extra groups, links are saved under that group, and `find`, `recent`, `liked`, `important`, `undo` and `count` look only at that group's links. Plain sentences there do the same. In the main group they look through everything.

Anything else goes to telcurio's intent model, so plain sentences work: "where is that pasta video I saved", "show me what I liked". Intents: `search`, `recent`, `liked`, `important`, `groups`, `new_group`, `move`, `undo`, `help`. No targets.

The move question (the owner's decisions, 2026-11-18): asked as a poll when someone replies `move` to a link. It lists the open groups, and the main one, other than where the link is, and only those that both the person asking and the person who shared the link are part of (the person who added MediaStore is part of all; anyone else counts once they have written in a group). Last option "Leave it here". Only the person who asked decides; the poll is removed once they answer and one line says where it went. No groups in common gets a message, not a poll.

Search is plain word matching, weighted: your note first, then the title, who posted it, the site and group, then the caption. A link must match as many of your words as the best match does. It costs nothing to run.

Limits: 3000 links, 20 groups, 1500 characters of caption and 500 of note per link.

## Data

| Collection | Key | Data | Sort |
|---|---|---|---|
| `links` | link id | `{ url, canonical, site, kind, found, title, description, author, image, seconds, note, group, at, liked?, important?, reacted?, by? }` | saved time (ms) |
| `urls` | hash of `canonical` | the ids of its copies, one per group it is in | none |
| `seen` | `<group>:<personId>` (empty group: the main one) | `1` | none |
| `groups` | group key | `{ name, created, closed? }` | created (ms) |
| `state` | `intro` | `1` once the first-save note was sent | none |

`image` is the picture's address, never the picture. `by` is who sent the link: `{ id, name, owner }` (`id` is not a phone number; unset on links saved before 1.2.0). `reacted` is the mark the person's current reaction set. `forwarded: { by, from, at }` is on a copy that came from a link already saved in another group. Refs: `{ kind: "link", ids }` on the person's link message (through `kit.mark`) and on a single result.

## Web page

Lockable. `load({ limit? })` returns `{ total, max, links: [{ id, url, site, kind, found, title, description, author, image, seconds, note, group, at, liked, important, by }], groups: [{ key, name, closed, count }] }`, newest first, 600 links unless `limit` says otherwise (1000 at most), captions cut to 400 characters. `load({ link: id })` returns `{ link }`: that one link in full, or `null`.

Actions: `setLiked { id, on }`, `setImportant { id, on }`, `setNote { id, note }`, `move { id, group }` (`null` for the main group), `setImage { id, image }` (a fresh https picture address, when the kept one stopped working), `remove { id }`, `createGroup { name }`, `closeGroup { key }`.

## Privacy

Permissions: `links`, `groups` and `members`.

A MediaStore group can be shared: anyone you add to it can send links, search, mark and remove, and can read everything the plugin posts there. Each link keeps the WhatsApp name of who sent it.

Reads only the messages in its own groups (from everyone in them), its own stored data, and the person's time zone and name. When you send a link, telcurio's servers open that link's public page, the way a link preview does, and hand the plugin its title, caption, who posted it, length and picture address. The site sees a request from telcurio, not from you. Nothing behind a login is read, and nothing of what is said or shown in a video.

Stores each link with those details and your own note. Pictures are not stored, only their addresses. A message it can't read is sent by telcurio, with the intent descriptions, to its intent model (jev) to be classified; telcurio keeps only the answer, never the text.
