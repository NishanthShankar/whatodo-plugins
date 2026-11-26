import { definePlugin, type Json, type Kit, type Photo, type Sender } from "../../sdk";
import { BOOK_EMOJI, BOOKS, BOOKS_TOO, copy, KEPT, money, NEVER_A_BOOK, type BookLine } from "./copy";
import { bare, cleanGst, cleanName, MAX_NOTE, oneEmoji, readWords } from "./words";

/**
 * InvoiceHolder
 *
 * Bills, sorted by whose they are. A photo sent in the group is a bill; so is a picture put on
 * the page. A bill is filed under a book (a business or a person) by a reaction with the
 * book's emoji, a reply with the book's name, a caption, a poll, or a tap on the page. Zelfred
 * answers with reactions: 👍 when a bill is kept, changed to the book's emoji when it is filed.
 * Step 1 of three (docs/invoice-holder-brief.md in the whatodo repo): nothing is sent on to
 * anyone, and nothing is read from the picture.
 *
 * Storage
 *   books  key: book id   data: Book   sort: order
 *   bills  key: bill id   data: Bill   sort: when it came (ms)
 *   state  key: "taught"      1 once the first bill was explained
 *          key: "understood"  1 once a caption's reading was said back
 *          key: "asking"      { bill } while the first book's name is asked for
 *          key: "batch"       { id, at }: the pictures sent together a moment ago
 */

/** Books with an emoji, the ones that can be filed to from WhatsApp. More can exist on the page. */
export const EMOJI_BOOKS = 7;
/** Pictures sent within this of each other came together. */
export const BATCH_MS = 2 * 60_000;
/** The history kept per bill. */
const HISTORY = 30;
/** A poll holds 12 options; a reply that needs one asks about the first 12 books. */
const POLL = 12;

export type Kind = "business" | "person";

export interface Book {
  name: string;
  /** The emoji that files a bill here from WhatsApp; null for books past the seventh. */
  emoji: string | null;
  kind: Kind;
  /** A business's GST number; kept now, used once bills come by mail. */
  gst: string | null;
  order: number;
  at: number;
}

export type How = "reaction" | "reply" | "caption" | "poll" | "page" | "first";

export interface BillFile {
  id: string;
  /** "image/jpeg" today; a PDF once bills come by mail. */
  type: string;
}

export interface BillEvent {
  at: number;
  what: "came" | "filed" | "unfiled" | "changed";
  how?: How;
  book?: string | null;
  by?: string | null;
}

export interface Bill {
  /** Shape version, so the next steps add to it. */
  v: 1;
  /** Where it came from. "mail" comes in step 2. */
  source: "whatsapp" | "page";
  /** Its pictures. One today; a bill of several pages or a PDF later. */
  files: BillFile[];
  /** Who sent it (`sender.id`), even though only one person can today. */
  by: string | null;
  at: number;
  /** "to-tag" or "filed" today; "waiting", "sent" and "held" come with accountants. */
  state: "to-tag" | "filed";
  book: string | null;
  tagged: { how: How; by: string | null; at: number } | null;
  amount: number | null;
  /** The date on the bill, YYYY-MM-DD, when someone gave it. */
  billDate: string | null;
  note: string | null;
  /** Pictures sent together share this. */
  batch: string | null;
  history: BillEvent[];
}

interface BillRef {
  kind: "bill";
  id: string;
}
interface WhichRef {
  kind: "which";
  bill: string;
  books: string[];
}

const billRef = (id: string) => ({ kind: "bill", id }) as unknown as Json;
const isBillRef = (r: unknown): r is BillRef => !!r && typeof r === "object" && (r as BillRef).kind === "bill" && typeof (r as BillRef).id === "string";
const isWhichRef = (r: unknown): r is WhichRef =>
  !!r && typeof r === "object" && (r as WhichRef).kind === "which" && typeof (r as WhichRef).bill === "string" && Array.isArray((r as WhichRef).books);

