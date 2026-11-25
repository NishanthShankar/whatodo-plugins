/**
 * Reading a job out of a message: "bins every day, Ravi Asha Kiran", "bathroom every Sunday,
 * take turns", "gas when needed", "water filter every 90 days".
 */
import { countOf, weekday, weekdayOf, type Rhythm } from "./when";

export const MAX_NAME = 40;
export const MAX_ROTA = 12;

export interface ReadJob {
  name: string;
  rhythm: Rhythm;
  /** The names given, "everyone" for "take turns", or null when nobody was named: anyone. */
  rota: string[] | "everyone" | null;
}

const WD = "(?:mon|tue|tues|wed|weds|wednes|thu|thur|thurs|fri|sat|satur|sun)(?:day)?s?";
const WD_LIST = `${WD}(?:\\s*(?:,|and|&|/)?\\s*(?:and\\s+)?${WD})*`;

/** Each rhythm as people write it, and what it means. Tried in order; the first that is found wins. */
const RHYTHMS: [RegExp, (m: RegExpMatchArray, today: string) => Rhythm | null][] = [
  [/\b(?:when(?:ever)? (?:it(?:'s| is) )?needed|as needed|as and when|on request|when (?:it |we )?runs? out|no fixed day)\b/i, () => ({ kind: "asked" })],
  [
    /\b(?:(?:monthly|every month|each month|once a month)(?:,? on(?: the)? (\d{1,2})(?:st|nd|rd|th)?)?|(?:on )?the (\d{1,2})(?:st|nd|rd|th)(?: of (?:every|each|the) month)?|on (\d{1,2})(?:st|nd|rd|th)? (?:of )?(?:every|each) month|every (\d{1,2})(?:st|nd|rd|th))\b/i,
    (m, today) => {
      const date = Number(m[1] ?? m[2] ?? m[3] ?? m[4] ?? today.slice(8));
      return date >= 1 && date <= 31 ? { kind: "monthly", date } : null;
    },
  ],
  [
    /\b(?:every|each) (other|second|alternate|\d{1,3}|two|three|four|five|six|seven|eight|nine|ten) (days?|weeks?)\b/i,
    (m, today) => {
      const n = /^(other|second|alternate)$/i.test(m[1]) ? 2 : countOf(m[1]);
      const days = (n ?? 0) * (m[2].toLowerCase().startsWith("week") ? 7 : 1);
      if (days === 1) return { kind: "daily" };
      return days >= 2 && days <= 365 ? { kind: "every", n: days, from: today } : null;
    },
  ],
  [/\b(?:alternate days|every other day)\b/i, (_m, today) => ({ kind: "every", n: 2, from: today })],
  [/\b(?:fortnightly|every fortnight)\b/i, (_m, today) => ({ kind: "every", n: 14, from: today })],
  [/\b(?:every ?day|daily|each day|every single day)\b/i, () => ({ kind: "daily" })],
  [/\b(?:on |every |each )?(weekdays|weekends)\b/i, (m) => ({ kind: "weekdays", days: m[1].toLowerCase() === "weekdays" ? [1, 2, 3, 4, 5] : [0, 6] })],
  [
    // "every" has to be there: "see you on Sunday" is not a job.
    new RegExp(`\\b(?:every|each)\\s+(${WD_LIST})\\b`, "i"),
    (m) => {
      const days = [...new Set((m[1].match(new RegExp(WD, "gi")) ?? []).map(weekdayOf).filter((d) => d >= 0))].sort((a, b) => a - b);
      if (!days.length) return null;
      return days.length === 7 ? { kind: "daily" } : { kind: "weekdays", days };
    },
  ],
  [/\b(?:weekly|every week|each week|once a week)\b/i, (_m, today) => ({ kind: "weekdays", days: [weekday(today)] })],
];

const NAME_WORD = /^\p{L}[\p{L}'.-]{0,19}$/u;

/** "Ravi Asha Kiran", "Ravi, Asha and Kiran" → the names, or null when it isn't a list of names. */
export function readNames(words: string): string[] | null {
  const parts = (/[,;&/]/.test(words) ? words.split(/[,;&/]|\band\b|\bthen\b/i) : words.split(/\s+/))
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p && !/^(and|then)$/i.test(p));
  if (!parts.length || parts.length > MAX_ROTA) return null;
  const out: string[] = [];
  for (const p of parts) {
    const bits = p.split(" ");
    if (bits.length > 2 || !bits.every((b) => NAME_WORD.test(b))) return null;
    const name = bits.map((b) => b[0].toUpperCase() + b.slice(1)).join(" ");
    if (!out.some((o) => o.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out;
}

/** What follows the rhythm: who takes turns. */
export function readRota(words: string): string[] | "everyone" | null | undefined {
  const t = words
    .replace(/^[\s,:;-]+/, "")
    .replace(/^(?:by|with|between|for|rota|turns|who|shared by)\b[\s:]*/i, "")
    .replace(/[.!]+$/, "")
    .trim();
  if (!t || /^(anyone|anybody|whoever|no turns|no rota|any of us)$/i.test(t)) return null;
  if (/^(take turns|taking turns|we take turns|in turns|by turns|everyone|everybody|all of us|we all|all)$/i.test(t)) return "everyone";
  const names = readNames(t);
  return names ?? undefined;
}

/** A job's name as it is kept: its first letter capital, no stray marks. */
export function cleanName(words: string): string | null {
  const name = words
    .replace(/[*_~`]/g, "")
    .replace(/^(?:add|new|a|the)\s+(?:a\s+)?(?:new\s+)?(?:job|chore|task)\s*[:,-]?\s*/i, "")
    .replace(/^(?:add|job|chore|task)\s*[:,-]?\s+/i, "")
    .replace(/[\s,:;-]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name || name.length > MAX_NAME || !/\p{L}/u.test(name) || name.split(" ").length > 5) return null;
  return name[0].toUpperCase() + name.slice(1);
}

/** A whole job line, or null when the message isn't one. */
export function readJob(text: string, today: string): ReadJob | null {
  const line = text.replace(/\s+/g, " ").trim();
  if (line.includes("\n") || line.length > 200) return null;
  for (const [re, make] of RHYTHMS) {
    const m = line.match(re);
    if (!m || m.index === undefined || m.index === 0) continue;
    const rhythm = make(m, today);
    const name = cleanName(line.slice(0, m.index));
    if (!rhythm || !name) return null;
    const rota = readRota(line.slice(m.index + m[0].length));
    if (rota === undefined) return null;
    return { name, rhythm, rota };
  }
  return null;
}

/** Only the rhythm, from a message already known to be about one: "make it every monday". */
export function readRhythm(text: string, today: string): Rhythm | null {
  for (const [re, make] of RHYTHMS) {
    const m = text.match(re);
    if (m) return make(m, today);
  }
  return null;
}
