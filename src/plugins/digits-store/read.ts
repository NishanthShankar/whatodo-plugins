/**
 * Reading numbers the way people type them, with no model: "weight 72.4", "5'6\"", "120/80",
 * "1.5 lakh", "waist 34 hips 39", "MH 12 AB 1234", "12/03/1990". To Digits a value is a string
 * attached to a label; the number inside it, when there is one, is only for drawing a graph.
 *
 * Also: what a label is for matching (its words, order and case aside), what a value looks like
 * in words (the only thing about a value the sorting model ever hears), and whether a value looks
 * like a PIN, a card or an Aadhaar number.
 */

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec";
const MONTH_WORD = `(?:${MONTHS})[a-z]*\\.?`;

/** Units kept with a number when written after it, with or without a space. */
const UNITS_SPACED = [
  "kgs?", "kilos?", "kilograms?", "lbs?", "pounds?", "cm", "mm", "kms?", "kmpl", "km/l", "inch(?:es)?", "ft", "feet", "foot", "%",
  "mg/dl", "mmol/l", "mg", "ml", "litres?", "liters?", "ltrs?", "bpm", "units?", "kwh", "°c", "°f", "years?", "yrs?", "months?",
  "weeks?", "days?", "hours?", "hrs?", "mins?", "minutes?", "steps?", "kcal", "cal", "grams?", "gms?", "meters?", "metres?",
  "miles?", "mph", "kmph", "km/h", "sq\\.?\\s?ft", "sqft", "acres?", "rpm", "psi", "gb", "mb", "tb",
  // Short ones count with a space only at the end: "waist 34 in", "temp 98.6 f".
  "in(?=\\s*(?:$|[,;]))", "[fc](?=\\s*(?:$|[,;]))",
];
/** Short units that only count when written right against the number ("34in", "5m", "500g"). */
const UNITS_ATTACHED = ["in", "m", "g", "l", "c", "f", "k", "\"", "”", "''"];

/** Words around a label that are not part of its name. */
const FILLER = new Set([
  "my", "mine", "our", "the", "a", "an", "is", "was", "are", "were", "of", "for", "to", "be", "it", "its", "it's", "that",
  "current", "latest", "now", "today", "currently", "whats", "what", "what's", "how", "much", "many", "tell", "me", "show",
  "give", "please", "pls", "plz", "s", "did", "do", "i", "have", "has", "kept", "again", "on", "at", "about", "and", "with",
  "this", "morning", "evening", "tonight", "yesterday", "yday",
]);
/** Words dropped from the ends of a label as written, so "my weight is" is shown as "weight". */
const EDGE = new Set(["my", "mine", "our", "the", "a", "an", "is", "was", "are", "of", "for", "to", "today", "now", "this", "morning", "evening", "tonight", "yesterday", "yday", "and", "at", "on", "it", "its", "be", "has", "have"]);

export type Shape = "date" | "height" | "reading" | "id" | "alnum" | "number" | "amount";

export interface Value {
  /** As typed: "72.4 kg", "5'6\"", "120/80", "1.5 lakh". */
  text: string;
  /** The number in it, for a graph: kg as kg, 5'6" as 66 inches, 1.5 lakh as 150000. Null for dates and ids. */
  num: number | null;
  /** The second number of a reading like 120/80. */
  num2: number | null;
  /** "kg", "in", "%"..., or null. */
  unit: string | null;
  shape: Shape;
}

export interface Piece {
  /** The label as written, cleaned of filler at its ends. "" when the message was a number alone. */
  label: string;
  value: Value;
}

export interface Reading {
  pieces: Piece[];
  /** "yesterday" was said: the day it belongs to is one back. */
  daysBack: number;
}

const cleanSpace = (s: string) => s.replace(/\s+/g, " ").trim();

interface Span {
  start: number;
  end: number;
  value: Value;
}

