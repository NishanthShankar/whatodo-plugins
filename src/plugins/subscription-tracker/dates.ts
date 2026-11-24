/**
 * Days, as "YYYY-MM-DD" strings in the person's zone. Pure functions: nothing here touches the
 * kit, and no clock is read (every `Date` is built from numbers).
 */

const MS = 86_400_000;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const parts = (day: string) => day.split("-").map(Number) as [number, number, number];
const utc = (day: string) => {
  const [y, m, d] = parts(day);
  return Date.UTC(y, m - 1, d);
};
const pad = (n: number) => String(n).padStart(2, "0");
const lastOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** A day from its numbers, or null when there is no such day (30 February). */
export function makeDay(y: number, m: number, d: number): string | null {
  if (!(y >= 2000 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= lastOf(y, m))) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** How many days from `from` to `to`: negative when `to` is earlier. */
export const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / MS);

export function addDays(day: string, n: number): string {
  const t = new Date(utc(day) + n * MS);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 0 Sunday to 6 Saturday. */
export const weekday = (day: string) => new Date(utc(day)).getUTCDay();

/**
 * `n` months on, on day `dom` of that month (the last day when the month is shorter). Giving
 * the day keeps "the 31st" from turning into the 28th for good after one February.
 */
export function addMonths(day: string, n: number, dom?: number): string {
  const [y, m, d] = parts(day);
  const at = y * 12 + (m - 1) + n;
  const ny = Math.floor(at / 12);
  const nm = (at % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(dom ?? d, lastOf(ny, nm)))}`;
}

export type Every = "weekly" | "monthly" | "quarterly" | "yearly" | "once";

/** The next date after `day` for something that comes round `every` so often. */
export function nextAfter(day: string, every: Every, dom?: number): string {
  if (every === "weekly") return addDays(day, 7);
  if (every === "quarterly") return addMonths(day, 3, dom);
  if (every === "yearly") return addMonths(day, 12, dom);
  return addMonths(day, 1, dom);
}

/** "14 February", with the year when it isn't this one: "14 February 2028". */
export function sayDate(day: string, today: string): string {
  const [y, m, d] = parts(day);
  return `${d} ${MONTHS[m - 1]}${y === parts(today)[0] ? "" : ` ${y}`}`;
}

/** How a day within reach is said: "today", "tomorrow", "Friday", else "on 14 February". */
export function sayWhen(day: string, today: string): string {
  const n = daysBetween(today, day);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n > 1 && n < 7) return DAYS[weekday(day)];
  return `on ${sayDate(day, today)}`;
}

/** The weekday's name, for a list of the week ahead. */
export const sayWeekday = (day: string) => DAYS[weekday(day)];
export const WEEKDAYS = DAYS;

/** How near a date is, in the nearest true words: "in 3 weeks", "in a month". */
export function sayNear(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 14) return `in ${days} days`;
  if (days < 28) return `in ${Math.round(days / 7)} weeks`;
  if (days < 35) return "in a month";
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  if (days < 345) return `in ${Math.round(days / 30)} months`;
  if (days < 550) return "in a year";
  return `in ${Math.round(days / 365)} years`;
}

/** A length of days the way a person says it: "5 days", "a week", "4 weeks", "9 months". */
export function sayLength(days: number): string {
  if (days < 7) return days === 1 ? "a day" : `${days} days`;
  if (days < 60) return days < 11 ? "a week" : `${Math.round(days / 7)} weeks`;
  if (days < 345) return `${Math.round(days / 30)} months`;
  return days < 550 ? "a year" : `${Math.round(days / 365)} years`;
}

export interface FoundDate {
  day: string;
  /** The day of the month alone was given ("on the 5th"): it comes round every month. */
  monthly: boolean;
  /** The text with the date taken out. */
  rest: string;
}

const MON = String.raw`(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?`;
const ORD = String.raw`(?:st|nd|rd|th)`;

/** A date with no year is the next one that comes: this year's, or next year's when that has passed. */
function coming(m: number, d: number, today: string, past: boolean): string | null {
  const y = parts(today)[0];
  const day = makeDay(y, m, d);
  if (!day) return makeDay(y + 1, m, d);
  if (past) return day > today ? makeDay(y - 1, m, d) : day;
  return day < today ? makeDay(y + 1, m, d) : day;
}

/**
 * The first date in a line of lowercase text. `past`: the date is of something that already
 * happened (a bank's message about a debit), so a date with no year is the latest one gone by.
 */
export function findDate(text: string, today: string, past = false): FoundDate | null {
  const cut = (m: RegExpExecArray) => `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`.replace(/\s+/g, " ").trim();
  const year = (y: string | undefined) => (y ? (y.length === 2 ? 2000 + Number(y) : Number(y)) : null);
  let m: RegExpExecArray | null;

  if ((m = /\b(20\d\d)-(\d{2})-(\d{2})\b/.exec(text))) {
    const day = makeDay(Number(m[1]), Number(m[2]), Number(m[3]));
    if (day) return { day, monthly: false, rest: cut(m) };
  }
  if ((m = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](20\d\d|\d\d))?\b/.exec(text))) {
    const y = year(m[3]);
    const day = y ? makeDay(y, Number(m[2]), Number(m[1])) : coming(Number(m[2]), Number(m[1]), today, past);
    if (day) return { day, monthly: false, rest: cut(m) };
  }
  if ((m = new RegExp(String.raw`\b(?:on\s+)?(?:the\s+)?(\d{1,2})${ORD}?[\s-]+(?:of\s+)?${MON}(?:,?[\s-]+(20\d\d|\d\d\b))?`).exec(text))) {
    const mon = SHORT.indexOf(m[2].slice(0, 3)) + 1;
    const y = year(m[3]);
    const day = y ? makeDay(y, mon, Number(m[1])) : coming(mon, Number(m[1]), today, past);
    if (day) return { day, monthly: false, rest: cut(m) };
  }
  if ((m = new RegExp(String.raw`\b(?:on\s+)?${MON}\s+(\d{1,2})${ORD}?\b(?:,?\s+(20\d\d))?`).exec(text))) {
    const mon = SHORT.indexOf(m[1].slice(0, 3)) + 1;
    const y = year(m[3]);
    const day = y ? makeDay(y, mon, Number(m[2])) : coming(mon, Number(m[2]), today, past);
    if (day) return { day, monthly: false, rest: cut(m) };
  }
  if ((m = /\b(today|tomorrow)\b/.exec(text))) return { day: m[1] === "today" ? today : addDays(today, 1), monthly: false, rest: cut(m) };
  // The day of the month alone: "on the 5th", "5th", "on 5".
  if ((m = new RegExp(String.raw`\b(?:on\s+)?(?:the\s+)?(\d{1,2})${ORD}\b|\bon\s+(?:the\s+)?(\d{1,2})\b(?!\s*[/-]\d)`).exec(text))) {
    const dom = Number(m[1] ?? m[2]);
    if (dom >= 1 && dom <= 31) {
      const [y, mo] = parts(today);
      const here = `${y}-${pad(mo)}-${pad(Math.min(dom, lastOf(y, mo)))}`;
      return { day: here > today ? here : addMonths(here, 1, dom), monthly: true, rest: cut(m) };
    }
  }
  return null;
}
