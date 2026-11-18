# Changelog: MediaStore

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
