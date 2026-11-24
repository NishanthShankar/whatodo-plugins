/**
 * Amounts and currencies, read out of what people type and written back the way people write
 * them. Pure functions: nothing here touches the kit.
 */

/** How each currency is written in front of an amount. Anything else is shown as its code. */
const SYMBOL: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£", JPY: "¥", AUD: "A$", CAD: "C$", SGD: "S$" };

/** What a currency is called in the question about it. Anything else is shown as its code alone. */
const NAME: Record<string, string> = {
  INR: "Rupees", USD: "US dollars", EUR: "Euros", GBP: "Pounds", AED: "Dirhams", JPY: "Yen", SGD: "Singapore dollars", AUD: "Australian dollars", CAD: "Canadian dollars", THB: "Baht", LKR: "Sri Lankan rupees", NPR: "Nepali rupees", MYR: "Ringgit", IDR: "Rupiah",
};

/** What people type for a currency, lowercase. */
const WORDS: Record<string, string> = {
  "₹": "INR", rs: "INR", "rs.": "INR", inr: "INR", rupee: "INR", rupees: "INR",
  $: "USD", usd: "USD", dollar: "USD", dollars: "USD",
  "€": "EUR", eur: "EUR", euro: "EUR", euros: "EUR",
  "£": "GBP", gbp: "GBP", pound: "GBP", pounds: "GBP",
  "¥": "JPY", jpy: "JPY", yen: "JPY",
  aed: "AED", dirham: "AED", dirhams: "AED",
  thb: "THB", baht: "THB",
  sgd: "SGD", aud: "AUD", cad: "CAD", chf: "CHF", sar: "SAR", qar: "QAR", myr: "MYR", nzd: "NZD", zar: "ZAR", lkr: "LKR", npr: "NPR", bdt: "BDT", pkr: "PKR", idr: "IDR", php: "PHP", krw: "KRW", cny: "CNY", hkd: "HKD", sek: "SEK", nok: "NOK", dkk: "DKK", brl: "BRL", mxn: "MXN", kwd: "KWD", bhd: "BHD", omr: "OMR", vnd: "VND", try: "TRY", egp: "EGP", mvr: "MVR", btn: "BTN",
};

/** The currencies the question offers, after the first guess. */
export const COMMON = ["INR", "USD", "EUR", "GBP", "AED"];

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

/** "₹" for INR, "AED" for AED: what stands for the currency in a sentence. */
export function sign(currency: string): string {
  return SYMBOL[currency] ?? currency;
}

