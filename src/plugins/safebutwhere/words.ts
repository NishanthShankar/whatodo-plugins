/**
 * Reading what a person wrote about a thing, and finding things again. Plain word matching
 * over what was kept, so it costs nothing to run and needs no outside service.
 */

export const MAX_WHAT = 500;
export const MAX_TAGS = 12;
export const MAX_TAG = 30;

/** One tag, tidy: lowercase, no "#", single spaces. Empty when nothing is left. */
export function cleanTag(raw: string): string {
  return raw.replace(/^#+/, "").toLowerCase().replace(/[\s_]+/g, " ").trim().slice(0, MAX_TAG);
}

export function cleanTags(raw: string[]): string[] {
  const out: string[] = [];
  for (const r of raw) {
    const tag = cleanTag(r);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}

/**
 * What a message says about a thing: its words, and the tags written into them (#documents).
 * The words keep everything but the tags, exactly as written. Nothing is split into "what" and
 * "where": the whole line is kept and searched.
 */
export function read(text: string): { what: string | null; tags: string[] } {
  const tags = cleanTags([...text.matchAll(/#([\p{L}\p{N}][\p{L}\p{N}_-]*)/gu)].map((m) => m[1].replace(/-/g, " ")));
  const what = text
    .replace(/#[\p{L}\p{N}][\p{L}\p{N}_-]*/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:.-]+|[\s,;:-]+$/g, "")
    .slice(0, MAX_WHAT);
  return { what: what || null, tags };
}

/**
 * Words sent for photos double as a tag when they are short: "passport" after three photos
 * tags all three "passport". Longer lines are a description only.
 */
export function shortAsTag(what: string | null): string[] {
  if (!what) return [];
  const count = what.split(/\s+/).length;
  return count <= 3 && !/[,;:.]/.test(what) ? cleanTags([what]) : [];
}

const PLACE_WORD = /\b(in|inside|on|at|under|underneath|behind|beside|near|next to|above|below|with|top|bottom|left|right|drawer|shelf|locker|cupboard|almirah|wardrobe|box|bag|file|folder|pocket|room|kitchen|garage|office)\b/i;

/**
 * True when a line of words reads like something to keep, not something to look for: it says
 * a thing and a place ("passport, blue file", "spare key under the pot"), or carries a tag.
 */
export function looksKept(text: string): boolean {
  if (/#[\p{L}\p{N}]/u.test(text)) return true;
  if (text.split(/\s+/).length < 2) return false;
  return /[,;:]|\s-\s/.test(text) || PLACE_WORD.test(text);
}

/** Words that say "I'm looking for something", not what it is. */
const STOP = new Set(
  "a an and the of to in on at for from with about by is it its this that these those was were be been i me my mine you your we our they them do did does can could would should have has had find search show get give send look looking want need where which what who when how please kept keep put placed place stored left thing things stuff again".split(
    " ",
  ),
);

/** "Keys" and "key" are one word. */
function stem(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/** Every word in a text, lowercase, in order. Letters and digits of any script. */
export function allWords(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).map(stem);
}

/** The words of a search worth matching on. */
export function searchWords(text: string): string[] {
  return [...new Set(allWords(text).filter((w) => !STOP.has(w) && w.length > 1))];
}

export interface Searchable {
  /** Newest wins a tie. */
  at: number;
  tags: string[];
  what: string | null;
  /** The name and address of the position kept with it. */
  where: string | null;
}

/** How well one word is found in a field's words: 1 exact, 0.6 as the start of a word, 0 not. */
function hit(word: string, field: Set<string>): number {
  if (field.has(word)) return 1;
  if (word.length >= 3) for (const w of field) if (w.startsWith(word)) return 0.6;
  return 0;
}

/**
 * The things that match a search, best first. A thing must match as many of the words as the
 * best one does, so "blue file" doesn't bring back everything that only says "blue".
 */
export function rank<T extends Searchable>(items: T[], query: string): T[] {
  const q = searchWords(query);
  if (!q.length) return [];
  const scored: { item: T; matched: number; score: number }[] = [];
  for (const item of items) {
    const fields = [
      { weight: 5, set: new Set(allWords(item.tags.join(" "))) },
      { weight: 4, set: new Set(allWords(item.what ?? "")) },
      { weight: 2, set: new Set(allWords(item.where ?? "")) },
    ];
    let matched = 0;
    let score = 0;
    for (const w of q) {
      let best = 0;
      for (const f of fields) best = Math.max(best, hit(w, f.set) * f.weight);
      if (best > 0) matched++;
      score += best;
    }
    if (matched) scored.push({ item, matched, score });
  }
  const most = Math.max(0, ...scored.map((s) => s.matched));
  return scored
    .filter((s) => s.matched === most)
    .sort((a, b) => b.score - a.score || b.item.at - a.item.at)
    .map((s) => s.item);
}

/** Metres between two positions. */
export function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h))));
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "3 March", or "3 March 2025" when it isn't this year. `day` and `today` are "YYYY-MM-DD". */
export function sayDay(day: string, today: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}${day.slice(0, 4) === today.slice(0, 4) ? "" : ` ${y}`}`;
}
