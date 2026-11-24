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

/** "₹24,990 + $20": the person's own currency first, then the rest by name. "₹0" when there is nothing. */
export function total(sums: Sums, own: string): string {
  const codes = Object.keys(sums).sort((a, b) => (a === own ? -1 : b === own ? 1 : a < b ? -1 : 1));
  if (!codes.length) return money(0, own);
  return codes.map((c) => money(sums[c], c)).join(" + ");
}
