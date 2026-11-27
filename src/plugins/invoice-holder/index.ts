import { definePlugin, type Json, type Kit, type MailEvent, type Photo, type Sender } from "../../sdk";
import { BOOK_EMOJI, BOOKS, BOOKS_TOO, MAIL_SUMMARY_MANY, MAIL_SUMMARY_ONE, NO_NOTE, copy, KEPT, money, NEVER_A_BOOK, type BookLine } from "./copy";
import { bare, cleanGst, cleanName, CURRENCIES, MAX_NAME, MAX_NOTE, oneEmoji, readWords, type Currency } from "./words";

/**
 * BillKeeper (id "invoice-holder"; called InvoiceHolder until 1.1.0)
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
 *          key: "weekly"      the day the last "waiting" reminder went
 *          key: "month"       the month (YYYY-MM) the last monthly line was about
 */

/** The weekly reminder goes on this day (0 Sunday) at REMIND_HOUR, when bills wait for a folder. */
export const REMIND_DAY = 0;
export const REMIND_HOUR = 10;
/** The month's line goes on the 1st at this hour, about the month before. */
export const MONTH_HOUR = 9;
/** A plain line this soon after the note question is its answer, while it is the one open question. */
export const NOTE_WINDOW_MS = 10 * 60_000;
/** A mail older than this when the app hears of it (the catch-up of held mail) is never asked about. */
export const CATCHUP_MS = 60 * 60_000;
/** No note questions from NIGHT_FROM to NIGHT_TO, the person's time; they are not held for later either (z-research-bot: that steps round the cap). */
export const NIGHT_FROM = 22;
export const NIGHT_TO = 8;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Day of the week of a YYYY-MM-DD, 0 for Sunday, without a Date. */
export function weekday(day: string): number {
  let [y, m, d] = day.split("-").map(Number);
  if (m < 3) {
    m += 12;
    y -= 1;
  }
  const k = y % 100;
  const j = Math.floor(y / 100);
  const h = (d + Math.floor((13 * (m + 1)) / 5) + k + Math.floor(k / 4) + Math.floor(j / 4) + 5 * j) % 7;
  return (h + 6) % 7;
}

