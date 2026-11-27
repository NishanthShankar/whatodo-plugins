# Changelog

## [1.6.0] - 2026-11-27

### Security

- Showing a hidden value whole (a card number, a PIN) now takes the person's lock: their passkey, passphrase or recovery key, the same one across Zelfred. The page's `reveal` action is named in `web.locked`, so Zelfred refuses it without a fresh signature from that lock. Needs SDK 1.39.0.

## [1.5.0] - 2026-11-27

### Changed

- When NumberKeeper can't do something it says sorry, lightly, and never hands the work back (voice 10, the owner, 2026-11-26).
- A photo sent with no number and nothing kept just now is kept, and NumberKeeper asks "What number is it?". The photo goes with the next number sent within the hour, so it is never sent twice. After an hour it is let go.
- One name holding 2,000 values has its own line. Before, it got the line for 300 different things.
- On the page, a full name is named, with what to do.
- Counts are written in digits: "2 kept at once", "by its last 4 digits", "4 photos" (voice 11).

### Data

- New `state` row "photos": photos waiting for their number. Removed with everything else.

## [1.4.0] - 2026-11-27

### Changed

- The name people see is NumberKeeper (the owner, 2026-11-27), of the Keeper family. The id stays `digits-store`, and "digits" still lists everything. New groups are called "🔢 NumberKeeper".

### Data

- None.

## [1.3.0] - 2026-11-26

### Changed

- "remove weight 72.4" takes out that one value. Before, it was kept as a new label called "remove weight".
- A hidden value (a card number, a PIN) is marked 🔒 on the person's message every time. The words explaining it come with the first one only (the owner, 2026-11-26).

### Data

- `state/hiddenTaught`: 1 once a hidden value was explained in words.

## [1.2.0] - 2026-11-26

### Changed

- The first five minutes, in og-copy-bot's words as picked by the owner: a new welcome with a dry last line, "today or next year" in the first keep, "kept today" in every answer, the page named for everything kept, and "It will still be here next year." under the very first answer, once.

### Data

- `state/recalled`: 1 once the first answer was given.

## [1.1.0] - 2026-11-26

### Added

- Counting up by name. A label seen added to one at a time twice in a row (12, 13, 14) counts from then on: its name alone ("gym", "gym today") adds one and says the new count. "gym?", "gym count", "get gym" and "show gym" give the count. Any other bare label gives its number back, as before. The page can turn counting off for a label, and it stays off.

### Data

- `labels` may carry `counter` (true, or false when turned off on the page). Labels without it work as before.

## [1.0.0] - 2026-11-26

### Added

- Any number with a word for what it is, kept with its day: typed as people type them (5'6", 120/80, 1.5 lakh, 10k, MH 12 AB 1234, 12/03/1990), several in one message, a number alone when there is one label or once its word follows.
- Asking for one back: the latest and the first, every label that fits, the history, the list. Our own matching first; the sorting model only when that finds nothing, hearing labels and each value's shape, never a value.
- Correcting and taking out: a reply with the right number, undo, ❌, deleting the message, removing a label after asking.
- Card numbers and PINs locked: kept whole, shown masked. Aadhaar numbers kept with an offer to delete the message.
- Dates said back in words, and reminded: birthdays every year on the day, other dates still to come a week before and on the day.
- Two names for one person asked about once, and remembered.
- Photos kept with a value.
- A page: every label with a graph, every value to correct or remove, add on any day, remove everything.

### Data

- `labels`, `entries` and `state`, as in the README.