async function allBooks(kit: Kit): Promise<{ id: string; book: Book }[]> {
  return (await kit.store.list<Book>("books")).map((r) => ({ id: r.key, book: r.data }));
}

const lines = (books: { book: Book }[]): BookLine[] => books.map(({ book }) => ({ emoji: book.emoji, name: book.name }));

const senderOf = (sender: Sender | undefined): string | null => sender?.id ?? null;

function withEvent(bill: Bill, e: BillEvent): Bill {
  return { ...bill, history: [...bill.history, e].slice(-HISTORY) };
}

/** The next free emoji for a new book, or null when seven books have one already. */
function nextEmoji(books: { book: Book }[]): string | null {
  const used = new Set(books.map((b) => (b.book.emoji ? bare(b.book.emoji) : null)).filter(Boolean));
  if (used.size >= EMOJI_BOOKS) return null;
  return BOOK_EMOJI.find((e) => !used.has(bare(e))) ?? null;
}

async function makeBook(kit: Kit, name: string, kind: Kind = "business", gst: string | null = null, emoji?: string | null): Promise<{ id: string; book: Book }> {
  const books = await allBooks(kit);
  const order = books.length ? Math.max(...books.map((b) => b.book.order)) + 1 : 0;
  const book: Book = { name, emoji: emoji === undefined ? nextEmoji(books) : emoji, kind, gst, order, at: kit.now };
  const id = kit.id();
  await kit.store.put("books", id, book as unknown as Json, order);
  return { id, book };
}

/** The mark Zelfred puts on a bill's message: the book's emoji when it is filed, 👍 otherwise. */
const markOf = (book: Book | null) => (book?.emoji ? book.emoji : KEPT);

/**
 * File a bill under a book (or take it out, with null), and show it in WhatsApp. `react` puts
 * the mark on the message being handled, for a bill that arrived in this very message.
 */
async function file(kit: Kit, id: string, bookId: string | null, how: How, by: string | null, opts: { react?: boolean } = {}): Promise<Bill | null> {
  const bill = await kit.store.get<Bill>("bills", id);
  if (!bill) return null;
  const book = bookId ? await kit.store.get<Book>("books", bookId) : null;
  if (bookId && !book) return bill;
  const next: Bill = withEvent(
    { ...bill, book: book ? bookId : null, state: book ? "filed" : "to-tag", tagged: book ? { how, by, at: kit.now } : null },
    { at: kit.now, what: book ? "filed" : "unfiled", how, book: book ? bookId : null, by },
  );
  await kit.store.put("bills", id, next as unknown as Json);
  if (bill.source === "whatsapp") {
    if (opts.react) kit.react(markOf(book));
    else kit.reactTo(billRef(id), markOf(book));
  }
  return next;
}

/** Ask which book, with a poll of the books. */
function askWhich(kit: Kit, bill: string, books: { id: string; book: Book }[]) {
  const shown = books.slice(0, POLL);
  if (shown.length < 2) return;
  kit.ask(
    copy.whichBook(),
    shown.map(({ book }) => `${book.emoji ? `${book.emoji} ` : ""}${book.name}`),
    { ref: { kind: "which", bill, books: shown.map((b) => b.id) } as unknown as Json, confirm: false },
  );
}

/** The pictures sent within a moment of each other share a batch. */
async function batchFor(kit: Kit): Promise<string> {
  const last = await kit.store.get<{ id: string; at: number }>("state", "batch");
  const id = last && kit.now - last.at <= BATCH_MS ? last.id : kit.id();
  await kit.store.put("state", "batch", { id, at: kit.now });
  return id;
}

