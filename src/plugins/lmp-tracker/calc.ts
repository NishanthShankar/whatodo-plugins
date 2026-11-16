/**
 * Date math for LMPs, reminders and pregnancy. Days are "YYYY-MM-DD" in the person's zone.
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

// ── LMPs ─────────────────────────────────────────────────────────────────────

/** Gaps between LMPs that count as a cycle. Longer gaps are a month the person didn't log. */
export const MIN_CYCLE = 15;
export const MAX_CYCLE = 45;
/** The learned cycle stays in this range. */
export const SHORTEST = 21;
export const LONGEST = 45;

export interface Period {
  start: string;
  /** Written by 1.x and 2.x ("period ended"). No longer used. */
  end?: string;
}

/** Cycle lengths between consecutive LMPs, oldest first; only plausible ones. */
export function cycles(starts: string[]): number[] {
  const s = [...starts].sort();
  const out: number[] = [];
  for (let i = 1; i < s.length; i++) {
    const len = daysBetween(s[i - 1], s[i]);
    if (len >= MIN_CYCLE && len <= MAX_CYCLE) out.push(len);
  }
  return out;
}

/** Cycles seen before the learned cycle fully replaces the usual 4 weeks. */
export const LEARN_AFTER = 3;

/**
 * The person's usual cycle: the median of their last 6 cycles, kept between 21 and 45 days.
 * Until 3 cycles are known the missing ones count as `fallback` (4 weeks), so one late month
 * doesn't move the reminders but two in a row do. The median also ignores one odd month later.
 */
export function typicalCycle(starts: string[], fallback: number): number {
  const c = cycles(starts).slice(-6);
  while (c.length < LEARN_AFTER) c.push(fallback);
  c.sort((a, b) => a - b);
  const mid = Math.floor(c.length / 2);
  const median = c.length % 2 ? c[mid] : Math.round((c[mid - 1] + c[mid]) / 2);
  return Math.min(LONGEST, Math.max(SHORTEST, median));
}

/** The longest of the last 6 cycles, or null with none. */
export function longestCycle(starts: string[]): number | null {
  const c = cycles(starts).slice(-6);
  return c.length ? Math.max(...c) : null;
}

export type Stage = "due" | "again" | "upt";

export interface Plan {
  lmp: string;
  cycle: number;
  /** Next period expected: LMP + usual cycle (4 weeks for a 28-day cycle). */
  due: string;
  /** Second reminder, a week later (5 weeks). */
  again: string;
  /** Pregnancy test nudge (6 weeks): two weeks after it was due, and never before a week past her longest recent cycle. */
  upt: string;
}

export function plan(lmp: string, cycle: number, longest: number | null = null): Plan {
  const upt = Math.max(cycle + 14, (longest ?? 0) + 7);
  return { lmp, cycle, due: addDays(lmp, cycle), again: addDays(lmp, cycle + 7), upt: addDays(lmp, upt) };
}

/** Which reminder `today` falls in, if any. After a week of the test nudge nothing more is sent. */
export function stageOn(p: Plan, today: string): Stage | null {
  if (today < p.due) return null;
  if (today < p.again) return "due";
  if (today < p.upt) return "again";
  if (daysBetween(p.upt, today) < 7) return "upt";
  return null;
}

/** "4 weeks" on a whole week, otherwise "30 days". */
export function span(days: number): string {
  if (days % 7 === 0) return `${days / 7} week${days === 7 ? "" : "s"}`;
  return `${days} day${days === 1 ? "" : "s"}`;
}

// ── Pregnancy ────────────────────────────────────────────────────────────────

export const PREGNANCY_DAYS = 280;

export interface PregnancyStatus {
  dueDate: string;
  daysPregnant: number;
  weeks: number;
  days: number;
}

/** Naegele's rule: due date = LMP + 280 days. Weeks are counted from the LMP. */
export function pregnancy(lmp: string, today: string): PregnancyStatus {
  const daysPregnant = daysBetween(lmp, today);
  return { dueDate: addDays(lmp, PREGNANCY_DAYS), daysPregnant, weeks: Math.floor(daysPregnant / 7), days: daysPregnant % 7 };
}

export function weeksLabel(s: PregnancyStatus): string {
  const w = `${s.weeks} week${s.weeks === 1 ? "" : "s"}`;
  return s.days ? `${w} ${s.days} day${s.days === 1 ? "" : "s"}` : w;
}
