/**
 * Date math for periods and pregnancy. Days are "YYYY-MM-DD" in the person's zone.
 * Rules and sources are in README.md ("How predictions work").
 */

export const DAY_MS = 86_400_000;

export function toUtc(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function fromUtc(ms: number): string {
  const t = new Date(ms);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

export function addDays(day: string, n: number): string {
  return fromUtc(toUtc(day) + n * DAY_MS);
}

/** b - a in days. */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

/** "Mon 20 Nov" (adds the year when it isn't `today`'s year). */
export function pretty(day: string, today?: string): string {
  const t = new Date(toUtc(day));
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][t.getUTCDay()];
  const mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][t.getUTCMonth()];
  const year = today && today.slice(0, 4) !== day.slice(0, 4) ? ` ${day.slice(0, 4)}` : "";
  return `${wd} ${t.getUTCDate()} ${mo}${year}`;
}

// ── Periods ──────────────────────────────────────────────────────────────────

export const MIN_CYCLE = 15;
export const MAX_CYCLE = 60;

export interface Period {
  start: string;
  end?: string;
}

/** Cycle lengths between consecutive starts, oldest first; only plausible ones. */
export function cycles(starts: string[]): number[] {
  const s = [...starts].sort();
  const out: number[] = [];
  for (let i = 1; i < s.length; i++) {
    const len = daysBetween(s[i - 1], s[i]);
    if (len >= MIN_CYCLE && len <= MAX_CYCLE) out.push(len);
  }
  return out;
}

/** Mean of the last 6 usable cycles, rounded; the fallback when there are none. */
export function averageCycle(starts: string[], fallback: number): number {
  const c = cycles(starts).slice(-6);
  if (!c.length) return fallback;
  return Math.round(c.reduce((a, b) => a + b, 0) / c.length);
}

export function averagePeriodLength(periods: Period[]): number | null {
  const lens = periods.filter((p) => p.end).map((p) => daysBetween(p.start, p.end!) + 1).filter((n) => n >= 1 && n <= 14);
  if (!lens.length) return null;
  return Math.round(lens.slice(-6).reduce((a, b) => a + b, 0) / Math.min(lens.length, 6));
}

export interface Prediction {
  lastStart: string;
  cycle: number;
  nextPeriod: string;
  /** Positive when the next period is overdue. */
  daysLate: number;
  ovulation: string;
  fertileStart: string;
  fertileEnd: string;
}

/**
 * Next period = last start + average cycle. Ovulation is about 14 days before the next
 * period; the fertile window is the 5 days before ovulation and the day of ovulation.
 */
export function predict(starts: string[], fallbackCycle: number, today: string): Prediction | null {
  if (!starts.length) return null;
  const lastStart = [...starts].sort().at(-1)!;
  const cycle = averageCycle(starts, fallbackCycle);
  const nextPeriod = addDays(lastStart, cycle);
  const ovulation = addDays(nextPeriod, -14);
  return {
    lastStart,
    cycle,
    nextPeriod,
    daysLate: Math.max(0, daysBetween(nextPeriod, today)),
    ovulation,
    fertileStart: addDays(ovulation, -5),
    fertileEnd: ovulation,
  };
}

// ── Pregnancy ────────────────────────────────────────────────────────────────

export const PREGNANCY_DAYS = 280;

export interface PregnancyStatus {
  lmp: string;
  dueDate: string;
  daysPregnant: number;
  weeks: number;
  days: number;
  trimester: 1 | 2 | 3;
  daysToGo: number;
}

/** Naegele's rule: due date = LMP + 280 days. Trimesters: up to 13w6d, 14w0d to 27w6d, 28w0d on. */
export function pregnancy(lmp: string, today: string): PregnancyStatus {
  const daysPregnant = daysBetween(lmp, today);
  const weeks = Math.floor(daysPregnant / 7);
  return {
    lmp,
    dueDate: addDays(lmp, PREGNANCY_DAYS),
    daysPregnant,
    weeks,
    days: daysPregnant % 7,
    trimester: weeks < 14 ? 1 : weeks < 28 ? 2 : 3,
    daysToGo: daysBetween(today, addDays(lmp, PREGNANCY_DAYS)),
  };
}

/**
 * Pregnancy month (1-9), the way people in India count it. Approximate: doctors count weeks.
 * Map aligned to ACOG trimesters: 1: 0-4, 2: 5-8, 3: 9-13, 4: 14-17, 5: 18-22, 6: 23-27,
 * 7: 28-31, 8: 32-35, 9: 36 on.
 */
export function pregnancyMonth(weeks: number): number {
  const ends = [4, 8, 13, 17, 22, 27, 31, 35];
  const i = ends.findIndex((e) => weeks <= e);
  return i === -1 ? 9 : i + 1;
}

export function ordinal(n: number): string {
  return `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;
}

export function weeksLabel(s: PregnancyStatus): string {
  const w = `${s.weeks} week${s.weeks === 1 ? "" : "s"}`;
  return s.days ? `${w} ${s.days} day${s.days === 1 ? "" : "s"}` : w;
}
