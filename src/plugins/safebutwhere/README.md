# 📍 SafeButWhere

For the things you keep safe and then can't find. When you put something away, send a photo of the spot, a few words, or both. Later, ask where it is and get the words and the photo back. Lives in its own WhatsApp group, "📍 SafeButWhere".

Unlisted for now: only people Zelfred allows can add it.

## Commands

Send these in the SafeButWhere group. Every part of a thing is optional: a photo alone, a photo with words, or words alone.

| Message | What happens |
|---|---|
| a photo | Kept. 👍. The very first time, one message explains how words, tags and finding work. After that a 👍 is the whole answer. |
| a photo with a caption | Kept with the caption as its words. 👍 |
| several photos, then words | Each photo is its own thing, and every one gets the words. 👍 |
| several photos, one with a caption | The caption goes on all of them: the ones sent just before it, and the ones that follow within two minutes. |
| `passport, blue file, top shelf` | Words alone, kept as written. 👍 |
| `#documents` anywhere in the words | A tag. A short line sent for photos (up to three words, like `passport`) is a tag too. |
| your location, right after keeping something | The position is kept with what you just sent (everything from the last ten minutes' batch). 👍 |
| your location with words, and nothing just kept | A thing of its own, kept at that position. 👍 |
| your location on its own | What you kept within 500 m of there, nearest first. |
| `where is my passport` (also `find`, `search`, `look for`, `show me`, `where did I keep`, or a few words ending in `?`) | Up to 3 things that match, each as its own message, with its photo when it has one. More than 3: one line says how many more. |
| a few plain words, like `passport` | A search. If nothing matches, Zelfred's intent model decides whether you meant to keep it. |
| `recent` (also `latest`, `list`, `last`) | The last 5 things you kept. |
| `tags` | Your tags and how many things each has. |
| `count` | How many things, and how many with a photo. |
| `undo` (also `delete last`) | Removes the last thing you kept, and its photo. |
| `help` | The command list. |

On a photo or a line you sent, or on an answer:

| You | What happens |
|---|---|
| reply with words | They replace that thing's words. 👍 |
| reply with a `#tag` | The tag is added. 👍 |
| reply `delete` (also `remove`, `forget`) | Removed, with its photo. 👍 |

Words are told from a search like this: a line with a comma, a colon, a tag or a place word ("in", "under", "behind", "drawer", "shelf") is something to keep. A line that starts with `find` or `where`, or ends in `?`, is a search. A few plain words are searched first.

Anything else goes to Zelfred's intent model, so plain sentences work: "any idea where I left my passport". Intents: `find`, `keep`, `recent`, `tags`, `undo`, `help`. No targets.

Search is plain word matching, weighted: tags first, then your words, then the name of the position. A thing must match as many of your words as the best match does. It costs nothing to run.

Limits: 1500 things, 500 characters of words, 12 tags per thing.

These choices are the plugin author's and were not confirmed by the owner: each photo being its own thing, the ten minute and two minute windows, a short line doubling as a tag, three answers in full, 500 m for "near", and a few plain words being a search.

## Data

| Collection | Key | Data | Sort |
|---|---|---|---|
| `things` | thing id | `{ what, tags, photo, place, at, changed? }` | kept time (ms) |
| `state` | `intro` | `1` once the first-keep note was sent | none |
| `state` | `last`, `last:<group>` | `{ ids, at, open, words? }`: what was kept just now, so the next words or position go with it | none |

`what` is the person's own words, or null for a photo with no words. `photo` is the id of a picture Zelfred keeps, never the picture. `place` is `{ lat, lng, name, address }` or null. Refs: `{ kind: "thing", ids }` on the person's own photo or line (through `kit.mark`) and on each answer.

## Web page

Lockable. `load({ limit? })` returns `{ total, max, things: [{ id, what, tags, photo, place, at, changed }], tags: [{ tag, count }] }`, newest first, 600 things unless `limit` says otherwise (1000 at most). The page shows each photo through Zelfred by its id.

Actions: `add { what?, tags?, photo?, place? }` (`photo` is the id Zelfred returns when the page adds a picture; it needs a photo, words or a tag), `edit { id, what?, tags?, place? }` (`place: null` takes the position off), `remove { id }` (deletes the photo too).

## Privacy

Permissions: `photos`, `location` and `lock-members`.

This app holds photos and notes of where a person keeps their valuables. It is an ordinary app, not a locked one: Zelfred can read what is kept here, which is how it can answer "where is my passport" in WhatsApp. Never describe it with the Journal's promises. The page can be put behind the person's PIN.

Reads only the messages in its own group, its own stored data, and the person's time zone. With `photos`, Zelfred keeps each photo sent in the group and gives the plugin its id; the plugin never holds a picture. With `location`, a position shared in the group reaches the plugin as a latitude and longitude with the place's name when there is one.

Stores your words, your tags, the id of each photo and any position you shared. Deleting a thing deletes its photo. A photo is sent back only into this group, when you ask for it, and shown only to you on the page.

A message it can't read is sent by Zelfred, with the intent descriptions, to its intent model (jev) to be classified; Zelfred keeps only the answer, never the text. Photos are never sent to a model.
