# Changelog: MediaStore

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
