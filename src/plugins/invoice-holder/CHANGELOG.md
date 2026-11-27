# Changelog: InvoiceHolder

All notable changes to this plugin. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## [1.14.0] - 2026-11-27

### Fixed
- The nightly catch-up retried a bill whose reading failed, so it spent the day's reads on the same bills. Only a real reading by an older reader earns another try.

### Changed
- The catch-up reads at most 10 a day, and none once 10 reads are spent, so the person's own "Read again" always has some.
- Reads asked are counted per day. A failed answer once 20 are spent is shown as the day's limit ("try tomorrow"), and what the bill said before stays.

### Data
- `state.reads` ({ day, n }); `bills.unread` may be "limit".

## [1.13.0] - 2026-11-27

### Added
- An invoice and its receipt in one mail, with the same amount and the same invoice number, are one bill (the owner): the receipt is its second file, so the payment counts once. A file named like a receipt is the receipt. Bills kept apart before are joined once on upgrade, unless the receipt has a name, a note or another folder of the person's own.

### Data
- `bills.files[].role`: "receipt".

## [1.12.0] - 2026-11-27

### Added
- A mailed bill keeps when its mail was sent (SDK 1.39.0, `sent`; for a forward, the original's date), so the page orders bills as a mailbox would.

### Changed
- A bill with a GST number whose currency the reader didn't find is in rupees (an Indian printer's bill showed as dollars).
- Filing by the Gmail account a forward came through needs 3 bills, all filed to one folder, not 2: one personal Gmail carries many folders' bills.

### Data
- `bills`: `mail.sent`.

## [1.11.0] - 2026-11-27

### Added
- Filed by the address a bill came through, first of all (the owner: "which email it came from ... thats a important what to auto file"):
  1. Its +label ("maker+nverse@"): once the person files one bill sent to a label, that label's bills go to the same folder unasked. Settings shows each label's folder with Stop.
  2. The Gmail account a forward came through, when at least 2 of its filed bills all went to one folder.
  3. Then the GST number, the sender, the seller's name and jev's guess, as before.

### Data
- New collection `labels` (label to folder). `tagged.how` may be "label" or "mailbox".

## [1.10.1] - 2026-11-27

### Fixed
- The nightly catch-up keeps its one try for a bill only when the reading came from a reader that knows what a bill is (SDK 1.37 or later); before that reader is live, it tries again the next night.

## [1.10.0] - 2026-11-27

### Added
- The company domain a PDF prints (SDK 1.38.0, `site`) is kept with the bill, to name it; never to trust or file it.
- Bills forwarded before Zelfred could tell the company are read again by Zelfred itself, 15 a day at 3am, once each, with no message: so old forwards get their names without the person asking.

### Data
- `bills`: `facts.site`; `caught` (when the catch-up read it).

## [1.9.0] - 2026-11-27

### Added
- Not bills (SDK 1.37.0): a PDF Zelfred's reader calls "not-bill" (a ticket, a statement, insurance papers, a quotation, a payslip) is set aside. It is kept, in "Not bills", and never in To file, the folders, the month's line, the Sunday line or a note question; one tap brings it back. "unsure" stays a bill.
- "Not a bill" by hand. Per sender: brought back twice stops setting theirs aside; set aside by hand twice sets theirs aside from then on. Counts of each, with no text, for measuring the reader.
- A forward's original sender's domain (SDK 1.37.0) is kept to name the bill, never to trust it, and is who a forwarded bill is from when learning what to set aside.
- "Read again" re-sorts a bill unless the person chose.

### Data
- `bills`: `aside` ({ sort, by, at } or null), `mail.forwarded`; history may say "aside" or "back". New collection `sorting` (per sender domain: back, hand); `state.notBills` counts.

## [1.8.0] - 2026-11-27

### Added
- "Read again" on a bill with a PDF, uploaded or mailed (SDK 1.36.0, `kit.files.read`): Zelfred's bill reader reads it once more. What the bill says fills the amount, currency and date only where the person hasn't changed them, replaces what an earlier reading said, and files a bill with no folder by its GST number or seller, else a marked guess. When it can't, the page says why: locked, a picture, or not read.
- "Open in Gmail" on a mailed bill, from the mail's own Message-ID, built by BillKeeper and never shown as text. Only for mail that came after this release.

### Data
- `bills`: `reading` (when Read again was asked), `unread` ("locked", "picture", "failed" or null), `mail.msg` (the Message-ID); history may say "read".

## [1.7.0] - 2026-11-27

### Added
- What Zelfred read inside a mailed PDF (SDK 1.35.0) is kept on the bill as "the bill says": its amount and currency and the date on it fill those fields until the person changes them; its number, due date, GST numbers and seller are kept as facts. A due date never becomes a reminder.
- A mailed bill's folder, first that fits: a GST number on it that is exactly one folder's; the folder the last bill from that sender went to; the seller's name against folder names, in our own code; only then jev, given the seller's name in letters alone, never an amount, date or number. jev's pick is marked as a guess, is undone in one tap on the page, and never moves a bill the person filed meanwhile.
- The "sort" permission, for that last step.

### Data
- `bills`: `facts` (amount, currency, date, due, number, gstins, seller as found); `currency` may be any ISO code the reader found; `tagged.how` may be "gstin", "seller" or "guess".

## [1.6.0] - 2026-11-27

### Added
- An amount can be in rupees or dollars (the owner, 2026-11-27: "it can be USD or Rs"). A caption or reply with $, usd or dollars is in dollars; ₹, rs or /- in rupees; a bare number in the person's own currency. The page can change it. The month's line gives one sum per currency and never adds them together.

### Changed
- The first note question says sorry, once and lightly, that BillKeeper can't read a bill yet (voice 10, the owner's picks: "apologetic but not sad"). The Sunday line says the bills are kept either way.

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