/** A photo in the group: a bill. Its caption may say whose it is, how much, and a note. */
async function keepPhoto(kit: Kit, photo: Photo, text: string, sender: Sender | undefined) {
  const books = await allBooks(kit);
  const read = text ? readWords(text, books.map((b) => ({ id: b.id, name: b.book.name }))) : null;
  const id = kit.id();
  const by = senderOf(sender);
  const bill: Bill = {
    v: 1,
    source: "whatsapp",
    files: [{ id: photo.id, type: photo.type }],
    by,
    at: kit.now,
    state: "to-tag",
    book: null,
    tagged: null,
    amount: read?.amount ?? null,
    billDate: null,
    note: read?.note ?? null,
    batch: await batchFor(kit),
    history: [{ at: kit.now, what: "came", by }],
  };
  await kit.store.put("bills", id, bill as unknown as Json, kit.now);
  kit.mark(billRef(id));
  kit.react(KEPT);

  const firstTime = !(await kit.store.get("state", "taught"));
  if (firstTime) {
    await kit.store.put("state", "taught", 1);
    if (!books.length) {
      await kit.store.put("state", "asking", { bill: id });
      kit.send(copy.firstKeptAsk());
      return;
    }
    kit.send(copy.firstKept({ books: lines(books.filter((b) => b.book.emoji)) }));
  }

  if (!read) return;
  const filed = read.book ? await file(kit, id, read.book, "caption", by, { react: true }) : null;
  if (read.books.length > 1) askWhich(kit, id, books.filter((b) => read.books.includes(b.id)));
  // The first time a caption is read, say what was understood: the amount has no other receipt in WhatsApp.
  if ((filed || read.amount !== null) && !(await kit.store.get("state", "understood"))) {
    await kit.store.put("state", "understood", 1);
    const book = filed?.book ? (books.find((b) => b.id === filed.book)?.book ?? null) : null;
    kit.send(copy.understood({ emoji: book?.emoji ?? null, book: book?.name ?? null, amount: read.amount !== null ? money(read.amount, kit.person.currency ?? null) : null }));
  }
}

/** Their answer to "whose bill is this": the first book, and the bill filed there. */
async function firstBook(kit: Kit, billId: string | null, text: string, by: string | null): Promise<boolean> {
  const name = cleanName(text);
  if (!name) return false;
  await kit.store.delete("state", "asking");
  const books = await allBooks(kit);
  const same = books.find((b) => b.book.name.toLowerCase() === name.toLowerCase());
  const made = same ?? (await makeBook(kit, name));
  if (billId) await file(kit, billId, made.id, "first", by);
  if (same) kit.send(copy.sameName({ emoji: same.book.emoji, name: same.book.name }));
  else kit.send(copy.firstBook({ emoji: made.book.emoji ?? KEPT, name: made.book.name }));
  return true;
}

/** A reply to a bill: a book's name files it, a number is its amount, the rest is a note. */
async function onReply(kit: Kit, id: string, text: string, sender: Sender | undefined) {
  const bill = await kit.store.get<Bill>("bills", id);
  if (!bill) return kit.send(copy.gone());
  const by = senderOf(sender);
  const books = await allBooks(kit);
  const read = readWords(text, books.map((b) => ({ id: b.id, name: b.book.name })));
  // No books yet: a reply with words names the first one.
  if (!books.length && read.amount === null) {
    if (await firstBook(kit, id, text, by)) return;
    return kit.unsure(copy.unsure());
  }

  let next = bill;
  if (read.amount !== null || read.note) {
    next = withEvent({ ...bill, amount: read.amount ?? bill.amount, note: read.note ?? bill.note }, { at: kit.now, what: "changed", how: "reply", by });
    await kit.store.put("bills", id, next as unknown as Json);
  }
  if (read.book) await file(kit, id, read.book, "reply", by);
  else if (read.books.length > 1) askWhich(kit, id, books.filter((b) => read.books.includes(b.id)));
  else if (read.amount === null && !next.book) {
    // Words that name no book, on a bill not yet filed: ask which.
    if (books.length === 1) await file(kit, id, books[0].id, "reply", by);
    else askWhich(kit, id, books);
  }
  kit.react(KEPT);
}

