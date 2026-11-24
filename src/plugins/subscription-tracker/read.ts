/**
 * Reading what people type ("Netflix 649 monthly on the 5th", "car insurance 14 Feb") and the
 * bank messages they forward. Pure functions. The app reads only what it keeps: a name, an
 * amount, a date, how it is paid and the last four digits of the account. A balance, a
 * reference or a policy number in the text is never returned.
 */
import { addDays, findDate, type Every } from "./dates";
import { currencyOf } from "./money";

export type Via = "upi" | "card" | "store" | "unknown";

export interface Read {
  name: string;
  amount: number | null;
  /** Null when the amount came with no currency. */
  currency: string | null;
  /** The date given: the next renewal, the day it runs out or a trial's last day. Null when none was. */
  day: string | null;
  /** How often, when the words said so. */
  every: Every | null;
  via: Via;
  trial: boolean;
  /** The words said it runs out ("expires", "valid till"): true. That it renews: false. Neither: null. */
  expires: boolean | null;
}

/** The longest name kept. */
export const MAX_NAME = 60;

const NUMBER = String.raw`(\d{1,3}(?:,\d{2,3})+|\d+)(\.\d{1,2})?\s?(k|lakh|lakhs|lac)?`;
const MARK = String.raw`(₹|\$|€|£|¥|rs\.?|inr|usd|eur|gbp|aed|sgd|aud|cad|rupees?|dollars?|euros?|pounds?)`;

function amountOf(whole: string, part: string | undefined, scale: string | undefined): number | null {
  let n = Number(`${whole.replace(/,/g, "")}${part ?? ""}`);
  if (scale === "k") n *= 1000;
  else if (scale) n *= 100000;
  n = Math.round(n * 100) / 100;
  return Number.isFinite(n) && n > 0 && n < 1e10 ? n : null;
}

interface FoundAmount {
  amount: number;
  currency: string | null;
  rest: string;
}

const cut = (text: string, m: RegExpExecArray) => `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`.replace(/\s+/g, " ").trim();

/** An amount in a line of lowercase text: one with a currency anywhere, else the last bare number. */
export function findAmount(text: string): FoundAmount | null {
  let m = new RegExp(String.raw`(?:^|\s)${MARK}\s?${NUMBER}(?=$|[\s,.])`).exec(text);
  if (m && currencyOf(m[1])) {
    const amount = amountOf(m[2], m[3], m[4]);
    if (amount !== null) return { amount, currency: currencyOf(m[1]), rest: cut(text, m) };
  }
  m = new RegExp(String.raw`(?:^|\s)${NUMBER}\s?${MARK}(?=$|[\s,.])`).exec(text);
  if (m && currencyOf(m[4])) {
    const amount = amountOf(m[1], m[2], m[3]);
    if (amount !== null) return { amount, currency: currencyOf(m[4]), rest: cut(text, m) };
  }
  const bare = [...text.matchAll(new RegExp(String.raw`(?:^|\s)${NUMBER}(?=$|\s)`, "g"))].pop();
  if (bare) {
    const amount = amountOf(bare[1], bare[2], bare[3]);
    if (amount !== null) return { amount, currency: null, rest: cut(text, bare as RegExpExecArray) };
  }
  return null;
}

const EVERY: [RegExp, Every][] = [
  [/\b(?:every|each|per|a|\/)\s?week\b|\bweekly\b/, "weekly"],
  [/\b(?:every|each|per|a|\/)\s?(?:quarter|3 months|three months)\b|\bquarterly\b/, "quarterly"],
  [/\b(?:every|each|per|a|\/)\s?(?:year|yr)\b|\b(?:yearly|annual|annually|p\.?a\.?)\b/, "yearly"],
  [/\b(?:every|each|per|a|\/)\s?(?:month|mo)\b|\b(?:monthly|p\.?m\.?)\b/, "monthly"],
];

/** How often, when the words say: "monthly", "a year", "every week". */
export function findEvery(text: string): { every: Every; rest: string } | null {
  for (const [re, every] of EVERY) {
    const m = re.exec(text);
    if (m) return { every, rest: cut(text, m) };
  }
  return null;
}

const VIA: [RegExp, Via][] = [
  [/\b(?:(?:by|via|on|through|paid by)\s+)?(?:upi\s?auto\s?pay|auto\s?pay|upi(?:\s+mandate)?|mandate)\b/, "upi"],
  [/\b(?:(?:by|via|on|through|paid by)\s+)?(?:app\s?store|play\s?store|google play)\b/, "store"],
  [/\b(?:(?:by|via|on|through|paid by)\s+)?(?:credit|debit)?\s?card\b/, "card"],
];

const tidyName = (rest: string, original: string) => {
  let name = rest
    .replace(/[|;]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-:=,.]+|[\s\-:=,.]+$/g, "")
    .trim();
  // Words left over from around what was taken out: "netflix on", "for the car".
  for (let i = 0; i < 3; i++) name = name.replace(/\s+(?:on|at|for|from|the|is|of|due|by|and|,)$/i, "").replace(/^(?:add|track|new|my|the|for|to)\s+/i, "").trim();
  // Give back the capitals the person wrote.
  const at = original.toLowerCase().indexOf(name);
  if (at >= 0) name = original.slice(at, at + name.length);
  return name.slice(0, MAX_NAME).trim();
};

/**
 * One subscription or one thing that runs out, from a typed line. Needs a name and either an
 * amount or a date. Null when it has neither, or no name.
 */
