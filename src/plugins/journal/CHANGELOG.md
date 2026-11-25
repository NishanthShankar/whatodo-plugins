# Changelog: Journal

## [1.2.2] - 2026-11-25

### Changed
- Messages name the app's new address, app.zelfred.com. The old one, app.whatodo.today, still leads there.

## [1.2.1] - 2026-11-20

### Changed
- The tagline and the site's title and description say "encrypted". It is zero-access encryption: entries are encrypted as they arrive and, once the journal is locked, with a key only its person holds. Still never "end to end encrypted", because each message is read once on arrival in order to encrypt it.

## [1.2.0] - 2026-11-20

### Changed
- Journal is listed: anyone on Zelfred can add it from the app store, and it has its own page on the site.
- The tagline and the site's description say "lock it" where they said "locked", because a journal started in WhatsApp is locked by its person a little later.

## [1.1.0] - 2026-11-20

### Changed
- The pinned note no longer says who can open the journal, and the line after the first entry is gone from this plugin. Zelfred now says both, because the answer depends on who holds the key: a journal can be started in WhatsApp and locked by its person a little later.
- Descriptions say "a key only you hold" where they said "your passphrase": the journal can be locked with Face ID or a fingerprint too.

### Data
- `state` / `first` is no longer written or read.

## [1.0.0] - 2026-11-20

### Added
- First release, unlisted. A journal in its own WhatsApp group ("📓 Journal") where every message is an entry, locked on arrival so that only the person can open it (the `vault` permission).
- A note pinned in the group says what Zelfred can and can't read, and the three things to know. There are no typed commands.
- One line after the first entry with the address of the journal page.
- An evening prompt, "How was today?", off by default. Set its hour on the page.
- A line when a streak reaches 7, 30, 100 or 365 days in a row, once each.
- Page data: entries per day, the current streak and the best one.

### Data
- `days`: key day, the number of entries that day, sort day.
- `state`: `first` (1 once the first-entry line was sent), `streak` (the longest streak already announced).
- The entries themselves are not this plugin's data: Zelfred keeps them locked, outside the plugin's store.
