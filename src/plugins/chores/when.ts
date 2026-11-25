/**
 * Days and rhythms. Everything here is worked out from "YYYY-MM-DD" strings handed in by the
 * kit: no clock is read (every `Date` is built from numbers).
 */

/** How often a job comes round. */
export type Rhythm =
  | { kind: "daily" }
  /** On these weekdays: 0 Sunday to 6 Saturday. */
  | { kind: "weekdays"; days: number[] }
  /** Every `n` days, counted from `from`. Doing the job starts the count again. */
  | { kind: "every"; n: number; from: string }
  /** Once a month on this date; on the month's last day when the month is shorter. */
  | { kind: "monthly"; date: number }
  /** No fixed day: it is on the list when someone says it is needed. */
  | { kind: "asked" };

const utc = (day: string): number => {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const iso = (ms: number): string => {
  const t = new Date(ms);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
};

export const isDay = (day: unknown): day is string => typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) && iso(utc(day)) === day;
/** 0 Sunday to 6 Saturday. */
export const weekday = (day: string): number => new Date(utc(day)).getUTCDay();
export const shift = (day: string, n: number): string => iso(utc(day) + n * 86400000);
/** Whole days from `a` to `b`. */
export const between = (a: string, b: string): number => Math.round((utc(b) - utc(a)) / 86400000);
const lastOf = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Does the rhythm fall on this day? */
export function dueOn(r: Rhythm, day: string): boolean {
  if (r.kind === "daily") return true;
  if (r.kind === "weekdays") return r.days.includes(weekday(day));
  if (r.kind === "every") {
    const gap = between(r.from, day);
    return gap >= 0 && gap % r.n === 0;
  }
  if (r.kind === "monthly") {
    const [y, m, d] = day.split("-").map(Number);
    return d === Math.min(r.date, lastOf(y, m));
  }
  return false;
}

/** The first day after `day` the rhythm falls on, or null for a job with no fixed day. */
export function nextAfter(r: Rhythm, day: string): string | null {
  if (r.kind === "asked") return null;
  for (let i = 1; i <= 400; i++) {
    const d = shift(day, i);
    if (dueOn(r, d)) return d;
  }
  return null;
}

/** A rhythm that came from the page, checked. Null when it isn't one. */
export function cleanRhythm(v: unknown, today: string): Rhythm | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (r.kind === "daily") return { kind: "daily" };
  if (r.kind === "asked") return { kind: "asked" };
  if (r.kind === "weekdays" && Array.isArray(r.days)) {
    const days = [...new Set(r.days.filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))].sort((a, b) => a - b);
    if (!days.length) return null;
    return days.length === 7 ? { kind: "daily" } : { kind: "weekdays", days };
  }
  if (r.kind === "every" && Number.isInteger(r.n) && (r.n as number) >= 2 && (r.n as number) <= 365) {
    return { kind: "every", n: r.n as number, from: isDay(r.from) ? r.from : today };
  }
  if (r.kind === "monthly" && Number.isInteger(r.date) && (r.date as number) >= 1 && (r.date as number) <= 31) return { kind: "monthly", date: r.date as number };
  return null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/** "mon", "tues", "wednesday" → 0 to 6, or -1. */
export function weekdayOf(word: string): number {
  const w = word.toLowerCase().replace(/s$/, "");
  if (!/^(sun|mon|tue|tues|wed|wednes|thu|thur|thurs|fri|sat|satur)(day)?$/.test(w)) return -1;
  return WEEKDAYS.indexOf(w.slice(0, 3));
}

/** "3", "three", "a" → a count, or null. */
export function countOf(word: string): number | null {
  const w = word.toLowerCase();
  if (/^\d{1,3}$/.test(w)) return Number(w);
  return NUMBERS[w] ?? null;
}

/**
 * The day someone is back, from what follows "away": "till the 12th", "until friday",
 * "till 12 dec", "for 3 days", "today". "open" when no day is named: away until they say so.
 * Null when there are words but no day can be read from them.
 */
export function readBack(words: string, today: string): string | "open" | null {
  const t = words.toLowerCase().replace(/[.,!]/g, " ").replace(/\s+/g, " ").trim();
  if (!t || /^(for now|now|for a while|from today|from now)$/.test(t)) return "open";
  if (/^(today|for today|for the day)$/.test(t)) return shift(today, 1);
  if (/^(tomorrow|till tomorrow|until tomorrow|til tomorrow)$/.test(t)) return /^tomorrow$/.test(t) ? shift(today, 2) : shift(today, 1);

  let m = t.match(/^for (?:the next )?(\w+) (day|days|night|nights|week|weeks)$/);
  if (m) {
    const n = countOf(m[1]);
    if (!n) return null;
    const days = n * (m[2].startsWith("week") ? 7 : 1);
    return days > 366 ? null : shift(today, days);
  }
  m = t.match(/^(?:till|til|until|upto|up to|to|back on|back|through)\s+(.+)$/);
  const on = (m ? m[1] : t).replace(/^(?:the|next|this|on)\s+/, "");
  if (/^next week$/.test(m ? m[1] : t)) return shift(today, 7);
  if (on === "tomorrow") return shift(today, 1);

  const wd = weekdayOf(on);
  if (wd >= 0) {
    const gap = (wd - weekday(today) + 7) % 7 || 7;
    return shift(today, gap);
  }
  const [y, mo, d] = today.split("-").map(Number);
  // "12", "12th": the next day with that date.
  let dm = on.match(/^(\d{1,2})(?:st|nd|rd|th)?$/);
  if (dm) {
    const date = Number(dm[1]);
    if (date < 1 || date > 31) return null;
    for (let i = 0; i < 3; i++) {
      const month = mo + i + (date > d ? 0 : 1);
      const yy = y + Math.floor((month - 1) / 12);
      const mm = ((month - 1) % 12) + 1;
      if (date <= lastOf(yy, mm)) return `${yy}-${String(mm).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
    }
    return null;
  }
  // "12 dec", "dec 12", "12th of december".
  dm = on.match(/^(\d{1,2})(?:st|nd|rd|th)?(?: of)? ([a-z]{3,9})$/) ?? null;
  const md = dm ? null : on.match(/^([a-z]{3,9}) (\d{1,2})(?:st|nd|rd|th)?$/);
  const date = dm ? Number(dm[1]) : md ? Number(md[2]) : 0;
  const month = MONTHS.indexOf((dm ? dm[2] : md ? md[1] : "").slice(0, 3)) + 1;
  if (!date || !month) return null;
  for (const yy of [y, y + 1]) {
    const day = `${yy}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
    if (isDay(day) && day > today) return day;
  }
  return null;
}

/** "7", "7am", "7 pm", "19:00", "noon" → 0 to 23, or null. */
export function readHour(words: string): number | null {
  const t = words.toLowerCase().replace(/\s+/g, "").replace(/\.$/, "");
  if (t === "noon") return 12;
  if (t === "midnight") return 0;
  const m = t.match(/^(\d{1,2})(?::00)?(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[2]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[2] === "pm" ? 12 : 0);
  }
  return h >= 0 && h <= 23 ? h : null;
}
