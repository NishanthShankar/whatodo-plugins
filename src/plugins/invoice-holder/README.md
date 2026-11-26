# 📑 InvoiceHolder

Every bill in one place, sorted by whose it is. Send a photo of a bill to its WhatsApp group, "📑 InvoiceHolder", and it is kept. React to it with an emoji to file it under one of your businesses or a person (a "book"), or reply with the book's name. The page shows what is still to file, every bill by month, and each book.

Step 1 of three (`docs/invoice-holder-brief.md` in the `whatodo` repo): pictures and filing. Bills by mail come next; sending bills on to an accountant's group comes last. Nothing is read from the picture, and nothing is sent to anyone.

## First five minutes

Written to `docs/plugin-onboarding.md` in the `whatodo` repo. The lines are drafts until og-copy-bot has read them.

| Field | For InvoiceHolder |
|---|---|
| The promise | Every bill in one place, sorted by whose it is. |
| The aside | None yet. |
| The first thing to send | A photo of any bill within reach. |
| The first time line | When the first photo is kept: "Kept. A 👍 from me means a bill is safe here, and an emoji from you files it. Whose bill is this? Send me the name: your business, your home, or a person." |
| The moment it clicks | Inside the first minutes: they name the first book, my 👍 on the photo turns into its emoji, and the bill is on the page under that book. The next bill they react to with that emoji does the same. |
| The setup steps | None beyond adding the app. |
| What to learn | The first book's name, from their answer. Nothing goes to `kit.learn`. |

The welcome asks for nothing. Each first-time line is said once per install.

1. **The welcome** names the one thing to send: a photo of a bill.
2. **The first bill** gets the 👍 and the first time line with the question. When books were already made on the page, it lists them with their emoji instead of asking.
3. **The answer** (typed, or as a reply to the bill) is the first book. It gets the next free emoji, the bill is filed there, and one line says which emoji it is.
4. **The first caption** that files a bill or gives an amount gets one line saying what was read, so a wrong amount can be fixed on the page.

## Commands

| Message | What happens |
|---|---|
| A photo | Kept as a bill. 👍. Photos sent within two minutes of each other are one batch, each its own bill. |
| A photo with a caption | As above; the caption is read: a book's name files it (my mark becomes its emoji), a number is its amount, the rest is a note. |
| A reaction with a book's emoji on a bill | Filed under that book; my 👍 becomes the book's emoji. The last reaction counts. |
| Taking that reaction off | Unfiled; my mark goes back to 👍. Only for a bill a reaction had filed. |
| 👍 ✅ 👌 🙏 ❌ on a bill | Nothing. These never stand for a book. |
| A reply to a bill with a book's name | Filed there. 👍 on the reply. |
| A reply with an amount (`1200`, `₹1,250.50`) | Its amount. 👍. |
| A reply that names two books, or none | One poll: "Which book is this bill for?" with the books. The words are kept as its note. |
| `books` | The books and their emoji. |
| The first book's name, after the first bill | The first book, and that bill filed there. |
| `help` | The command list. |
| Anything else | Zelfred's intent model gets it; otherwise "I keep photos of bills here…". |

**Reading a caption or a reply.** A book is named by its whole name or a whole word of it; a whole name beats part of one ("acme" files to Acme, not to Acme Retail). The amount is the one number written as money (₹, rs, a decimal, a comma group, `/-`), or the only number there is; with two bare numbers ("acme 12 nov 450") there is no amount and both stay in the note.

## Data

| Collection | Key | Data | Sort |
|---|---|---|---|
| `books` | book id | `{ name, emoji, kind: "business" \| "person", gst, order, at }` | order |
| `bills` | bill id | `{ v: 1, source: "whatsapp" \| "page", files: [{ id, type }], by, at, state: "to-tag" \| "filed", book, tagged: { how, by, at }, amount, billDate, note, batch, history }` | when it came |
| `state` | `taught`, `understood` | `1` once said | |
| `state` | `asking` | `{ bill }` while the first book's name is asked for | |
| `state` | `batch` | `{ id, at }`: the last batch of pictures | |

A bill is shaped for the next steps: `source` will also be `"mail"`, `files` will hold several pages or a PDF, and `state` will also be `"waiting"`, `"sent"` and `"held"`. `by` is the sender's id. `history` keeps the last 30 changes: came, filed, unfiled, changed, with how and by whom.

## Web page

`load` returns `{ currency, emojiBooks: 7, suggest, books: [{ id, name, emoji, kind, gst, order, at, count }], toTag, total, bills: [...] }`, bills newest first, each with `{ id, source, files, at, state, book, tagged, amount, billDate, note, batch, history }`. `suggest` is the emoji a new book would get.

| Action | Arguments | Does |
|---|---|---|
| `tag` | `{ ids, book }` | Files bills under `book`, or unfiles them with `book: null`. My mark on each in WhatsApp follows. |
| `edit` | `{ id, amount?, billDate?, note? }` | Changes a bill. A field left out stays; `null` clears it. |
| `add` | `{ photos: [id], book?, amount?, billDate?, note? }` | A bill per picture added on the page; several are one batch. `amount` only for a single picture. |
| `remove` | `{ id }` | Removes a bill and its pictures. The page asks first. |
| `addBook` | `{ name, kind?, gst?, emoji? }` | A new book; it gets the next free emoji unless one is given (or `null`). |
| `editBook` | `{ id, name?, kind?, gst?, emoji? }` | Changes a book. A new emoji changes my mark on its bills in WhatsApp. |
| `removeBook` | `{ id }` | Removes a book; its bills stay, unfiled. The page asks first. |

The page is lockable.

## Privacy

It reads only its own group: photos of bills and what is typed there. The pictures are kept by Zelfred, not by the plugin, and removing a bill removes its pictures. A caption or a reply is read by the plugin's own code; only a typed message it can't read at all goes to Zelfred's intent model. It stores books (names, emoji, a GST number if given) and bills (their picture ids, amount, date, note and history). Nothing is sent to anyone, and nothing from a bill is passed to what Zelfred knows about the person.

## Not built yet

- Bills by mail, and PDFs: a PDF sent in the group never reaches a plugin, so nothing can be said about it yet.
- The books in the group's description: a plugin can't write its group's description today, so `books` lists them.
- Several pictures joined into one bill, duplicates, suggested books, exports, reminders, sending to an accountant.