async function listBooks(kit: Kit) {
  const books = await allBooks(kit);
  if (!books.length) return kit.send(copy.noBooks());
  const withEmoji = books.filter((b) => b.book.emoji);
  kit.send(copy.books({ books: lines(withEmoji), more: books.length - withEmoji.length }));
}

/** A bill as the page sees it. */
function shown(id: string, b: Bill) {
  return {
    id,
    source: b.source,
    files: b.files,
    at: b.at,
    state: b.state,
    book: b.book,
    tagged: b.tagged,
    amount: b.amount,
    billDate: b.billDate,
    note: b.note,
    batch: b.batch,
    history: b.history,
  };
}

async function removeBill(kit: Kit, id: string) {
  const bill = await kit.store.get<Bill>("bills", id);
  if (!bill) return;
  for (const f of bill.files) await kit.files.remove(f.id);
  await kit.store.delete("bills", id);
}

/** An emoji the page offers for a book, checked: one emoji, never a "done" one, not another book's. */
function checkEmoji(raw: unknown, books: { id: string; book: Book }[], self: string | null): string | null {
  if (raw === null || raw === "") return null;
  const e = typeof raw === "string" ? oneEmoji(raw) : null;
  if (!e) throw new Error("A folder's mark is one emoji.");
  if (NEVER_A_BOOK.some((n) => bare(n) === e)) throw new Error(`${e} means done in Zelfred, so it can't be a folder's mark. Pick another.`);
  const other = books.find((b) => b.id !== self && b.book.emoji && bare(b.book.emoji) === e);
  if (other) throw new Error(`${e} is already ${other.book.name}'s.`);
  const others = books.filter((b) => b.id !== self && b.book.emoji).length;
  if (others >= EMOJI_BOOKS) throw new Error("Seven folders have an emoji already. Take one off first.");
  return (raw as string).trim();
}

const kindOf = (raw: unknown): Kind => (raw === "person" ? "person" : "business");

function amountOf(raw: unknown): number | null {
  if (raw === null || raw === "" || raw === undefined) return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[₹,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0 || n >= 1e10) throw new Error("An amount is a number, like 1200 or 450.50.");
  return Math.round(n * 100) / 100;
}

function dateOf(raw: unknown): string | null {
  if (raw === null || raw === "" || raw === undefined) return null;
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error("A date is like 2026-11-26.");
  return raw;
}

const noteOf = (raw: unknown): string | null => (typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, MAX_NOTE) || null : null);