/** The month before a YYYY-MM-DD, as YYYY-MM. */
function monthBefore(day: string): string {
  const [y, m] = day.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

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

export type How = "reaction" | "reply" | "caption" | "poll" | "page" | "first" | "sender" | "gstin" | "seller" | "guess";

/** What Zelfred read inside a mailed PDF (SDK 1.35.0): "the bill says", never stated as true. Since 1.7.0. */
export interface BillFacts {
  amount?: number;
  currency?: string;
  date?: string;
  due?: string;
  number?: string;
  gstins?: string[];
  seller?: string;
}

export interface BillFile {
  id: string;
  /** "image/jpeg" today; a PDF once bills come by mail. */
  type: string;
  /** Bytes, when known (mailed PDFs, since 1.3.0). */
  size?: number;
}

export interface BillEvent {
  at: number;
  what: "came" | "filed" | "unfiled" | "changed" | "read";
  how?: How;
  book?: string | null;
  by?: string | null;
}

export interface Bill {
  /** Shape version, so the next steps add to it. */
  v: 1;
  /** Where it came from. "mail": sent to the person's Zelfred mail address (since 1.2.0). */
  source: "whatsapp" | "page" | "mail";
  /** Its pictures, or its PDFs for a bill that came by mail. */
  files: BillFile[];
  /** For a bill that came by mail: who sent it (as Zelfred proved it), the person's label and Zelfred's mail id. */
  mail?: {
    from: string;
    domain: string;
    label: string;
    id: string;
    /** "mailbox" when it came from the person's own address: a forward. Since 1.3.0. */
    kind?: "company" | "mailbox";
    /** Which of the mail's PDFs this is, and how many it brought; each PDF is its own bill. Since 1.3.0. */
    part?: number;
    of?: number;
    /** The PDF's file name as sent, when Zelfred passes one. Since 1.3.0. */
    name?: string | null;
    /** The mail's Message-ID, only to link back to it in Gmail; never shown as text, sent or logged. Since 1.8.0. */
    msg?: string | null;
  } | null;
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
  /** The amount's currency; null for the person's own (or rupees). Since 1.6.0; any ISO code the reader found since 1.7.0. */
  currency?: string | null;
  /** What the PDF reader found in this bill, when it could read it. Since 1.7.0. */
  facts?: BillFacts | null;
  /** When "Read again" was asked and not answered yet. Since 1.8.0. */
  reading?: number | null;
  /** Why the last reading found nothing: "locked", "picture" or "failed"; null when it read. Since 1.8.0. */
  unread?: "locked" | "picture" | "failed" | null;
  /** The bill's short name, its title on the page; apart from the note since 1.5.0. */
  name?: string | null;
  /** Pictures sent together share this. */
  batch: string | null;
  history: BillEvent[];
  /** When BillKeeper asked for a note on this bill in WhatsApp (mailed bills, since 1.4.0). */
  asked?: number | null;
  /** How the note question was answered: "no" when they said no note. Since 1.4.0. */
  noteBy?: "now" | "reply" | "no" | null;
}

/** Whether to ask for a note when a sender's bill comes: "auto" follows the routine rules, the page can force either way. */
export interface SenderPref {
  ask: "auto" | "yes" | "no";
}

interface BillRef {
  kind: "bill";
  id: string;
}
/** The note question about the bills of one mail. Its own kind: an answer is a note, never read for a folder or an amount. */
interface NoteRef {
  kind: "note";
  bills: string[];
}
const isNoteRef = (r: unknown): r is NoteRef => !!r && typeof r === "object" && (r as NoteRef).kind === "note" && Array.isArray((r as NoteRef).bills);

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

/**
 * A mail to the person's Zelfred mail address with a PDF: a bill, waiting for a folder like a photo. If an earlier bill
 * from the same sender was filed, this one goes in the same folder. Nothing is sent in WhatsApp: the weekly count
 * names the bills waiting (the platform's cap on lines for mail is not built yet). A mail with no PDF is not a bill.
 */
/** "monid.com" as a name in a question: "Monid". Never the address or the domain itself (WhatsApp would make it a link). */
function brandOf(domain: string): string {
  const parts = domain.toLowerCase().split(".").filter((p) => p && !/^(?:www|mail|email|e|billing|bills|invoice|invoices|noreply|no-reply|alerts|info|accounts|notify)$/.test(p));
  const first = parts[0] ?? domain;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

const isNoNote = (text: string) => NO_NOTE.includes(text.toLowerCase().replace(/[.!\s]+$/g, "").trim());

/**
 * A sender whose bills are routine, so no note is asked for (my default, not the owner's ruling; see the brief):
 * three earlier mails each 25 to 35 days after the one before with no note on any, or the last two questions for
 * this sender left with no note. A note on any of the sender's bills breaks the second rule.
 */
function routine(all: { data: Bill }[], from: string): boolean {
  const mine = all.map((r) => r.data).filter((b) => b.source === "mail" && b.mail?.from === from);
  // One entry per mail, its first PDF.
  const mails = [...new Map(mine.map((b) => [b.mail!.id, b])).values()].sort((a, b) => a.at - b.at);
  const notedAny = (id: string) => mine.some((b) => b.mail?.id === id && b.note);
  const last = mails.slice(-3);
  if (last.length === 3 && !last.some((b) => notedAny(b.mail!.id))) {
    const day = 24 * 3600_000;
    const gaps = [last[1].at - last[0].at, last[2].at - last[1].at];
    if (gaps.every((g) => g >= 25 * day && g <= 35 * day)) return true;
  }
  const asked = mails.filter((b) => b.asked).slice(-2);
  return asked.length === 2 && asked.every((b) => !notedAny(b.mail!.id));
}

const night = (kit: Kit) => {
  const h = kit.time.hour(kit.now);
  return h >= NIGHT_FROM || h < NIGHT_TO;
};

/** Ask for a note on one mail's bills, as one message that carries their ref. */
async function askNote(kit: Kit, ids: string[], who: string | null) {
  const first = !(await kit.store.get("state", "noteFirst"));
  if (first) await kit.store.put("state", "noteFirst", 1);
  kit.send((first ? copy.noteAskFirst : copy.noteAsk)({ who, count: ids.length }), { ref: { kind: "note", bills: ids } as unknown as Json });
  for (const id of ids) {
    const b = await kit.store.get<Bill>("bills", id);
    if (b) await kit.store.put("bills", id, { ...b, asked: kit.now } as unknown as Json);
  }
  // One open question takes a plain line; two at once take none, a reply is needed (my default).
  const open = await kit.store.get<{ bills: string[]; at: number } | { none: true; at: number }>("state", "noteOpen");
  if (open && kit.now - open.at <= NOTE_WINDOW_MS) await kit.store.put("state", "noteOpen", { none: true, at: kit.now });
  else await kit.store.put("state", "noteOpen", { bills: ids, at: kit.now });
}

/** Whether a mail's bills get the note question now, later (night), or never. */
async function noteQuestion(kit: Kit, e: MailEvent, ids: string[]) {
  if (kit.now - e.at > CATCHUP_MS) return;
  const own = e.from.kind === "mailbox";
  if (!own) {
    const pref = (await kit.store.get<SenderPref>("senders", e.from.address.toLowerCase()))?.ask ?? "auto";
    if (pref === "no") return;
    if (pref === "auto") {
      const all = (await kit.store.list<Bill>("bills")).filter((r) => !ids.includes(r.key));
      if (routine(all, e.from.address)) return;
    }
  }
  // The platform caps lines caused by mail (SDK 1.34.0); when none are left for this mail, ask nothing and open no
  // window, or a plain line would become a note on a bill the person was never asked about.
  if (e.lines !== undefined && e.lines <= 0) return;
  if (night(kit)) return;
  await askNote(kit, ids, own ? null : brandOf(e.from.domain));
}

/** Their answer to a note question: the whole text is the note, or "no". */
async function takeNote(kit: Kit, ids: string[], text: string, how: "now" | "reply", by: string | null) {
  await kit.store.delete("state", "noteOpen");
  const no = isNoNote(text);
  const note = text.replace(/\s+/g, " ").trim().slice(0, MAX_NOTE);
  let any = false;
  for (const id of ids) {
    const b = await kit.store.get<Bill>("bills", id);
    if (!b) continue;
    any = true;
    const next: Bill = no ? { ...b, noteBy: "no" } : withEvent({ ...b, note, noteBy: how }, { at: kit.now, what: "changed", how: "reply", by });
    await kit.store.put("bills", id, next as unknown as Json);
  }
  if (!any) return kit.send(copy.gone());
  // The first note gets words, once; after that the 👍 is the whole answer. A reaction or a reply, never both.
  if (!no && !(await kit.store.get("state", "noteTaught"))) {
    await kit.store.put("state", "noteTaught", 1);
    return kit.send(copy.noteTaught());
  }
  kit.react(KEPT);
}

/** The facts the reader found in one file, or null when it couldn't read it. */
function factsOf(f: MailEvent["files"][number]): BillFacts | null {
  return factsFrom((f as { read?: unknown }).read);
}

function factsFrom(read: unknown): BillFacts | null {
  const r = read as ({ state?: string } & BillFacts) | undefined;
  if (!r || r.state !== "read") return null;
  const facts: BillFacts = {};
  if (typeof r.amount === "number" && Number.isFinite(r.amount) && r.amount >= 0) facts.amount = r.amount;
  if (typeof r.currency === "string" && /^[A-Z]{3}$/.test(r.currency)) facts.currency = r.currency;
  for (const k of ["date", "due"] as const) if (typeof r[k] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r[k]!)) facts[k] = r[k];
  if (typeof r.number === "string" && r.number.trim()) facts.number = r.number.trim().slice(0, 40);
  if (Array.isArray(r.gstins)) facts.gstins = r.gstins.filter((g) => typeof g === "string" && /^\d{2}[A-Z0-9]{13}$/.test(g)).slice(0, 4);
  if (typeof r.seller === "string" && r.seller.trim()) facts.seller = r.seller.replace(/\s+/g, " ").trim().slice(0, 80);
  return facts;
}

/** The seller's name as jev may see it: letters and spaces only, 60 characters at most (z-research-bot). */
const lettersOnly = (s: string) => s.replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);