/** "₹ Rupees", "AED Dirhams", "CHF": one currency as an option to pick. */
export function label(currency: string): string {
  const name = NAME[currency];
  return name ? `${sign(currency)} ${name}` : currency;
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

/** Amounts added up, each currency on its own: { INR: 750, USD: 20 }. */
export type Sums = Record<string, number>;

export function add(sums: Sums, amount: number, currency: string): Sums {
  sums[currency] = Math.round(((sums[currency] ?? 0) + amount) * 100) / 100;
  return sums;
}

/** "₹24,990 + $20": the trip's own currency first, then the rest by name. "₹0" when there is nothing. */
export function total(sums: Sums, own: string): string {
  const codes = Object.keys(sums).sort((a, b) => (a === own ? -1 : b === own ? 1 : a < b ? -1 : 1));
  if (!codes.length) return money(0, own);
  return codes.map((c) => money(sums[c], c)).join(" + ");
}

const NUMBER = String.raw`(\d{1,3}(?:,\d{2,3})+|\d+)(\.\d{1,2})?\s?(k|lakh|lakhs|lac)?`;
const MARK = String.raw`(₹|\$|€|£|¥|rs\.?|[a-z]{3,7})`;

function amountOf(whole: string, part: string | undefined, scale: string | undefined): number | null {
  let n = Number(`${whole.replace(/,/g, "")}${part ?? ""}`);
  if (scale === "k") n *= 1000;
  else if (scale) n *= 100000;
  n = Math.round(n * 100) / 100;
  return Number.isFinite(n) && n > 0 && n < 1e10 ? n : null;
}

/** The longest name an expense keeps. */
export const MAX_WHAT = 80;

export interface Read {
  what: string;
  amount: number;
  /** Null when they wrote a bare number: it is in the trip's currency. */
  currency: string | null;
}

/** What is left of the line once the amount is taken out: the thing paid for. Null when nothing is. */
function whatOf(rest: string): string | null {
  const what = rest
    .replace(/\s+/g, " ")
    .replace(/^[\s\-:=,.]+|[\s\-:=,]+$/g, "")
    .slice(0, MAX_WHAT)
    .trim();
  // A name has something that isn't a digit in it: "450" on its own names nothing.
  return /[^\d\s.,]/.test(what) ? what : null;
}

/**
 * One expense in a line: what it was and the amount, with or without a currency. The amount
 * ends the line ("lunch 450", "cab rs 300", "hotel 4,500.50 inr", "dinner $20", "flights 12k").
 * An amount that starts the line is taken too ("450 lunch"). Null when the line has no amount
 * in either place, or nothing but the amount.
 */
export function readExpense(line: string): Read | null {
  const t = line.trim().replace(/\s+/g, " ");
  if (!t || t.length > 300) return null;
  const made = (rest: string, amount: number | null, currency: string | null): Read | null => {
    const what = whatOf(rest);
    return amount === null || what === null ? null : { what, amount, currency };
  };
  let m: RegExpExecArray | null;

  // "lunch rs 450", "lunch ₹450", "cab $20"
  m = new RegExp(String.raw`^(.*?)(?:^|\s)${MARK}\s?${NUMBER}$`, "i").exec(t);
  if (m && currencyOf(m[2])) return made(m[1], amountOf(m[3], m[4], m[5]?.toLowerCase()), currencyOf(m[2]));
  // "lunch 450 rs", "cab 20 usd", "lunch 450₹"
  m = new RegExp(String.raw`^(.*?)(?:^|\s)${NUMBER}\s?${MARK}$`, "i").exec(t);
  if (m && currencyOf(m[5])) return made(m[1], amountOf(m[2], m[3], m[4]?.toLowerCase()), currencyOf(m[5]));
  // "lunch 450"
  m = new RegExp(String.raw`^(.*?)(?:\s|[-:=])${NUMBER}$`, "i").exec(t);
  if (m) return made(m[1], amountOf(m[2], m[3], m[4]?.toLowerCase()), null);

  // The amount first: "rs 450 lunch", "$20 cab"
  m = new RegExp(String.raw`^${MARK}\s?${NUMBER}\s+(.+)$`, "i").exec(t);
  if (m && currencyOf(m[1])) return made(m[5], amountOf(m[2], m[3], m[4]?.toLowerCase()), currencyOf(m[1]));
  // "450 rs lunch"
  m = new RegExp(String.raw`^${NUMBER}\s?${MARK}\s+(.+)$`, "i").exec(t);
  if (m && currencyOf(m[4])) return made(m[5], amountOf(m[1], m[2], m[3]?.toLowerCase()), currencyOf(m[4]));
  // "450 lunch"
  m = new RegExp(String.raw`^${NUMBER}\s+(.+)$`, "i").exec(t);
  if (m) return made(m[4], amountOf(m[1], m[2], m[3]?.toLowerCase()), null);
  return null;
}

/** A line that is only an amount ("500", "rs 500", "20 usd"): a reply that corrects one. */
export function readAmount(text: string): { amount: number; currency: string | null } | null {
  const t = text.trim();
  let m = new RegExp(String.raw`^${MARK}\s?${NUMBER}$`, "i").exec(t);
  if (m && currencyOf(m[1])) {
    const amount = amountOf(m[2], m[3], m[4]?.toLowerCase());
    return amount === null ? null : { amount, currency: currencyOf(m[1]) };
  }
  m = new RegExp(String.raw`^${NUMBER}\s?${MARK}$`, "i").exec(t);
  if (m && currencyOf(m[4])) {
    const amount = amountOf(m[1], m[2], m[3]?.toLowerCase());
    return amount === null ? null : { amount, currency: currencyOf(m[4]) };
  }
  m = new RegExp(String.raw`^${NUMBER}$`, "i").exec(t);
  if (!m) return null;
  const amount = amountOf(m[1], m[2], m[3]?.toLowerCase());
  return amount === null ? null : { amount, currency: null };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-03" -> "3 Nov". */
export function sayDay(day: string): string {
  const [, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1] ?? ""}`.trim();
}
