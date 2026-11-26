/**
 * Everything InvoiceHolder puts on WhatsApp: its welcome and help, every reply and every
 * reaction. index.ts decides what to say; this file decides how.
 *
 * A message is a list of wordings (see src/copy.ts) and one is picked each time. A message
 * takes its data and returns the whole text.
 *
 * Drafts until og-copy-bot has read them.
 */
import { fixed, msg } from "../../sdk";

// ── Words the parser in index.ts reads back ──

/** The platform's own word: it sends this plugin's help. */
export const HELP = fixed("help");
/** Lists the books and their emoji, since the group's description can't hold them yet. */
export const BOOKS = fixed("books");

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
  groupName: msg(["📑 InvoiceHolder"]),

  // ── What the plugin says about itself ──
  welcome: msg([
    "📑 You've added *InvoiceHolder*.\n\nSend me a photo of a bill. I keep every bill here, sorted by whose it is: your business, your home, anyone you pay for.\n\nSend _help_ for more.",
  ]),
  help: msg([
    [
      "*InvoiceHolder*",
      "",
      "Send a photo of a bill and I keep it.",
      "React to it with a book's emoji to file it there. Change the reaction to move it; take it off to unfile it.",
      "Or reply to it with the book's name. A caption can say whose it is and how much.",
      "",
      `_${BOOKS}_ shows your books and their emoji`,
      "",
      "Every bill, by month and by book, is on your page, where you can also make and change books.",
    ].join("\n"),
  ]),

  // ── The first time ──
  /** The first bill ever, and no book yet: what happened, and whose it is. */
  firstKeptAsk: msg(["Kept. A 👍 from me means a bill is safe here, and an emoji from you files it.\n\nWhose bill is this? Send me the name: your business, your home, or a person."]),
  /** The first bill ever, when books were already made on the page. */
  firstKept: msg<{ books: BookLine[] }>([({ books }) => `Kept. A 👍 from me means a bill is safe here. React with a book's emoji to file it:\n\n${bookList(books)}`]),
  /** The first book, made from their answer. */
  firstBook: msg<{ emoji: string; name: string }>([({ emoji, name }) => `${emoji} is *${name}* now. That bill is filed there, and any bill you react to with ${emoji} goes there too.\n\nMore books, and other emoji, on your page.`]),
  /** The first time a caption filed a bill or gave its amount: what was understood. */
  understood: msg<{ emoji: string | null; book: string | null; amount: string | null }>([
    ({ emoji, book, amount }) => {
      const parts = [book ? `filed under ${emoji ? `${emoji} ` : ""}${book}` : null, amount ? `for ${amount}` : null].filter(Boolean).join(", ");
      return `Read from your caption: ${parts}. If I read it wrong, change it on your page.`;
    },
  ]),

  // ── Answers ──
  /** A reply named two books, or none: which one. */
  whichBook: msg(["Which book is this bill for?"]),
  /** The person sent "books". */
  books: msg<{ books: BookLine[]; more: number }>([
    ({ books, more }) => `Your books:\n\n${bookList(books)}${more ? `\n\n${more} more on your page, without an emoji.` : ""}`,
  ]),
  noBooks: msg(["No books yet. Send a photo of a bill and tell me whose it is, or make one on your page."]),
  /** A reply to a bill that is gone. */
  gone: msg(["That bill isn't here any more."]),
  /** Anything else typed. */
  unsure: msg(["I keep photos of bills here. Send one, or _help_ to see what else I can do."]),
  /** The name they gave is already a book's. */
  sameName: msg<{ emoji: string | null; name: string }>([({ emoji, name }) => `${emoji ? `${emoji} ` : ""}*${name}* is already a book. That bill is filed there.`]),
};

/** An amount the way it is said back: ₹1,200 or ₹450.50. */
export function money(n: number, currency: string | null): string {
  const sign = !currency || currency === "INR" ? "₹" : `${currency} `;
  const whole = Number.isInteger(n);
  return `${sign}${n.toLocaleString("en-IN", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}
