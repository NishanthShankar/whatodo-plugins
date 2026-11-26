/**
 * Everything InvoiceHolder puts on WhatsApp: its welcome and help, every reply and every
 * reaction. index.ts decides what to say; this file decides how.
 *
 * A message is a list of wordings (see src/copy.ts) and one is picked each time. A message
 * takes its data and returns the whole text.
 *
 * Read by og-copy-bot on 2026-11-26. "Folder" is its pick for what people see (the code says
 * "book"); the owner has not picked the word yet.
 */
import { fixed, msg } from "../../sdk";

// ── Words the parser in index.ts reads back ──

/** The platform's own word: it sends this plugin's help. */
export const HELP = fixed("help");
/** Lists the books and their emoji, since the group's description can't hold them yet. */
export const BOOKS = fixed("folders");
/** The same, in the brief's first word for it. */
export const BOOKS_TOO = fixed("books");

// ── Reactions ──

/** On a bill that is kept and not yet filed. */
export const KEPT = fixed("👍");

/**
 * Emoji that never stand for a book: they mean "done" everywhere in Zelfred, and ❌ will mean
 * "don't send" once bills go to accountants.
 */
export const NEVER_A_BOOK = ["👍", "✅", "👌", "🙏", "❌", "✔", "☑", "✖", "🗑", "🚫"];

/**
 * The emoji a new book is given, in order: different in shape, not only in colour, so they
 * read at reaction size and for colour blind eyes.
 */
export const BOOK_EMOJI = ["🏢", "🏠", "🛒", "🚗", "🩺", "🎓", "🌱", "🔧", "📦", "🎨", "⚓", "🍳"];

export interface BookLine {
  emoji: string | null;
  name: string;
}

const bookList = (books: BookLine[]) => books.map((b) => `${b.emoji ?? "·"} ${b.name}`).join("\n");

export const copy = {
  groupName: msg(["📑 BillKeeper"]),

  // ── What the plugin says about itself ──
  welcome: msg([
    "📑 You've added *BillKeeper*.\n\nSend me a photo of a bill and it is kept, sorted by whose it is: your business, your home, anyone you pay for.\n\nSend _help_ for more.",
  ]),
  help: msg([
    [
      "*BillKeeper*",
      "",
      "Send a photo of a bill and I keep it.",
      "React to it with a folder's emoji to file it there. Change the reaction to move it. Take the reaction off and the bill is in no folder.",
      "Or reply to it with the folder's name. A caption can say whose it is and how much.",
      "",
      `_${BOOKS}_ shows your folders and their emoji`,
      "",
      "Every bill, by month and by folder, is on your page, where you can also make and change folders.",
    ].join("\n"),
  ]),

  // ── The first time ──
  /** The first bill ever, and no book yet: what happened, and whose it is. */
  firstKeptAsk: msg(["Kept. From now on a 👍 from me means a bill is kept.\n\nWhose bill is this? Your business, your home, or a person."]),
  /** The first bill ever, when books were already made on the page. */
  firstKept: msg<{ books: BookLine[] }>([({ books }) => `Kept. From now on a 👍 from me means a bill is kept. React with a folder's emoji to file it:\n\n${bookList(books)}`]),
  /** The first book, made from their answer. */
  firstBook: msg<{ emoji: string; name: string }>([({ emoji, name }) => `*${name}* is ${emoji} from now on. That bill is filed there, and any bill you react to with ${emoji} goes there too.\n\nMore folders, and other emoji, on your page.`]),
  /** The first time a caption filed a bill or gave its amount: what was understood. */
  understood: msg<{ emoji: string | null; book: string | null; amount: string | null }>([
    ({ emoji, book, amount }) => {
      const parts = [book ? `filed under ${emoji ? `${emoji} ` : ""}${book}` : null, amount ? `for ${amount}` : null].filter(Boolean).join(", ");
      return `Read from your caption: ${parts}. If I read it wrong, change it on your page.`;
    },
  ]),

  // ── Answers ──
  /** A reply named two books, or none: which one. */
  whichBook: msg(["Which folder is this bill for?"]),
  /** The person sent "books". */
  books: msg<{ books: BookLine[]; more: number }>([
    ({ books, more }) => `Your folders:\n\n${bookList(books)}${more ? `\n\n${more} more on your page, without an emoji.` : ""}`,
  ]),
  noBooks: msg(["No folders yet. Send a photo of a bill and tell me whose it is, or make one on your page."]),
  /** A reply to a bill that is gone. */
  gone: msg(["That bill isn't here any more."]),
  /** The person deleted a bill's photo in WhatsApp: it stays on the page (the owner, 2026-11-26). */
  keptAfterDelete: msg(["That bill is still on your page. For safety, bills aren't removed from WhatsApp; remove it on the page if you're sure."]),
  /** Once a week, when bills wait for a folder (the owner, 2026-11-26). */
  waiting: msg<{ count: number }>([({ count }) => `${count === 1 ? "1 bill is" : `${count} bills are`} waiting for a folder. React with an emoji on each, or file them on your page.`]),
  /** On the first of the month, the month before (the owner, 2026-11-26). */
  month: msg<{ month: string; count: number; priced: number; sum: string | null }>([
    ({ month, count, priced, sum }) =>
      `${month}: ${count === 1 ? "1 bill" : `${count} bills`}. ${priced === 0 ? "None has an amount yet." : priced === count ? `Together ${sum}.` : `${priced} ${priced === 1 ? "has" : "have"} an amount: ${sum}. The rest are on your page.`}`,
  ]),
  /** Anything else typed. */
  unsure: msg(["I keep photos of bills here. Send one, or _help_ to see what else I can do."]),
  /** The name they gave is already a book's. */
  sameName: msg<{ emoji: string | null; name: string }>([({ emoji, name }) => `${emoji ? `${emoji} ` : ""}*${name}* is already a folder. That bill is filed there.`]),
};

/** An amount the way it is said back: ₹1,200 or ₹450.50. */
export function money(n: number, currency: string | null): string {
  const sign = !currency || currency === "INR" ? "₹" : `${currency} `;
  const whole = Number.isInteger(n);
  return `${sign}${n.toLocaleString("en-IN", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}
