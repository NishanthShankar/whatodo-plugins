# Changelog: Journal

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
