# Changelog: SafeButWhere

All notable changes to this plugin. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-11-22

### Added
- Groups by reaction. React to a photo or a line of yours, or to an answer, with any emoji and the thing joins that emoji's group. A thing is in one group at a time: the last emoji given. Taking the reaction off takes it out.
- An emoji sent on its own shows its group: up to 3 things in full, a longer group as a list.
- `groups` lists your groups with how many things each has.
- The page gets each thing's group and the list of groups, and `edit` takes `reaction`.

### Data
- `things`: a new optional field `reaction` (the emoji). Things kept before have none and are in no group.

## [1.0.0] - 2026-11-22

### Added
- First release, unlisted. Keep where you put things: a photo of the spot, a line of words, or both. Ask for it later and get the words and the photo back.
- Words sent right after photos go on every photo sent just before. A caption on one photo of an album covers the others.
- Tags written as `#documents`, and a short line sent for photos is a tag too.
- A position shared right after a thing is kept with it. A position shared on its own shows what is kept near there.
- `recent`, `tags`, `count`, `undo`, and replies that change or remove a thing.
- A web page: everything kept, with photos, tags and positions; add, edit and remove.

### Data
- `things`: key thing id, `{ what, tags, photo, place, at, changed? }`, sort kept time (ms).
- `state`: `intro` (1 once the first-keep note was sent), `last` and `last:<group>` (`{ ids, at, open, words? }`: what was kept just now).
