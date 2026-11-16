/** Streaks, the 🟩⬜ grid and habit days. Days are "YYYY-MM-DD" in the person's zone. */

export function shiftDay(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/** 0 Sunday ... 6 Saturday. */
export function weekday(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Weekdays a habit is due on. null or empty: every day. */
export type Days = number[] | null | undefined;

export function isOn(days: Days, day: string): boolean {
  return !days || !days.length || days.includes(weekday(day));
}

/**
 * Due days in a row up to today. Days the habit isn't due on are skipped (they don't break it),
 * though doing it on one still counts. Today not answered yet doesn't break it either.
 */
export function streak(done: Set<string>, today: string, days?: Days): number {
  let n = 0;
  let day = today;
  for (let i = 0; i < 3660; i++, day = shiftDay(day, -1)) {
    if (done.has(day)) n++;
    else if (day !== today && isOn(days, day)) break;
  }
  return n;
}

export function bestStreak(done: Set<string>, days?: Days, today?: string): number {
  const sorted = [...done].sort();
  if (!sorted.length) return 0;
  const end = today && today > sorted.at(-1)! ? today : sorted.at(-1)!;
  let best = 0;
  let run = 0;
  for (let day = sorted[0], i = 0; day <= end && i < 3660; day = shiftDay(day, 1), i++) {
    if (done.has(day)) best = Math.max(best, ++run);
    else if (isOn(days, day) && day !== today) run = 0;
  }
  return best;
}

/** Oldest to newest, ending today: 🟩 done, ⬜ due and not done, ▫️ not due. Days before `since` are left out. */
export function grid(done: Set<string>, today: string, n = 7, since?: string, days?: Days): string {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = shiftDay(today, -i);
    if (since && d < since) continue;
    out.push(done.has(d) ? "🟩" : isOn(days, d) ? "⬜" : "▫️");
  }
  return out.join("");
}

const NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WORDS: Record<string, number> = {
  sun: 0, sunday: 0, sundays: 0,
  mon: 1, monday: 1, mondays: 1,
  tue: 2, tues: 2, tuesday: 2, tuesdays: 2,
  wed: 3, weds: 3, wednesday: 3, wednesdays: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, thursdays: 4,
  fri: 5, friday: 5, fridays: 5,
  sat: 6, saturday: 6, saturdays: 6,
};

/**
 * "mon wed fri", "Tue and Thu", "weekdays", "weekends", "every day" → sorted weekdays, or
 * null for every day. undefined when the text isn't a list of days.
 */
export function parseDays(text: string): number[] | null | undefined {
  const t = text.toLowerCase().replace(/[.!]+$/, "").trim();
  if (/^(?:every ?day|daily|all days|each day|any day)$/.test(t)) return null;
  const tokens = t.split(/[\s,/&+]+/).filter((w) => w && !/^(?:and|on|every|each|only)$/.test(w));
  if (!tokens.length) return undefined;
  const set = new Set<number>();
  for (const w of tokens) {
    if (w === "weekdays" || w === "weekday") [1, 2, 3, 4, 5].forEach((d) => set.add(d));
    else if (w === "weekends" || w === "weekend") [0, 6].forEach((d) => set.add(d));
    else if (w in WORDS) set.add(WORDS[w]);
    else return undefined;
  }
  return set.size === 7 ? null : [...set].sort((a, b) => a - b);
}

/** "every day", "weekdays", "weekends" or "Mon, Wed, Fri". */
export function daysLabel(days: Days): string {
  if (!days || !days.length || days.length === 7) return "every day";
  const k = days.join(",");
  if (k === "1,2,3,4,5") return "weekdays";
  if (k === "0,6") return "weekends";
  return days.map((d) => NAMES[d]).join(", ");
}

export function cleanName(name: string): string {
  const n = name.trim().replace(/\s+/g, " ").replace(/^[:\-\s]+|[.\s]+$/g, "").slice(0, 60);
  return n.charAt(0).toUpperCase() + n.slice(1);
}
