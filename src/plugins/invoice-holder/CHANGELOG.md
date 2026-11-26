# Changelog: InvoiceHolder

All notable changes to this plugin. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## [1.2.0] - 2026-11-27

### Added

- Bills by mail (needs the "mail" permission, SDK 1.33.0): a mail with a PDF that comes to the person's Zelfred mail address from a sender they accepted is kept as a bill waiting for a folder, with the sender shown. If an earlier bill from the same sender was filed, the new one goes in the same folder. A mail with no PDF is not taken. Nothing is sent in WhatsApp for it; the weekly count includes it.

## [1.1.0] - 2026-11-26

### Changed
- The name people see is BillKeeper (the owner, 2026-11-26). The id stays `invoice-holder`. Groups made from now on are called "📑 BillKeeper".

### Added
- Deleting a bill's photo in WhatsApp keeps the bill, and one line says it is still on the page and can be removed there.
- On Sundays, when bills wait for a folder, one line says how many.
- On the 1st, one line about the month before: how many bills, how many have an amount, and their sum.

### Data
- `state`: `weekly` (a day) and `month` (a month), so each goes once.

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