function numberOf(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function unitOf(raw: string | undefined): string | null {
  if (!raw) return null;
  const u = raw.toLowerCase().replace(/\s+/g, "").replace(/\.$/, "");
  if (/^kgs?$|^kilos?$|^kilograms?$/.test(u)) return "kg";
  if (/^lbs?$|^pounds?$/.test(u)) return "lb";
  if (/^inch(es)?$|^in$|^"$|^”$|^''$/.test(u)) return "in";
  if (/^ft$|^feet$|^foot$/.test(u)) return "ft";
  if (/^litres?$|^liters?$|^ltrs?$|^l$/.test(u)) return "l";
  if (/^grams?$|^gms?$|^g$/.test(u)) return "g";
  if (/^kms?$/.test(u)) return "km";
  if (/^meters?$|^metres?$|^m$/.test(u)) return "m";
  if (/^years?$|^yrs?$/.test(u)) return "years";
  if (/^hours?$|^hrs?$/.test(u)) return "hours";
  if (/^mins?$|^minutes?$/.test(u)) return "minutes";
  if (/^units?$/.test(u)) return "units";
  if (/^steps?$/.test(u)) return "steps";
  if (/^sq\.?ft$|^sqft$/.test(u)) return "sq ft";
  return u;
}

/** Every value in the text, in order. Spans never overlap: the first pattern to claim a stretch keeps it. */
function findValues(text: string): Span[] {
  const spans: Span[] = [];
  const free = (s: number, e: number) => spans.every((x) => e <= x.start || s >= x.end);
  const claim = (re: RegExp, make: (m: RegExpExecArray) => Value | null) => {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const start = m.index + (m[0].length - m[0].trimStart().length);
      const end = m.index + m[0].trimEnd().length;
      if (end <= start || !free(start, end)) continue;
      const value = make(m);
      if (value) spans.push({ start, end, value: { ...value, text: cleanSpace(text.slice(start, end)) } });
    }
  };
  const v = (shape: Shape, num: number | null, unit: string | null = null, num2: number | null = null): Value => ({ text: "", num, num2, unit, shape });

  // A date: "12 March 1990", "March 12", "12/03/1990".
  claim(new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH_WORD}(?:,?\\s+\\d{4})?(?![a-z])`, "gi"), () => v("date", null));
  claim(new RegExp(`\\b${MONTH_WORD}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?(?![a-z0-9])`, "gi"), () => v("date", null));
  claim(/\b\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2})(?![\d/.-])/g, () => v("date", null));
  // A height in feet and inches: 5'6", 5' 6, 5 ft 6 in, 5 feet 6 inches.
  claim(/\b(\d)\s*(?:'|’|ft\.?|feet|foot)\s*(\d{1,2}(?:\.\d+)?)\s*(?:"|”|''|in\b|inch(?:es)?\b)?/gi, (m) => {
    const inches = Number(m[1]) * 12 + Number(m[2]);
    return Number(m[2]) < 12 ? v("height", inches, "in") : null;
  });
  // A reading of two numbers: 120/80.
  claim(/\b(\d{1,3})\s*\/\s*(\d{1,3})\b(?!\s*\/)/g, (m) => v("reading", Number(m[1]), null, Number(m[2])));
  // Digits in groups, as numbers that are ids are written: "1234 5678 9012", "+91 98765 43210".
  claim(/(?:\+\d{1,3}[\s-]?)?\b\d{3,5}(?:[\s-]\d{3,5}){1,4}\b/g, (m) => (m[0].replace(/\D/g, "").length >= 8 ? v("id", null) : null));
  // An amount or a number, with a unit if one follows.
  const spaced = UNITS_SPACED.join("|");
  const attached = UNITS_ATTACHED.join("|");
  claim(
    new RegExp(
      `(₹|rs\\.?|inr|\\$|usd|€|£)?\\s?(-?\\d[\\d,]*(?:\\.\\d+)?|-?\\.\\d+)` +
        `(?:\\s?(lakhs?|lacs?|lakh|crores?|cr)(?![a-z]))?` +
        `(?:\\s?(${spaced})(?![a-z])|(${attached})(?![a-z0-9]))?`,
      "gi",
    ),
    (m) => {
      const before = text[m.index + (m[0].length - m[0].trimStart().length) - 1];
      if (before && /[a-z]/i.test(before) && !m[1]) return null; // "MH12": part of a word, read below
      const after = text[m.index + m[0].length];
      if (after && /[a-z]/i.test(after) && !m[4] && !m[5]) return null; // "4B": part of a word, read below
      const raw = m[2];
      const digits = raw.replace(/\D/g, "");
      let num = numberOf(raw);
      const big = m[3]?.toLowerCase();
      if (num !== null && big) num *= /^cr/.test(big) ? 1e7 : 1e5;
      const unit = unitOf(m[4] ?? m[5]);
      if (num !== null && unit === "k") return v("number", num * 1000, "thousand");
      if (m[1] || big) return v("amount", num, m[1] ? (/₹|rs|inr/i.test(m[1]) ? "₹" : m[1].toUpperCase()) : null);
      // A long run of digits is an id (a phone, an account), not a quantity.
      if (!raw.includes(".") && !raw.includes(",") && digits.length >= 9) return v("id", null);
      return v("number", num, unit);
    },
  );
  // Letters and digits in one word: "MH12AB1234", "4B", "B12".
  claim(/\b(?=[a-z]*\d)(?=\d*[a-z])[a-z0-9-]{2,}\b/gi, () => v("alnum", null));

  spans.sort((a, b) => a.start - b.start);
  return mergeSpaced(text, spans);
}

/**
 * "MH 12 AB 1234": a registration number written with spaces reads as short capital words between
 * numbers. Two values with one such word between them are one value, and so is a capital word just
 * before it once there are two of those words in it.
 */
function mergeSpaced(text: string, spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const s of spans) {
    const prev = out.at(-1);
    const gap = prev ? text.slice(prev.end, s.start) : "";
    if (prev && /^\s+[A-Z]{1,3}\s+$/.test(gap) && prev.value.shape !== "date" && s.value.shape !== "date") {
      out[out.length - 1] = { start: prev.start, end: s.end, value: { text: cleanSpace(text.slice(prev.start, s.end)), num: null, num2: null, unit: null, shape: "alnum" } };
    } else out.push(s);
  }
  for (let i = 0; i < out.length; i++) {
    const s = out[i];
    if (s.value.shape !== "alnum" || (s.value.text.match(/\b[A-Z]{1,3}\b/g) ?? []).length < 1) continue;
    const lead = /(?:^|\s)([A-Z]{1,3})\s+$/.exec(text.slice(i > 0 ? out[i - 1].end : 0, s.start));
    if (lead) {
      const start = s.start - lead[0].trimStart().length;
      out[i] = { start, end: s.end, value: { ...s.value, text: cleanSpace(text.slice(start, s.end)) } };
    }
  }
  return out;
}

/** A label as written, with filler and punctuation taken off its ends: "my weight is" -> "weight". */
export function tidyLabel(raw: string): string {
  const words = raw
    .replace(/[?!:=,;()[\]{}*_~]+/g, " ")
    .replace(/(^|\s)[-–.]+(?=\s|$)/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (words.length && EDGE.has(words[0].toLowerCase())) words.shift();
  while (words.length && EDGE.has(words.at(-1)!.toLowerCase())) words.pop();
  return words.join(" ").replace(/^[-.'’]+|[-.]+$/g, "").trim();
}

/** What a message holds: one value or several, each with its label. Null when there is no value in it. */
export function readNumbers(text: string): Reading | null {
  const flat = cleanSpace(text);
  if (!/\d/.test(flat)) return null;
  const spans = findValues(flat);
  if (!spans.length) return null;
  const daysBack = /\b(yesterday|yday)\b/i.test(flat) ? 1 : 0;
  const gaps: string[] = [];
  for (let i = 0; i <= spans.length; i++) gaps.push(flat.slice(i === 0 ? 0 : spans[i - 1].end, i === spans.length ? flat.length : spans[i].start));
  const labels = gaps.map(tidyLabel);

  if (spans.length === 1) {
    const label = tidyLabel(`${gaps[0]} ${gaps[1]}`);
    return { pieces: [{ label, value: spans[0].value }], daysBack };
  }
  // Several values. Labels come before their values ("waist 34 hips 39"), or after ("34 waist 39 hips").
  const before = labels[0] !== "";
  const named = spans.map((s, i) => ({ label: before ? labels[i] : labels[i + 1], value: s.value }));
  if (named.every((p) => p.label)) {
    // Words after the last value in "label value" order belong to nothing: "waist 34 hips 39 in the morning".
    return { pieces: named, daysBack };
  }
  // Values with no label between them ("BP 120 80") are one value.
  const joined: Value = { text: spans.map((s) => s.value.text).join(" "), num: spans[0].value.num, num2: spans[1].value.num, unit: null, shape: spans.length === 2 && spans.every((s) => s.value.shape === "number") ? "reading" : "alnum" };
  return { pieces: [{ label: tidyLabel(labels.join(" ")), value: joined }], daysBack };
}

/** A value read alone, as typed on the page or in a reply: "72.1", "5'7\"". Null when it holds no value, or more than one. */
export function readValue(text: string): Value | null {
  const r = readNumbers(text);
  if (!r || r.pieces.length !== 1 || r.pieces[0].label) return null;
  return r.pieces[0].value;
}

// ── Matching labels ──

/** The words of a label that say what it is: lower case, no filler, no "'s". */
export function wordsOf(label: string): string[] {
  return label
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w));
}

function closeTo(a: string, b: string): boolean {
  if (a.length > b.length) [a, b] = [b, a];
  // A slip never changes the first letter: "height" is not "weight".
  if (a[0] !== b[0]) return false;
  // Two letters swapped: "wieght".
  if (a.length === b.length && a.length >= 4) {
    const diff = [...a].map((c, i) => (c === b[i] ? -1 : i)).filter((i) => i >= 0);
    if (diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]]) return true;
  }
  if (b.length - a.length > 1 || b.length < 5) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length === b.length) i++;
    j++;
  }
  return edits + (b.length - j) + (a.length - i) <= 1;
}

/** One word is the other: the same, a plural ("hips", "hip"), or one slip of the finger in a longer word. */
export function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 3 && b.length >= 3 && (`${a}s` === b || `${b}s` === a || `${a}es` === b || `${b}es` === a)) return true;
  const s = (w: string) => w.replace(/(es|s)$/, "");
  if (a.length > 3 && b.length > 3 && s(a) === s(b)) return true;
  return closeTo(a, b);
}

const has = (words: string[], w: string) => words.some((x) => sameWord(x, w));

/** Two labels name the same thing: the same words in any order. */
export function sameLabel(a: string[], b: string[]): boolean {
  return a.length > 0 && a.length === b.length && a.every((w) => has(b, w)) && b.every((w) => has(a, w));
}

export interface Named {
  id: string;
  words: string[];
}

/**
 * Which kept labels a question is about, by our own matching. "Weight?" finds "weight"; "ring" finds
 * every ring; "what's Amma's ring size now" finds "ring Amma". Empty when nothing matches directly,
 * which is when the sorting model may be asked.
 */
export function directMatch<T extends Named>(question: string[], labels: T[]): T[] {
  if (!question.length) return [];
  const exact = labels.filter((l) => sameLabel(question, l.words));
  if (exact.length) return exact;
  // Every word asked is in the label: "ring" -> "ring Amma", "ring Papa".
  const wider = labels.filter((l) => question.every((w) => has(l.words, w)));
  if (wider.length) return wider;
  // Every word of the label is in the question: "Amma ring size" -> "ring Amma".
  const inside = labels.filter((l) => l.words.length && l.words.every((w) => has(question, w)));
  if (!inside.length) return [];
  const most = Math.max(...inside.map((l) => l.words.length));
  return inside.filter((l) => l.words.length === most);
}

/** How many words of a question a label shares, to put the likeliest first when the model is asked. */
export function overlap(question: string[], label: string[]): number {
  return question.filter((w) => has(label, w)).length;
}

// ── A value described in words, for the sorting model, which never sees the value ──

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const UNIT_WORDS: Record<string, string> = { kg: "kilograms", lb: "pounds", in: "inches", cm: "centimetres", "%": "percent", ft: "feet", km: "kilometres", l: "litres", g: "grams" };

/** "a twelve digit number", "a decimal number in kilograms", "a date". No digit ever. */
export function shapeWords(v: Value): string {
  if (v.unit === "thousand") return "a number in thousands";
  const unit = v.unit && v.unit !== "₹" ? ` in ${UNIT_WORDS[v.unit] ?? v.unit.replace(/\d/g, "")}` : "";
  switch (v.shape) {
    case "date":
      return "a date";
    case "height":
      return "a height in feet and inches";
    case "reading":
      return "two numbers written with a slash";
    case "alnum":
      return "letters and digits";
    case "amount":
      return `an amount of money${v.unit && v.unit !== "₹" ? "" : " in rupees"}`;
    case "id":
    case "number": {
      const digits = v.text.replace(/\D/g, "").length;
      if (v.text.includes(".")) return `a decimal number${unit}`;
      const n = digits <= 20 ? NUMBER_WORDS[digits] : "long";
      return `a ${n} digit number${unit}`;
    }
  }
}

// ── Numbers people may not want sitting in a chat ──

const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
/** Aadhaar numbers end in a Verhoeff check digit. */
function verhoeff(digits: string): boolean {
  let c = 0;
  const r = digits.split("").reverse();
  for (let i = 0; i < r.length; i++) c = D[c][P[i % 8][Number(r[i])]];
  return c === 0;
}
/** Card numbers end in a Luhn check digit. */
function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export type Secret = "pin" | "card" | "aadhaar";
/** What is locked when kept: shown by its last four only (the owner, 2026-11-26: "certain messages lock it"). */
export const LOCKED: Secret[] = ["pin", "card"];
/** A locked value as it is shown: a card by its last four ("•••• 1111"), a PIN not at all. */
export const masked = (text: string, what: Secret) => (what === "card" ? `•••• ${text.replace(/[^\p{L}\p{N}]/gu, "").slice(-4)}` : "••••");
const PIN_WORDS = ["pin", "atm", "upi", "mpin", "cvv", "otp", "password", "passcode", "passwd"];

/**
 * Whether a value looks like something people usually keep out of a chat. Never a reason to refuse
 * it: Digits keeps it and offers a way to delete the message.
 */
export function secretOf(label: string[], v: Value): Secret | null {
  const digits = v.text.replace(/\D/g, "");
  const onlyDigits = /^[\d\s-]+$/.test(v.text);
  const phone = label.some((w) => /^(phone|mobile|cell|number|whatsapp|landline|contact)$/.test(w)) && !label.some((w) => /aadh?a+r|uid/.test(w));
  if (onlyDigits && !phone && digits.length >= 13 && digits.length <= 19 && luhn(digits)) return "card";
  if (onlyDigits && !phone && digits.length === 12 && /^[2-9]/.test(digits) && verhoeff(digits)) return "aadhaar";
  // A postal PIN code is not a PIN.
  const postal = label.some((w) => /^(code|pincode|postal|zip|area)$/.test(w));
  if (onlyDigits && !postal && digits.length >= 3 && digits.length <= 6 && label.some((w) => PIN_WORDS.includes(w))) return "pin";
  return null;
}

// ── Dates: said back in words, and reminded when they are birthdays or still to come ──

export interface DateParts {
  d: number;
  m: number;
  /** Null when no year was written. */
  y: number | null;
}

const MONTH_INDEX = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const daysIn = (m: number, y: number | null) => [31, y !== null && y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : y === null ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

/** The day, month and year of a value read as a date. Numbers are day first, as written in India: 12/03 is 12 March. */
export function dateOf(text: string): DateParts | null {
  const t = text.toLowerCase();
  let d: number;
  let m: number;
  let y: number | null = null;
  const num = /^(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(t);
  if (num) {
    d = Number(num[1]);
    m = Number(num[2]);
    y = num[3] ? Number(num[3]) : null;
    if (y !== null && num[3].length === 2) y += y > 40 ? 1900 : 2000;
  } else {
    const mw = /([a-z]+)\.?/.exec(t.replace(/\d+(st|nd|rd|th)/g, (x) => x.replace(/[a-z]+/, "")));
    const month = mw ? MONTH_INDEX.findIndex((p) => mw[1].startsWith(p)) : -1;
    const nums = (t.match(/\d+/g) ?? []).map(Number);
    if (month < 0 || !nums.length) return null;
    m = month + 1;
    d = nums[0];
    y = nums.find((n) => n >= 1000) ?? null;
  }
  if (m < 1 || m > 12 || d < 1 || d > daysIn(m, y)) return null;
  return { d, m, y };
}

/** "12 March", "12 March 1990". */
export function sayDate(p: DateParts): string {
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${p.d} ${names[p.m - 1]}${p.y !== null ? ` ${p.y}` : ""}`;
}

const YEARLY_WORDS = /^(birthday|bday|b'day|birth|born|dob|anniversary|anniv|janmadin)$/;
const DATE_WORDS = /^(date|due|expiry|expires|expire|expiring|valid|till|until|deadline|renewal|renew|on)$/;
/** Words that make "12/03" a date and not a reading: a birthday, an expiry. "bangle 2/4" stays a reading. */
export const saysDate = (label: string[]) => isYearly(label) || label.some((w) => DATE_WORDS.test(w));

/** A birthday or an anniversary comes round every year. */
export const isYearly = (label: string[]) => label.some((w) => YEARLY_WORDS.test(w));

/** "YYYY-MM-DD" of a date in a given year; 29 February falls on the 28th in other years. */
export function dayIn(p: DateParts, y: number): string {
  const d = Math.min(p.d, daysIn(p.m, y));
  return `${y}-${String(p.m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * What a date is reminded as: "yearly" (a birthday), "once" (a day still to come), or null (a day
 * gone, like a date of joining). A date with no year and no birthday word is taken as its next one.
 */
export function remindOf(label: string[], p: DateParts, today: string): { kind: "yearly" | "once"; day: string } | null {
  const year = Number(today.slice(0, 4));
  if (isYearly(label)) {
    const day = dayIn(p, year) >= today ? dayIn(p, year) : dayIn(p, year + 1);
    return { kind: "yearly", day };
  }
  if (p.y === null) {
    const day = dayIn(p, year) >= today ? dayIn(p, year) : dayIn(p, year + 1);
    return { kind: "once", day };
  }
  const day = dayIn(p, p.y);
  return day >= today ? { kind: "once", day } : null;
}