/**
 * Where a mailed bill goes, first that fits (z-research-bot, 2026-11-27): a GST number on it that is exactly one
 * folder's; the folder the last bill from this proven sender went to (never for a forward); the seller's name against
 * folder names, in our own code. Null when none fits; jev is asked after, as a guess.
 */
function folderFor(books: { id: string; book: Book }[], all: { data: Bill }[], e: MailEvent | null, facts: BillFacts | null): { book: string; how: How } | null {
  const gst = new Set(facts?.gstins ?? []);
  const byGst = books.filter((b) => b.book.gst && gst.has(b.book.gst));
  if (byGst.length === 1) return { book: byGst[0].id, how: "gstin" };
  if (e && e.from.kind !== "mailbox") {
    const earlier = all.filter((r) => r.data.source === "mail" && r.data.mail?.from === e.from.address && r.data.book).sort((a, b) => b.data.at - a.data.at)[0];
    if (earlier?.data.book && books.some((b) => b.id === earlier.data.book)) return { book: earlier.data.book, how: "sender" };
  }
  if (facts?.seller) {
    const read = readWords(facts.seller, books.map((b) => ({ id: b.id, name: b.book.name })));
    if (read.book) return { book: read.book, how: "seller" };
  }
  return null;
}

async function keepMail(kit: Kit, e: MailEvent): Promise<"took" | "not-for-me"> {
  if (!e.files.length) return "not-for-me";
  const all = await kit.store.list<Bill>("bills");
  if (all.some((r) => r.data.mail?.id === e.id)) return "took";
  const books = await allBooks(kit);
  // Each PDF is its own bill, so each is filed on its own; "2 of 3" keeps them together on the page.
  const n = e.files.length;
  const ids: string[] = [];
  const unfiled: { id: string; seller: string }[] = [];
  for (let i = 0; i < n; i++) {
    const f = e.files[i];
    const name = typeof (f as { name?: unknown }).name === "string" ? ((f as { name?: string }).name ?? "").slice(0, 120) || null : null;
    const facts = factsOf(f);
    const to = folderFor(books, all, e, facts);
    const bill: Bill = {
      v: 1,
      source: "mail",
      files: [{ id: f.id, type: f.type, size: f.size }],
      mail: { from: e.from.address, domain: e.from.domain, label: e.label, id: e.id, kind: e.from.kind, part: i + 1, of: n, name, msg: typeof e.messageId === "string" ? e.messageId.slice(0, 200) || null : null },
      by: null,
      at: e.at,
      state: to ? "filed" : "to-tag",
      book: to?.book ?? null,
      tagged: to ? { how: to.how, by: null, at: kit.now } : null,
      // What the bill says, kept as the bill's own until the person changes it.
      amount: facts?.amount ?? null,
      currency: facts?.amount !== undefined ? (facts?.currency ?? null) : null,
      billDate: facts?.date ?? null,
      note: null,
      facts,
      batch: n > 1 ? `mail:${e.id}` : null,
      history: [{ at: kit.now, what: "came" }, ...(to ? [{ at: kit.now, what: "filed" as const, how: to.how, book: to.book, by: null }] : [])],
    };
    // Sorted by arrival, the mail's own order kept within it.
    const bid = kit.id();
    ids.push(bid);
    await kit.store.put("bills", bid, bill as unknown as Json, e.at + i);
    if (!to && facts?.seller) unfiled.push({ id: bid, seller: facts.seller });
  }
  // Last, and only when nothing else fitted: jev picks a folder from the seller's name alone, as a guess.
  if (unfiled.length && books.length > 1) {
    const words = lettersOnly(unfiled[0].seller);
    if (words) await kit.sort(words, Object.fromEntries(books.map((b) => [b.id, lettersOnly(b.book.name) || "folder"])), { kind: "guess", bills: unfiled.map((u) => u.id) } as unknown as Json, { after: 0 });
  }
  await noteQuestion(kit, e, ids);
  return "took";
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
    currency: read?.amount != null ? read.currency : null,
    billDate: null,
    ...wordsOf(read?.note ?? null),
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
    kit.send(copy.understood({ emoji: book?.emoji ?? null, book: book?.name ?? null, amount: read.amount !== null ? money(read.amount, read.currency ?? kit.person.currency ?? null) : null }));
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
    const words = wordsOf(read.note);
    next = withEvent({ ...bill, amount: read.amount ?? bill.amount, currency: read.amount !== null ? read.currency : (bill.currency ?? null), name: words.name ?? bill.name ?? null, note: words.note ?? bill.note }, { at: kit.now, what: "changed", how: "reply", by });
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
    from: b.mail?.from ?? null,
    mail: b.mail ? { domain: b.mail.domain, label: b.mail.label, kind: b.mail.kind ?? null, part: b.mail.part ?? 1, of: b.mail.of ?? b.files.length, name: b.mail.name ?? null } : null,
    asked: b.asked ?? null,
    noteBy: b.noteBy ?? null,
    files: b.files,
    at: b.at,
    state: b.state,
    book: b.book,
    tagged: b.tagged,
    amount: b.amount,
    currency: b.currency ?? null,
    facts: b.facts ?? null,
    reading: b.reading ?? null,
    unread: b.unread ?? null,
    // Built here so the page never holds the Message-ID as a value of its own (SDK 1.36.0's rule).
    gmail: b.mail?.msg ? `https://mail.google.com/mail/u/0/#search/rfc822msgid:${encodeURIComponent(b.mail.msg)}` : null,
    billDate: b.billDate,
    note: b.note,
    name: b.name ?? null,
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

/** A note as typed on the page: lines kept, spaces tidied, at most MAX_NOTE. */
const noteOf = (raw: unknown): string | null =>
  typeof raw === "string" ? raw.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_NOTE) || null : null;
