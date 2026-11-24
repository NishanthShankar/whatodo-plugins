/**
 * What the app knows before anyone tells it: well-known services and which kind each is, and
 * the things that run out, with their usual length and how early to speak. Names and kinds
 * only. It never states a rule, a fine or a grace period: those differ by place and change.
 */

/** "use": use it or lose it. "keeps": it keeps things running. "trial": a free trial. "expires": it ends unless someone acts. */
export type Kind = "use" | "keeps" | "trial" | "expires";

const USE = [
  "netflix", "amazon prime", "prime video", "jiohotstar", "hotstar", "sonyliv", "sony liv", "zee5", "spotify", "youtube premium", "youtube music", "apple music", "apple tv", "audible",
  "kindle unlimited", "swiggy one", "zomato gold", "cult.fit", "cultfit", "cult fit", "gym", "linkedin premium", "tinder", "bumble", "duolingo", "headspace", "calm", "chatgpt", "claude",
  "canva", "notion", "adobe", "xbox game pass", "game pass", "playstation plus", "ps plus", "newspaper", "magazine",
];

const KEEPS = ["icloud", "google one", "microsoft 365", "office 365", "dropbox", "web hosting", "hosting", "phone plan", "mobile plan", "postpaid", "broadband", "wifi", "dth", "password manager", "1password", "vpn"];

export interface Thing {
  /** What people call it, lowercase. The first that is found in the name wins. */
  words: string[];
  /** How long one usually lasts, in months: only used to offer the next date. Null: none offered. */
  months: number | null;
  /** The first notice is never later than this many days before. */
  floor: number;
  /** It can also renew by itself (insurance on AutoPay), so the app asks when it can't tell. */
  either?: boolean;
}

export const THINGS: Thing[] = [
  { words: ["passport"], months: 120, floor: 270 },
  { words: ["driving licence", "driving license", "licence", "license"], months: null, floor: 60 },
  { words: ["puc", "pollution"], months: 6, floor: 0 },
  { words: ["vehicle insurance", "car insurance", "bike insurance", "motor insurance", "scooter insurance"], months: 12, floor: 14, either: true },
  { words: ["health insurance", "health cover", "mediclaim", "medical insurance"], months: 12, floor: 14, either: true },
  { words: ["life insurance", "life cover", "term insurance", "term plan", "lic"], months: 12, floor: 14, either: true },
  { words: ["insurance"], months: 12, floor: 14, either: true },
  { words: ["warranty", "guarantee"], months: null, floor: 14 },
  { words: ["amc"], months: 12, floor: 0 },
  { words: ["rent agreement", "rental agreement", "lease"], months: 11, floor: 60 },
  { words: ["debit card", "credit card", "bank card"], months: null, floor: 14 },
  { words: ["visa", "permit"], months: null, floor: 90 },
  { words: ["domain"], months: 12, floor: 0, either: true },
];

/** Does a name have this word in it, starting at the start of a word? */
const has = (name: string, word: string) => ` ${name}`.includes(` ${word.trim()}`);

/** The kind of a well-known service, by its name. Null when it isn't on the list. */
export function serviceKind(name: string): Kind | null {
  const n = name.toLowerCase();
  if (USE.some((w) => has(n, w))) return "use";
  if (KEEPS.some((w) => has(n, w))) return "keeps";
  return null;
}

/** The thing that runs out which a name is about ("Amma's passport"), or null. */
export function thingOf(name: string): Thing | null {
  const n = name.toLowerCase();
  return THINGS.find((t) => t.words.some((w) => has(n, w))) ?? null;
}

/** The steps a notice's lead is rounded to, in days: something a person would say. */
const STEPS = [1, 2, 3, 4, 5, 7, 14, 21, 30, 49, 60, 90, 180, 270];
const nearest = (n: number) => STEPS.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best), STEPS[0]);

/**
 * How many days before the date the first notice goes, for something `away` days off on the
 * day it is entered: 1.5 x the square root of the wait, never later than the thing's floor
 * (the owner, 2026-11-23). A second notice at a third of that when the first is more than a
 * month ahead. Null: the date is too near for a notice before the day before.
 */
export function leads(away: number, floor: number): { first: number | null; middle: number | null; late: boolean } {
  const byFormula = nearest(1.5 * Math.sqrt(Math.max(away, 1)));
  const lead = Math.max(byFormula, floor);
  // The time the thing takes has already gone: say so when it is entered, and speak again at once.
  const late = floor > 0 && away < floor;
  const first = lead < away && lead > 1 ? lead : null;
  const middle = first !== null && first > 30 ? nearest(first / 3) : null;
  return { first, middle, late };
}