export default definePlugin({
  id: "invoice-holder",
  version: "1.0.0",
  sdk: "1",
  name: "InvoiceHolder",
  icon: "📑",
  tagline: "Every bill in one place, sorted by whose it is.",
  description:
    "Send a photo of any bill to its WhatsApp group and it is kept. React with an emoji to file it under one of your businesses or a person, or reply with the name. Every bill, by month and by business, is on your page.",
  groupName: copy.groupName(),
  price: 0,
  // Tier 2: it stores a photo for every bill.
  tier: 2,
  permissions: ["photos"],
  // Being tried out first: only people Zelfred allows can add it.
  unlisted: true,
  listing: {
    title: "Invoice and Bill Organiser for Small Businesses | Zelfred",
    description: "Photograph a bill, send it to a WhatsApp chat, and tap an emoji to file it under the right business. Every invoice sorted by month and by business.",
    h1: "Keep every bill, sorted by business",
  },
  welcome: copy.welcome(),
  help: copy.help(),

  async onMessage(event, kit) {
    const text = event.text.trim().replace(/\s+/g, " ");
    if (event.photos?.length) {
      for (const photo of event.photos) await keepPhoto(kit, photo, text, event.sender);
      return;
    }
    if (!text) return;
    if (isBillRef(event.quotedRef)) return onReply(kit, event.quotedRef.id, text, event.sender);
    if (text.toLowerCase() === BOOKS || text.toLowerCase() === BOOKS_TOO) return listBooks(kit);

    // The first book's name, asked for after the first bill.
    const asking = await kit.store.get<{ bill: string }>("state", "asking");
    if (asking) {
      if ((await allBooks(kit)).length) await kit.store.delete("state", "asking");
      else if (!oneEmoji(text) && (await firstBook(kit, asking.bill, text, senderOf(event.sender)))) return;
    }
    kit.unsure(copy.unsure());
  },

  /**
   * A reaction on a bill's message: a book's emoji files it there, the last one counts, and
   * taking it off unfiles a bill a reaction had filed. Done-marks and unknown emoji change nothing.
   */
  async onReaction(event, kit) {
    if (!isBillRef(event.ref)) return;
    const bill = await kit.store.get<Bill>("bills", event.ref.id);
    if (!bill) return;
    const by = senderOf(event.sender);
    if (!event.emoji) {
      if (bill.tagged?.how === "reaction") await file(kit, event.ref.id, null, "reaction", by);
      return;
    }
    const e = bare(event.emoji);
    if (NEVER_A_BOOK.some((n) => bare(n) === e)) return;
    const book = (await allBooks(kit)).find((b) => b.book.emoji && bare(b.book.emoji) === e);
    if (!book || bill.book === book.id) return;
    await file(kit, event.ref.id, book.id, "reaction", by);
  },

  async onAnswer(event, kit) {
    if (!isWhichRef(event.ref)) return;
    kit.close(event.ref as unknown as Json);
    const bookId = event.ref.books[event.choice];
    if (!bookId) return;
    await file(kit, event.ref.bill, bookId, "poll", senderOf(event.sender));
  },

  web: {
    lockable: true,
    async load(kit, args) {
      const books = await allBooks(kit);
      const bills = (await kit.store.list<Bill>("bills")).reverse();
      const limit = Math.min(2000, Math.max(1, Number(args.limit) || 2000));
      const counts = new Map<string, number>();
      for (const { data } of bills) if (data.book) counts.set(data.book, (counts.get(data.book) ?? 0) + 1);
      return {
        currency: kit.person.currency,
        emojiBooks: EMOJI_BOOKS,
        suggest: nextEmoji(books),
        books: books.map(({ id, book }) => ({ id, ...book, count: counts.get(id) ?? 0 })),
        toTag: bills.filter((b) => b.data.state === "to-tag").length,
        total: bills.length,
        bills: bills.slice(0, limit).map((b) => shown(b.key, b.data)),
      } as unknown as Json;
    },
    actions: {
      /** File bills under a book, or take them out with `book: null`. Shows in WhatsApp too. */
      async tag(kit, args) {
        const ids = Array.isArray(args.ids) ? args.ids.filter((x): x is string => typeof x === "string") : [String(args.id ?? "")];
        const book = typeof args.book === "string" && args.book ? args.book : null;
        if (book && !(await kit.store.get("books", book))) throw new Error("That folder isn't here any more.");
        for (const id of ids) await file(kit, id, book, "page", kit.person.id ?? null);
      },
      /** Change a bill's amount, date or note. Leave a field out to keep it. */
      async edit(kit, args) {
        const id = String(args.id ?? "");
        const bill = await kit.store.get<Bill>("bills", id);
        if (!bill) throw new Error("That bill isn't here any more.");
        const next: Bill = { ...bill };
        if ("amount" in args) next.amount = amountOf(args.amount);
        if ("billDate" in args) next.billDate = dateOf(args.billDate);
        if ("note" in args) next.note = noteOf(args.note);
        await kit.store.put("bills", id, withEvent(next, { at: kit.now, what: "changed", how: "page", by: kit.person.id ?? null }) as unknown as Json);
      },
      /** Bills added on the page: one per picture, the pictures added together in one batch. */
      async add(kit, args) {
        const photos = (Array.isArray(args.photos) ? args.photos : [args.photo]).filter((x): x is string => typeof x === "string");
        const found: { id: string; type: string }[] = [];
        for (const p of photos) {
          const f = await kit.files.get(p);
          if (f) found.push({ id: p, type: f.type });
        }
        if (!found.length) throw new Error("Add a picture of the bill first.");
        const book = typeof args.book === "string" && args.book && (await kit.store.get("books", args.book)) ? args.book : null;
        const amount = found.length === 1 ? amountOf(args.amount) : null;
        const billDate = dateOf(args.billDate);
        const note = noteOf(args.note);
        const batch = found.length > 1 ? kit.id() : null;
        const by = kit.person.id ?? null;
        const ids: string[] = [];
        for (const f of found) {
          const id = kit.id();
          const history: BillEvent[] = [{ at: kit.now, what: "came", how: "page", by }];
          if (book) history.push({ at: kit.now, what: "filed", how: "page", book, by });
          const bill: Bill = {
            v: 1,
            source: "page",
            files: [f],
            by,
            at: kit.now,
            state: book ? "filed" : "to-tag",
            book,
            tagged: book ? { how: "page", by, at: kit.now } : null,
            amount,
            billDate,
            note,
            batch,
            history,
          };
          await kit.store.put("bills", id, bill as unknown as Json, kit.now);
          ids.push(id);
        }
        return { ids };
      },
      /** Remove a bill and its pictures. The page asks first. */
      async remove(kit, args) {
        await removeBill(kit, String(args.id ?? ""));
      },
      async addBook(kit, args) {
        const name = typeof args.name === "string" ? cleanName(args.name) : null;
        if (!name) throw new Error("A folder needs a name.");
        const books = await allBooks(kit);
        if (books.some((b) => b.book.name.toLowerCase() === name.toLowerCase())) throw new Error(`There is a folder called ${name} already.`);
        const emoji = "emoji" in args ? checkEmoji(args.emoji, books, null) : undefined;
        if (args.gst && !cleanGst(args.gst)) throw new Error("A GST number has 15 letters and digits.");
        const made = await makeBook(kit, name, kindOf(args.kind), cleanGst(args.gst), emoji);
        return { id: made.id };
      },
      /** Change a book. `emoji: null` takes its emoji off. A new emoji changes the mark on its bills in WhatsApp. */
      async editBook(kit, args) {
        const id = String(args.id ?? "");
        const book = await kit.store.get<Book>("books", id);
        if (!book) throw new Error("That folder isn't here any more.");
        const books = await allBooks(kit);
        const next: Book = { ...book };
        if (typeof args.name === "string") {
          const name = cleanName(args.name);
          if (!name) throw new Error("A folder needs a name.");
          if (books.some((b) => b.id !== id && b.book.name.toLowerCase() === name.toLowerCase())) throw new Error(`There is a folder called ${name} already.`);
          next.name = name;
        }
        if ("kind" in args) next.kind = kindOf(args.kind);
        if ("gst" in args) {
          if (args.gst && !cleanGst(args.gst)) throw new Error("A GST number has 15 letters and digits.");
          next.gst = cleanGst(args.gst);
        }
        if ("emoji" in args) next.emoji = checkEmoji(args.emoji, books, id);
        await kit.store.put("books", id, next as unknown as Json);
        if (next.emoji !== book.emoji) {
          for (const { key, data } of await kit.store.list<Bill>("bills")) if (data.book === id && data.source === "whatsapp") kit.reactTo(billRef(key), markOf(next));
        }
      },
      /** Remove a book. Its bills stay, unfiled. The page asks first. */
      async removeBook(kit, args) {
        const id = String(args.id ?? "");
        if (!(await kit.store.get("books", id))) return;
        for (const { key, data } of await kit.store.list<Bill>("bills")) if (data.book === id) await file(kit, key, null, "page", kit.person.id ?? null);
        await kit.store.delete("books", id);
      },
    },
  },
});