/** A name: one line, at most MAX_NAME. */
const nameOf = (raw: unknown): string | null => (typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, MAX_NAME) || null : null);
/** A caption's or a reply's leftover words: short ones name the bill, longer ones are its note. */
function wordsOf(text: string | null): { name: string | null; note: string | null } {
  if (!text) return { name: null, note: null };
  return text.length <= MAX_NAME ? { name: text, note: null } : { name: null, note: text.slice(0, MAX_NOTE) };
}

export default definePlugin({
  id: "invoice-holder",
  version: "1.8.0",
  sdk: "1",
  name: "BillKeeper",
  icon: "📑",
  tagline: "Every bill in one place, sorted by whose it is.",
  description:
    "Send a photo of any bill to its WhatsApp group and it is kept. React with an emoji to file it under one of your businesses or a person, or reply with the name. Every bill, by month and by business, is on your page. Once a week you hear how many wait for a folder, and on the 1st how the month went.",
  groupName: copy.groupName(),
  price: 0,
  // Tier 2: it stores a photo for every bill.
  tier: 2,
  // "sort": jev picks a mailed bill's folder from its seller's name, only when nothing else fits (since 1.7.0).
  permissions: ["photos", "mail", "sort"],
  // Being tried out first: only people Zelfred allows can add it.
  unlisted: true,
  listing: {
    title: "Invoice and Bill Organiser for Small Businesses | Zelfred",
    description: "Photograph a bill, send it to a WhatsApp chat, and tap an emoji to file it under the right business. Every invoice sorted by month and by business.",
    h1: "Keep every bill, sorted by business",
  },
  schedules: [
    { id: "waiting", hour: REMIND_HOUR },
    { id: "month", hour: MONTH_HOUR },
  ],
  // Zelfred's 8pm line when the day's mail lines were held back past the cap (og-copy-bot's words, SDK 1.34.0).
  mailSummary: { one: MAIL_SUMMARY_ONE, many: MAIL_SUMMARY_MANY },
  welcome: copy.welcome(),
  help: copy.help(),

  async onMessage(event, kit) {
    const text = event.text.trim().replace(/\s+/g, " ");
    if (event.photos?.length) {
      // A photo closes the window for a plain-line note.
      await kit.store.delete("state", "noteOpen");
      for (const photo of event.photos) await keepPhoto(kit, photo, text, event.sender);
      return;
    }
    if (!text) return;
    if (isNoteRef(event.quotedRef)) return takeNote(kit, event.quotedRef.bills, text, "reply", senderOf(event.sender));
    if (isBillRef(event.quotedRef)) return onReply(kit, event.quotedRef.id, text, event.sender);
    if (text.toLowerCase() === BOOKS || text.toLowerCase() === BOOKS_TOO) return listBooks(kit);

    // The first book's name, asked for after the first bill.
    const asking = await kit.store.get<{ bill: string }>("state", "asking");
    if (asking) {
      if ((await allBooks(kit)).length) await kit.store.delete("state", "asking");
      else if (!oneEmoji(text) && (await firstBook(kit, asking.bill, text, senderOf(event.sender)))) return;
    }
    // Straight after a note question, the next plain line is its note, while it is the one open question.
    const open = await kit.store.get<{ bills?: string[]; at: number }>("state", "noteOpen");
    if (open?.bills && kit.now - open.at <= NOTE_WINDOW_MS) return takeNote(kit, open.bills, text, "now", senderOf(event.sender));
    kit.unsure(copy.unsure());
  },

  /**
   * A reaction on a bill's message: a book's emoji files it there, the last one counts, and
   * taking it off unfiles a bill a reaction had filed. Done-marks and unknown emoji change nothing.
   */
  async onReaction(event, kit) {
    // On a note question: a folder's emoji files its bills; a done mark means no note.
    if (isNoteRef(event.ref)) {
      const by = senderOf(event.sender);
      const e = event.emoji ? bare(event.emoji) : null;
      if (e && NEVER_A_BOOK.some((n) => bare(n) === e)) {
        const open = await kit.store.get<{ bills?: string[] }>("state", "noteOpen");
        if (open?.bills?.join() === event.ref.bills.join()) await kit.store.delete("state", "noteOpen");
        return;
      }
      const book = e ? (await allBooks(kit)).find((b) => b.book.emoji && bare(b.book.emoji) === e) : null;
      for (const id of event.ref.bills) {
        const bill = await kit.store.get<Bill>("bills", id);
        if (!bill) continue;
        if (!e) {
          if (bill.tagged?.how === "reaction") await file(kit, id, null, "reaction", by);
        } else if (book && bill.book !== book.id) await file(kit, id, book.id, "reaction", by);
      }
      return;
    }
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

  /** Their bill's photo was deleted in WhatsApp: the bill stays on the page, and they are told so. */
  /** A bill that came to the person's Zelfred mail address (SDK 1.33.0). */
  async onMail(event, kit) {
    return await keepMail(kit, event);
  },

  async onDeleted(event, kit) {
    if (!isBillRef(event.ref)) return;
    if (!(await kit.store.get("bills", event.ref.id))) return;
    kit.send(copy.keptAfterDelete());
  },

  async onSchedule(event, kit) {
    if (event.id === "waiting") {
      if (weekday(kit.today) !== REMIND_DAY) return;
      if ((await kit.store.get<string>("state", "weekly")) === kit.today) return;
      const count = (await kit.store.list<Bill>("bills")).filter((b) => b.data.state === "to-tag").length;
      if (!count) return;
      await kit.store.put("state", "weekly", kit.today);
      return kit.send(copy.waiting({ count }));
    }
    if (event.id === "month") {
      if (!kit.today.endsWith("-01")) return;
      const month = monthBefore(kit.today);
      if ((await kit.store.get<string>("state", "month")) === month) return;
      const bills = (await kit.store.list<Bill>("bills")).filter((b) => kit.time.day(b.data.at).startsWith(month));
      if (!bills.length) return;
      await kit.store.put("state", "month", month);
      const priced = bills.filter((b) => b.data.amount !== null);
      // Rupees and dollars are never added into one sum: one figure per currency, the person's own first.
      const own = (kit.person.currency ?? "INR") as string;
      const sums = new Map<string, number>();
      for (const b of priced) {
        const c = b.data.currency ?? own;
        sums.set(c, (sums.get(c) ?? 0) + (b.data.amount ?? 0));
      }
      const order = [...sums.keys()].sort((a, b) => (a === own ? -1 : b === own ? 1 : a < b ? -1 : 1));
      const sum = order.map((c) => money(Math.round(sums.get(c)! * 100) / 100, c)).join(" and ");
      const [y, m] = month.split("-").map(Number);
      return kit.send(copy.month({ month: `${MONTHS[m - 1]} ${y}`, count: bills.length, priced: priced.length, sum: priced.length ? sum : null }));
    }
  },

  /** "Read again" answered: what the bill says, filling only what the person hasn't changed. */
  async onFileRead(event, kit) {
    const ref = event.ref as { kind?: string; bill?: unknown } | null;
    if (!ref || ref.kind !== "reread" || typeof ref.bill !== "string") return;
    const bill = await kit.store.get<Bill>("bills", ref.bill);
    if (!bill || !bill.files.some((f) => f.id === event.fileId)) return;
    const facts = factsFrom(event.read);
    const next: Bill = { ...bill, reading: null };
    if (!facts) {
      const st = (event.read as { state?: string } | null)?.state;
      next.unread = st === "locked" || st === "picture" ? st : "failed";
      return void (await kit.store.put("bills", ref.bill, next as unknown as Json));
    }
    const before = bill.facts ?? {};
    // A field is the person's once they changed it from what the bill said (or gave it with no reading).
    const mine = <T>(now: T | null | undefined, said: T | undefined) => now !== null && now !== undefined && now !== said;
    if (!mine(bill.amount, before.amount) && facts.amount !== undefined) {
      next.amount = facts.amount;
      next.currency = facts.currency ?? null;
    }
    if (!mine(bill.billDate, before.date) && facts.date) next.billDate = facts.date;
    next.facts = facts;
    next.unread = null;
    next.history = [...bill.history, { at: kit.now, what: "read" }];
    await kit.store.put("bills", ref.bill, next as unknown as Json);
    if (bill.book) return;
    const books = await allBooks(kit);
    const to = folderFor(books, [], null, facts);
    if (to) return void (await file(kit, ref.bill, to.book, to.how, null));
    const words = facts.seller ? lettersOnly(facts.seller) : "";
    if (words && books.length > 1) await kit.sort(words, Object.fromEntries(books.map((b) => [b.id, lettersOnly(b.book.name) || "folder"])), { kind: "guess", bills: [ref.bill] } as unknown as Json, { after: 0 });
  },

  /** jev's pick for a mailed bill nothing else could place. Filed only if still unfiled, marked as a guess. */
  async onSorted(event, kit) {
    const ref = event.ref as { kind?: string; bills?: unknown } | null;
    if (!ref || ref.kind !== "guess" || !Array.isArray(ref.bills) || !event.choice) return;
    if (!(await kit.store.get("books", event.choice))) return;
    for (const id of ref.bills) {
      if (typeof id !== "string") continue;
      const bill = await kit.store.get<Bill>("bills", id);
      if (bill && !bill.book) await file(kit, id, event.choice, "guess", null);
    }
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
        // Per sender, whether a note is asked for when their bill comes: "auto", "yes" or "no".
        senders: Object.fromEntries((await kit.store.list<SenderPref>("senders")).map((r) => [r.key, r.data.ask])),
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
      /** "Read again": Zelfred's bill reader reads this bill's PDF once more; the answer comes to onFileRead. */
      async reread(kit, args) {
        const id = String(args.id ?? "");
        const bill = await kit.store.get<Bill>("bills", id);
        if (!bill) throw new Error("That bill isn't here any more.");
        const pdf = bill.files.find((f) => f.type === "application/pdf");
        if (!pdf) throw new Error("Only a PDF can be read.");
        if (bill.reading && kit.now - bill.reading < 2 * 60_000) return;
        try {
          await kit.files.read(pdf.id, { kind: "reread", bill: id } as unknown as Json);
        } catch {
          // Zelfred reads only PDFs that came by mail or were uploaded on the page.
          await kit.store.put("bills", id, { ...bill, reading: null, unread: "failed" } as unknown as Json);
          return;
        }
        await kit.store.put("bills", id, { ...bill, reading: kit.now } as unknown as Json);
      },
      /** Change a bill's amount, date or note. Leave a field out to keep it. */
      async edit(kit, args) {
        const id = String(args.id ?? "");
        const bill = await kit.store.get<Bill>("bills", id);
        if (!bill) throw new Error("That bill isn't here any more.");
        const next: Bill = { ...bill };
        if ("amount" in args) next.amount = amountOf(args.amount);
        if ("currency" in args) next.currency = CURRENCIES.includes(args.currency as Currency) ? (args.currency as Currency) : null;
        if ("billDate" in args) next.billDate = dateOf(args.billDate);
        if ("note" in args) next.note = noteOf(args.note);
        if ("name" in args) next.name = nameOf(args.name);
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
        const currency = amount !== null && CURRENCIES.includes(args.currency as Currency) ? (args.currency as Currency) : null;
        const billDate = dateOf(args.billDate);
        const note = noteOf(args.note);
        const name = nameOf(args.name);
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
            currency,
            billDate,
            note,
            name,
            batch,
            history,
          };
          await kit.store.put("bills", id, bill as unknown as Json, kit.now);
          ids.push(id);
        }
        return { ids };
      },
      /** Whether to ask for a note when this sender's bill comes: "auto" (the routine rules), "yes" or "no". */
      async setSenderAsk(kit, args) {
        const from = typeof args.from === "string" ? args.from.trim().toLowerCase().slice(0, 200) : "";
        if (!from) throw new Error("That sender isn't known.");
        const ask = args.ask === "yes" || args.ask === "no" ? args.ask : "auto";
        if (ask === "auto") await kit.store.delete("senders", from);
        else await kit.store.put("senders", from, { ask } as unknown as Json);
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
