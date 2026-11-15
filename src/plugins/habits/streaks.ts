/** Streaks and the 🟩⬜ grid. Days are "YYYY-MM-DD" in the person's zone. */

export function shiftDay(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/** Days in a row up to today. Today not answered yet doesn't break it: count from yesterday. */
export function streak(done: Set<string>, today: string): number {
  let day = done.has(today) ? today : shiftDay(today, -1);
  let n = 0;
  while (done.has(day)) {
    n++;
    day = shiftDay(day, -1);
  }
  return n;
}

export function bestStreak(done: Set<string>): number {
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of [...done].sort()) {
    run = prev && shiftDay(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/** Oldest to newest, ending today: 🟩 done, ⬜ not. Days before `since` are left out. */
export function grid(done: Set<string>, today: string, days = 7, since?: string): string {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = shiftDay(today, -i);
    if (since && d < since) continue;
    out.push(done.has(d) ? "🟩" : "⬜");
  }
  return out.join("");
}

export function cleanName(name: string): string {
  const n = name.trim().replace(/\s+/g, " ").replace(/^[:\-\s]+|[.\s]+$/g, "").slice(0, 60);
  return n.charAt(0).toUpperCase() + n.slice(1);
}
