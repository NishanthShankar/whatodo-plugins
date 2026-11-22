/**
 * Prices and labels, read out of what people type and written back the way people write them.
 * Pure functions: nothing here touches the kit.
 */

/** How each currency is written in front of an amount. Anything else is shown as its code. */
const SYMBOL: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£", JPY: "¥", AUD: "A$", CAD: "C$", SGD: "S$" };

/** What people type for a currency, lowercase. */
const WORDS: Record<string, string> = {
  "₹": "INR", rs: "INR", "rs.": "INR", inr: "INR", rupee: "INR", rupees: "INR",
  $: "USD", usd: "USD", dollar: "USD", dollars: "USD",
  "€": "EUR", eur: "EUR", euro: "EUR", euros: "EUR",
  "£": "GBP", gbp: "GBP", pound: "GBP", pounds: "GBP",
  "¥": "JPY", jpy: "JPY", yen: "JPY",
  aed: "AED", dirham: "AED", dirhams: "AED",
  sgd: "SGD", aud: "AUD", cad: "CAD", chf: "CHF", sar: "SAR", qar: "QAR", myr: "MYR", nzd: "NZD", zar: "ZAR", lkr: "LKR", npr: "NPR", bdt: "BDT", pkr: "PKR", thb: "THB", idr: "IDR", php: "PHP", krw: "KRW", cny: "CNY", hkd: "HKD", sek: "SEK", nok: "NOK", dkk: "DKK", brl: "BRL", mxn: "MXN", kwd: "KWD", bhd: "BHD", omr: "OMR",
};

/** The currency a typed word means ("rs", "$", "usd"), or null. */
export function currencyOf(word: string): string | null {
  return WORDS[word.trim().toLowerCase()] ?? null;
}

/** A first guess at the currency someone counts in, from where their clock is. They can change it. */
export function guessCurrency(timezone: string): string {
  if (/^Asia\/(Kolkata|Calcutta)$/.test(timezone)) return "INR";
  if (timezone === "Europe/London") return "GBP";
  if (timezone === "Asia/Dubai") return "AED";
  if (timezone === "Asia/Singapore") return "SGD";
  if (timezone === "Asia/Tokyo") return "JPY";
  if (/^Australia\//.test(timezone)) return "AUD";
  if (/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax)$/.test(timezone)) return "CAD";
  if (/^Europe\//.test(timezone)) return "EUR";
  return "USD";
}

/** 124990 -> "1,24,990" the Indian way, or "124,990". Paise and cents only when there are any. */
function grouped(amount: number, indian: boolean): string {
  const [whole, part] = (Math.round(amount * 100) / 100).toFixed(2).split(".");
  let out: string;
  if (indian && whole.length > 3) out = `${whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${whole.slice(-3)}`;
  else out = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return part === "00" ? out : `${out}.${part}`;
}

/** "₹24,990", "$19.99", "AED 300". */
export function money(amount: number, currency: string): string {
  const symbol = SYMBOL[currency];
  return symbol ? `${symbol}${grouped(amount, currency === "INR")}` : `${currency} ${grouped(amount, false)}`;
}

/** Sums that may be in more than one currency: "₹24,990 + $20". Null when nothing has a price. */
export function total(prices: { price: number | null; currency: string | null }[], own: string): string | null {
  const by = new Map<string, number>();
  for (const p of prices) if (p.price !== null) by.set(p.currency ?? own, (by.get(p.currency ?? own) ?? 0) + p.price);
  if (!by.size) return null;
  // The person's own currency first, then the rest by name.
  const order = [...by.keys()].sort((a, b) => (a === own ? -1 : b === own ? 1 : a < b ? -1 : 1));
  return order.map((c) => money(by.get(c)!, c)).join(" + ");
}

const NUMBER = String.raw`(\d{1,3}(?:,\d{2,3})+|\d+)(\.\d{1,2})?\s?(k|l|lakh|lakhs|lac)?`;
const MARK = String.raw`(₹|\$|€|£|¥|rs\.?|[a-z]{3,7})`;

function amount(whole: string, part: string | undefined, scale: string | undefined): number | null {
  let n = Number(`${whole.replace(/,/g, "")}${part ?? ""}`);
  if (scale === "k") n *= 1000;
  else if (scale) n *= 100000;
  n = Math.round(n * 100) / 100;
  return Number.isFinite(n) && n > 0 && n < 1e10 ? n : null;
}

export interface Priced {
  price: number;
  /** Null when they wrote a bare number: it is in their own currency. */
  currency: string | null;
  /** The text without the price. */
  rest: string;
}

/**
 * The price in a line of text. A number with a currency next to it always counts ("rs 500",
 * "$20", "500 rupees"). A bare number counts when it ends the line and is 50 or more, so
 * "running shoes 4000" has a price and "iphone 15" does not. With `alone`, the whole text is
 * expected to be a price (a reply that says only "2499").
 */
export function readPrice(text: string, alone = false): Priced | null {
  const t = text.trim();
  const out = (m: RegExpExecArray, price: number | null, currency: string | null): Priced | null =>
    price === null ? null : { price, currency, rest: `${t.slice(0, m.index)} ${t.slice(m.index + m[0].length)}`.replace(/\s+/g, " ").trim() };

  // "₹24,990", "rs 500", "usd 20"
  for (const m of t.matchAll(new RegExp(String.raw`(?<![\w#])${MARK}\s?${NUMBER}(?![\w.])`, "gi"))) {
    const currency = currencyOf(m[1]);
    if (currency) return out(m, amount(m[2], m[3], m[4]?.toLowerCase()), currency);
  }
  // "500 rs", "20 dollars"
  for (const m of t.matchAll(new RegExp(String.raw`(?<![\w#.,])${NUMBER}\s?(₹|\$|€|£|¥|rs\.?|[a-z]{3,7})(?![\w])`, "gi"))) {
    const currency = currencyOf(m[4]);
    if (currency) return out(m, amount(m[1], m[2], m[3]?.toLowerCase()), currency);
  }
  if (alone) {
    const m = new RegExp(String.raw`^${NUMBER}$`, "i").exec(t);
    return m ? out(m, amount(m[1], m[2], m[3]?.toLowerCase()), null) : null;
  }
  const m = new RegExp(String.raw`(?<=\s)${NUMBER}$`, "i").exec(t);
  if (!m) return null;
  const price = amount(m[1], m[2], m[3]?.toLowerCase());
  return price !== null && price >= 50 ? out(m, price, null) : null;
}

/** Most labels one thing can carry. */
export const MAX_TAGS = 5;

/** The #labels in a line and the line without them. Lowercase, no repeats, five at most. */
export function readTags(text: string): { tags: string[]; rest: string } {
  const tags: string[] = [];
  const rest = text
    .replace(/(^|\s)#([\p{L}\d][\p{L}\d_-]{0,29})(?=\s|$)/gu, (_whole, before: string, tag: string) => {
      const t = tag.toLowerCase();
      if (!tags.includes(t) && tags.length < MAX_TAGS) tags.push(t);
      return before;
    })
    .replace(/\s+/g, " ")
    .trim();
  return { tags, rest };
}

/** "My Diwali List!" -> "my-diwali-list": how a name is compared and how a group's key is made. */
export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\d]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/, "");
}
