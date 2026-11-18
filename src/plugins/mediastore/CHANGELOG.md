# Changelog: MediaStore

## [1.4.0] - 2026-11-18

### Added
- A WhatsApp group you already have can become a MediaStore group. Add telcurio to it and pick MediaStore for it, in the chat with telcurio or on the web. Links sent there by anyone are saved under the group's name. Choosing something else for it later stops the saving; its links stay.

## [1.3.0] - 2026-11-18

### Added
- Move a link to another group from WhatsApp: reply to it with _move_ and pick the group from a poll. The poll lists your groups other than the one it is in, plus "Leave it here". _move to recipes_ still works when you know the name.
- In a group with other people, the poll lists only the groups both you and whoever shared the link are part of. With none: "No groups in common. You can move it on app.whatodo.today, or forward it to your own group."
- A link forwarded into another group now becomes a second copy there, tagged with who forwarded it and where the earlier copy is. Before, it was moved without a word.

### Data
- `links` rows gain `forwarded: { by: { id, name } | null, from, at }` on a forwarded copy.
- `urls` now holds a list of link ids per address (one per group it is in). A single id from an earlier version is still read.
- New collection `seen`: who has written in which group, used to work out the groups two people share.
- The move question's ref is `{ move: ids, by: personId }`.

## [1.2.2] - 2026-11-18

### Changed
- No 🕐 on your link while it is read. You just get the 👍 when it's saved.

## [1.2.1] - 2026-11-18

### Fixed
- A plain sentence in one of your extra groups ("where is that pasta video") now looks only at that group's links and answers there, the same as _find pasta_ does. It used to look through everything and answer in the main group.

## [1.2.0] - 2026-11-18

### Added
- A MediaStore group can be shared. People you add to the group can send links, search, mark and remove, and each link remembers who sent it. The web page shows it as "Shared by".
- `load({ link: id })` returns one link in full, with its whole caption, for the page's detail view.

### Changed
- New permission `members` (hear everyone in its groups). Everyone in a group can read what the plugin posts there.

### Data
- `links` rows gain `by: { id, name, owner }`: who sent the link. Links saved before this have none, and nothing is shown for them.

## [1.1.0] - 2026-11-18

### Added
- Web action `setImage { id, image }`: the page keeps a link's new picture address when the old one has stopped working, so pictures of older Instagram links keep showing.

## [1.0.0] - 2026-11-18

### Added
- Send or forward a link and it is kept with its title, caption, who posted it, its length and its picture's address. YouTube videos and shorts and Instagram reels and posts are read in full; other links keep what their page says about itself.
- Words sent along with a link are kept as your note. Replying to a link you sent adds or replaces the note.
- `find pasta` looks through your notes, titles, who posted and captions. Plain sentences work too.
- React ❤️ on a link you sent to like it, ⭐ to mark it important. `liked` and `important` list them.
- `recent`, `undo`, `count`, and replying `delete` or `move to recipes` to a link.
- `new group recipes` makes a WhatsApp group for one kind of link; `groups` and `close group recipes`.
- A web page with every link as a tile, and actions to like, mark, note, move and delete.

### Data
- `links`: one row per link. `urls`: a short key per address, to spot a link sent twice. `groups`: the groups made. `state`: whether the first-save note was sent.
- The ref on a saved link's message is `{ kind: "link", ids }`.