export function readSub(line: string, today: string): Read | null {
  const original = line.trim().replace(/\s+/g, " ");
  if (!original || original.length > 300 || original.includes("\n")) return null;
  let t = original.toLowerCase();

  let via: Via = "unknown";
  for (const [re, v] of VIA) {
    // "bank card" and "credit card" are things that run out themselves: the name keeps them.
    if (v === "card" && /\b(?:credit|debit|bank)\s+card\b/.test(t)) continue;
    const m = re.exec(t);
    if (m) {
      via = v;
      t = cut(t, m);
      break;
    }
  }

  let trial = false;
  let m = /\b(?:free\s+)?trial(?:\s+(?:ends?|ending|over|until|till))?\b/.exec(t);
  if (m) {
    trial = true;
    t = cut(t, m);
  }

  let expires: boolean | null = null;
  m = /\b(?:expires?|expiry|expiring|expired|valid\s+(?:till|until|upto|up to)|runs?\s+out|lapses?|ends?|until|till)\b(?:\s+(?:on|by))?/.exec(t);
  if (m) {
    expires = true;
    t = cut(t, m);
  } else if ((m = /\b(?:auto\s?renews?|renews?|renewal|renewing|next\s+(?:bill|payment|charge)|billed|charged|due)\b(?:\s+(?:on|by))?/.exec(t))) {
    expires = m[0].startsWith("due") ? null : false;
    t = cut(t, m);
  }

  const often = findEvery(t);
  if (often) t = often.rest;
  const date = findDate(t, today);
  if (date) t = date.rest;
  const amount = findAmount(t);
  if (amount) t = amount.rest;

  const name = tidyName(t, original);
  if (!/\p{L}/u.test(name)) return null;
  if (!amount && !date) return null;
  return {
    name,
    amount: amount?.amount ?? null,
    currency: amount?.currency ?? null,
    day: date?.day ?? null,
    every: often?.every ?? (date?.monthly ? "monthly" : null),
    via,
    trial,
    expires: trial ? null : expires,
  };
}

export interface Bank {
  /** Null when the message doesn't say who was paid in a way that can be read. */
  name: string | null;
  amount: number;
  currency: string;
  /** The day the money went, when the message has one. */
  day: string | null;
  via: Via;
  /** "HDFC xx4321" or "xx4321". */
  account: string | null;
}

const BANKS = ["hdfc", "icici", "sbi", "axis", "kotak", "idfc", "yes bank", "indusind", "federal", "canara", "pnb", "bob", "union bank", "rbl", "au bank", "hsbc", "citi", "amex", "onecard"];

/**
 * A bank's or a card's message about money going out, forwarded by the person. Null when the
 * text isn't one. Only what the app keeps is read; the balance and the reference are left.
 */
export function readBank(text: string, today: string): Bank | null {
  const flat = text.replace(/\s+/g, " ").trim();
  const t = flat.toLowerCase();
  if (t.length < 25 || t.length > 1000) return null;
  if (!/\b(?:debited|deducted|spent|charged|paid|auto-?debit(?:ed)?|mandate|autopay|txn|transaction)\b/.test(t)) return null;
  // The amount that went, not the balance that is left.
  const paid = t.replace(/\b(?:avl|avail(?:able)?|a\/c|ac|acct)?\.?\s?(?:bal(?:ance)?|limit)\b[^.]*/g, " ");
  const m = /(?:^|[\s:])(rs\.?|inr|₹|usd|\$)\s?(\d{1,3}(?:,\d{2,3})+|\d+)(\.\d{1,2})?/.exec(paid);
  if (!m) return null;
  const amount = amountOf(m[2], m[3], undefined);
  if (amount === null) return null;

  const acct = /\b(?:a\/c|ac|acct|account|card)(?:\s+(?:no\.?|number|ending(?:\s+in)?|ending with))?\s*[:.]?\s*(?:[x*]+\s?-?)?(\d{4})\b/.exec(t) ?? /\b[x*]{2,}(\d{4})\b/.exec(t);
  const bank = BANKS.find((b) => t.includes(b));
  const account = acct ? `${bank ? `${bank.replace(/ bank$/, "").toUpperCase()} ` : ""}xx${acct[1]}` : null;
  const via: Via = /\b(?:upi|mandate|autopay|auto pay)\b/.test(t) ? "upi" : /\bcard\b/.test(t) ? "card" : "unknown";

  // Who was paid: after "to", "at", "towards" or "for", up to where the sentence turns.
  let name: string | null = null;
  const who = /\b(?:towards|to|at|for)\s+(?!a\/c|ac\b|acct|account|your|rs|inr|₹|upi\b|vpa)([a-z0-9][a-z0-9 &.'*_-]{1,40}?)(?=\s+(?:on|via|using|from|thru|through|ref|upi|is|has|was|for|by|dt|dated|avl|bal|txn|not you|if not|successfully|executed)\b|[.,;(]|$)/.exec(t);
  if (who) {
    const at = t.indexOf(who[1], who.index);
    name = flat.slice(at, at + who[1].length).replace(/[*_]+/g, " ").replace(/\s+/g, " ").trim();
    if (/^[A-Z0-9 &.'-]+$/.test(name)) name = name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
    if (!/\p{L}/u.test(name)) name = null;
  }

  const date = findDate(t, today, true);
  return { name: name ? name.slice(0, MAX_NAME) : null, amount, currency: currencyOf(m[1]) ?? "INR", day: date && date.day <= addDays(today, 1) ? date.day : null, via, account };
}
