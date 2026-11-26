# Changelog: InvoiceHolder

All notable changes to this plugin. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## [1.6.0] - 2026-11-27

### Added
- An amount can be in rupees or dollars (the owner, 2026-11-27: "it can be USD or Rs"). A caption or reply with $, usd or dollars is in dollars; ₹, rs or /- in rupees; a bare number in the person's own currency. The page can change it. The month's line gives one sum per currency and never adds them together.

### Changed
- The first note question says sorry, once, that BillKeeper can't read a bill yet, and that answering is optional (voice 10, the owner's rule that Zelfred apologises for what it can't do and never overburdens).

### Data
- `bills`: `currency` ("INR" or "USD"; null for the person's own).

## [1.5.0] - 2026-11-27

### Changed
- A bill has a short name apart from its note (the owner, 2026-11-27: "name and notes have been combined now? not what i wanted. note can go toooooo long"). The name is its title, at most 60 characters. The note can be long, up to 2000, and keeps its lines.
- A caption's or a reply's leftover words name the bill when they are short, and are its note when longer. The answer to the note question is always the note.

### Data
- `bills`: `name`. Notes kept before stay notes.

## [1.4.0] - 2026-11-27

### Added
- When a bill comes by mail, one message in the group asks for a note (docs/invoice-holder-note-ask-brief.md in the whatodo repo). The next plain line within 10 minutes is the note, while it is the one open question; a reply to the question sets it any time later; "no" means none. The whole text is the note, never read for a folder or an amount. A folder's emoji on the question files the mail's bills.
- Not asked: old mail handed over when the app is added, mail the platform says has no lines left, at night (10pm to 8am), and routine senders: three monthly bills with no notes, or the last two questions left with no note. These are my defaults, not the owner's. A note on any of the sender's bills starts the asking again.
- `setSenderAsk` on the page: ask for a sender always, never, or by the rules.
- Built on SDK 1.34.0: the question reads the mail's line allowance (`lines`) and stays silent when none are left, and the 8pm summary of held-back mail lines is in BillKeeper's words (`mailSummary`).

### Data
- `bills`: `asked` (when the question went) and `noteBy` ("now", "reply" or "no").
- `senders`: key the sender's address, `{ ask: "yes" | "no" }` (no row means by the rules).
- `state`: `noteOpen`, `noteFirst`, `noteTaught`.

## [1.3.0] - 2026-11-27

### Changed
- Each PDF a mail brings is its own bill, so each is filed on its own. They stay next to each other on the page, marked "1 of 3".
- A forward (a mail from the person's own address) is never filed by sender: every forward comes from them, so the rule would put them all in one folder.

### Added
- What the page needs to tell mailed bills apart: whether the sender is a company or the person, which of the mail's PDFs it is, the file's size, and the file's name once Zelfred passes one.

### Data
- `bills`: `mail` gains `kind`, `part`, `of` and `name`; `files` entries gain `size`. Bills kept before have none of these; the page treats them as one PDF from a company.

## [1.2.1] - 2026-11-27

### Fixed
- A flag (🇮🇳), a keycap (1️⃣) or a tagged flag (🏴󠁧󠁢󠁥󠁮󠁧󠁿) can be a folder's emoji, on the page and as a reaction. They were refused as "not one emoji".

## [1.2.0] - 2026-11-27

### Added

- Bills by mail (needs the "mail" permission, SDK 1.33.0): a mail with a PDF that comes to the person's Zelfred mail address from a sender they accepted is kept as a bill waiting for a folder, with the sender shown. If an earlier bill from the same sender was filed, the new one goes in the same folder. A mail with no PDF is not taken. Nothing is sent in WhatsApp for it; the weekly count includes it.

### Data

- `bills` can have `source: "mail"` and an optional `mail: { from, domain, label, id }`; a bill's `files` can be PDFs. A bill filed because of its sender has `tagged.how: "sender"`. Older bills are untouched.

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
