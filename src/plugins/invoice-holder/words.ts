/**
 * Reading a caption or a reply on a bill, with our own code: which book it names, how much it
 * was, and what is left over as a note. Nothing is read from the picture, and nothing here
 * leaves Zelfred.
 *
 * The rules (z-ux-bot, 2026-11-26, in docs/invoice-holder-brief.md):
 *   - A book is named by its whole name, or by a whole word of it. A whole name beats a part of
 *     one; two books named equally well is "two", and the person is asked.
 *   - The amount is taken only when it is plain which number it is: the one written as money
 *     (₹, rs, a decimal, a comma group), or the only number there is. Two bare numbers give no
 *     amount, and both stay in the note. A wrong amount is worse than none.
 */

export interface BookName {
  id: string;
  name: string;
}

export interface Read {
  /** The one book the words name; null when they name none or two. */
  book: string | null;
  /** Every book named equally well, when more than one is. */
  books: string[];
  amount: number | null;
  /** What is left once the book and the amount are taken out. */
  note: string | null;
}

/** Words too common to stand for a book on their own. */
const COMMON = new Set(["the", "and", "for", "of", "my", "our", "a", "an", "to", "at", "in", "on", "co", "ltd", "pvt", "llp", "inc", "llc", "company", "and"]);

/** A note can be long (the owner, 2026-11-27: "note can go toooooo long"); a name is short and is the bill's title. */
export const MAX_NOTE = 2000;
export const MAX_NAME = 60;

const words = (s: string) => s.toLowerCase().normalize("NFKC").split(/[^\p{L}\p{N}&']+/u).filter(Boolean);

interface Num {
  start: number;
  end: number;
  value: number;
  money: boolean;
}

/** Every number in the text, and whether it is written as money. */
function numbers(text: string): Num[] {
  const out: Num[] = [];
  const re = /(?<![\p{L}\p{N}.,])(?:(₹|rs\.?|inr)\s?)?(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?:\s?(\/-|rs\b|rupees\b|inr\b))?/giu;
  for (const m of text.matchAll(re)) {
    const raw = m[2];
    // A number glued to letters ("inv4471", "2x") is part of a word, not an amount.
    const afterAt = m.index! + m[0].length;
    const after = text[afterAt] ?? " ";
    if (/[\p{L}\d]/u.test(after) && !m[3]) continue;
    const value = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(value) || value <= 0 || value >= 1e10) continue;
    out.push({ start: m.index!, end: afterAt, value, money: !!m[1] || !!m[3] || raw.includes(",") || raw.includes(".") });
  }
  return out;
}

/** The amount, when it is plain which number it is. */
function amountOf(text: string): Num | null {
  const nums = numbers(text);
  const money = nums.filter((n) => n.money);
  if (money.length === 1) return money[0];
  if (money.length === 0 && nums.length === 1) return nums[0];
  return null;
}

/** Which books the words name: by whole name first, then by a whole word of a name. */
function booksIn(text: string, books: BookName[]): { ids: string[]; used: string[] } {
  const said = words(text);
  const joined = ` ${said.join(" ")} `;
  const whole = books.filter((b) => {
    const w = words(b.name);
    return w.length > 0 && joined.includes(` ${w.join(" ")} `);
  });
  if (whole.length) {
    // The longest whole name wins: "acme foods" over "acme".
    const longest = Math.max(...whole.map((b) => words(b.name).length));
    const best = whole.filter((b) => words(b.name).length === longest);
    return { ids: best.map((b) => b.id), used: words(best[0].name) };
  }
  const part = books.filter((b) => words(b.name).some((w) => w.length >= 3 && !COMMON.has(w) && said.includes(w)));
  if (!part.length) return { ids: [], used: [] };
  const used = words(part[0].name).filter((w) => said.includes(w));
  return { ids: part.map((b) => b.id), used };
}

/** Read a caption or a reply against the person's books. */
export function readWords(text: string, books: BookName[]): Read {
  const clean = text.replace(/\s+/g, " ").trim();
  const amount = amountOf(clean);
  const rest = amount ? `${clean.slice(0, amount.start)} ${clean.slice(amount.end)}` : clean;
  const found = booksIn(rest, books);
  const book = found.ids.length === 1 ? found.ids[0] : null;
  let note = rest;
  if (book) {
    // Take the book's words out of the note, once each.
    for (const w of found.used) note = note.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${escape(w)}(?=$|[^\\p{L}\\p{N}])`, "iu"), "$1");
  }
  note = note.replace(/\s+/g, " ").replace(/^[\s,.;:\-]+|[\s,.;:\-]+$/g, "").trim();
  return { book, books: found.ids.length > 1 ? found.ids : [], amount: amount ? amount.value : null, note: note ? note.slice(0, MAX_NOTE) : null };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** An emoji without its skin tone or the mark that makes it a picture, so one picture in two forms is one. */
export const bare = (emoji: string) => emoji.replace(/[\u{1F3FB}-\u{1F3FF}️]/gu, "");

/**
 * Exactly one emoji and nothing else; null otherwise. A picture (with its joined forms, 👨‍👩‍👧), a flag made of two
 * letter symbols (🇮🇳), a keycap (1️⃣) or a flag with a tag sequence (🏴󠁧󠁢󠁥󠁮󠁧󠁿).
 */
export function oneEmoji(text: string): string | null {
  const t = bare(text.replace(/\s+/g, ""));
  if (!t || t.length > 40) return null;
  const one =
    /^(?:\p{Regional_Indicator}{2}|[0-9#*]\u20E3|\p{Extended_Pictographic}[\u{E0020}-\u{E007F}]*(?:\u200D\p{Extended_Pictographic}[\u{E0020}-\u{E007F}]*)*)$/u;
  return one.test(t) ? t : null;
}

/** A book's name as typed: one line, trimmed, at most 40 characters. */
export function cleanName(text: string): string | null {
  const t = text.replace(/\s+/g, " ").replace(/^["'“”]+|["'“”.!]+$/g, "").trim().slice(0, 40);
  return t || null;
}

/** A GST number: 15 letters and digits, upper case. Null when it isn't one. */
export function cleanGst(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const t = text.replace(/\s+/g, "").toUpperCase();
  return /^\d{2}[A-Z0-9]{13}$/.test(t) ? t : null;
}
