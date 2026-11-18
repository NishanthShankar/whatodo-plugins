/**
 * Finding a saved link by a few words. Plain word matching over what was kept (your note, the
 * title, who posted it, the caption), so it costs nothing to run and needs no outside service.
 */

/** Words that say "I'm looking for something", not what it is about. */
const STOP = new Set(
  "a an and the of to in on at for from with about by is it its this that these those was were be been i me my mine you your we our they them do did does can could would should have has had find search show get give send look looking want need where which what who when how please one ones some any saved save link links video videos clip clips thing stuff again".split(
    " ",
  ),
);

/** "Recipes" and "recipe" are one word. */
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
export function words(text: string): string[] {
  return [...new Set(allWords(text).filter((w) => !STOP.has(w) && w.length > 1))];
}

export interface Searchable {
  /** Newest wins a tie. */
  at: number;
  note: string | null;
  title: string | null;
  author: string | null;
  /** Site, kind and group name: "youtube short recipes". */
  where: string;
  description: string | null;
}

const WEIGHTS: [keyof Omit<Searchable, "at">, number][] = [
  ["note", 5],
  ["title", 4],
  ["author", 3],
  ["where", 3],
  ["description", 1],
];

/** How well one word is found in a field's words: 1 exact, 0.6 as the start of a word, 0 not. */
function hit(word: string, field: Set<string>): number {
  if (field.has(word)) return 1;
  if (word.length >= 3) for (const w of field) if (w.startsWith(word)) return 0.6;
  return 0;
}

/**
 * The items that match a search, best first. An item must match as many of the words as the
 * best item does, so "pasta recipe" doesn't bring back everything that only says "recipe".
 */
export function rank<T extends Searchable>(items: T[], query: string): T[] {
  const q = words(query);
  if (!q.length) return [];
  const scored: { item: T; matched: number; score: number }[] = [];
  for (const item of items) {
    const fields = WEIGHTS.map(([name, weight]) => ({ weight, set: new Set(allWords(item[name] ?? "")) }));
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
