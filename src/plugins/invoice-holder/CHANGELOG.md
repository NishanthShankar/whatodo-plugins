# Changelog: InvoiceHolder

All notable changes to this plugin. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-11-26

### Added
- A photo sent in the group is a bill, kept with a 👍. The first one is explained once and asks whose it is; the answer is the first book.
- Books: a business or a person, with an emoji (seven at most), and a GST number for a business. Made and changed on the page.
- Filing a bill: a reaction with a book's emoji (the last one counts, taking it off unfiles), a reply with the book's name, a caption, or a tap on the page. My 👍 on the bill becomes the book's emoji.
- Captions and replies are read by our own code: a book's name files the bill, the one number written as money (or the only number) is its amount, the rest is a note. Two books named equally get one poll.
- Pictures sent together are kept as separate bills in one batch.
- `books` lists the books and their emoji.
- The page: bills to file, every bill, each book, adding pictures, changing a bill or a book, removing either.
- Unlisted.

### Data
- `books`: key book id, `{ name, emoji, kind, gst, order, at }`, sort order.
- `bills`: key bill id, `{ v, source, files, by, at, state, book, tagged, amount, billDate, note, batch, history }`, sort when it came.
- `state`: `taught`, `understood`, `asking` (`{ bill }`), `batch` (`{ id, at }`).
