# Changelog: SafeButWhere

All notable changes to this plugin. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

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
