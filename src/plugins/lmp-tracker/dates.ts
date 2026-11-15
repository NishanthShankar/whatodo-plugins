import { addDays } from "./calc";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function valid(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1) return null;
  const max = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > max) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Read a day from text: today, yesterday, "3 days ago", "12 nov", "nov 12", "12/11",
 * "12/11/2026", "2026-11-12" (day first). Without a year, `direction` decides: "past" picks
 * the most recent such date on or before today, "future" the next one on or after today.
 * Returns null when the text isn't a date.
 */
export function parseDay(text: string, today: string, direction: "past" | "future"): string | null {
  const t = text.trim().toLowerCase().replace(/[,.]/g, " ").replace(/\s+/g, " ").replace(/^(on|from|since)\s+/, "");
  if (!t || t === "today") return today;
  if (t === "yesterday") return addDays(today, -1);
  let m = t.match(/^(\d{1,3}) days? ago$/);
  if (m) return addDays(today, -Number(m[1]));
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return valid(+m[1], +m[2], +m[3]);

  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;
  m = t.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (m) {
    day = +m[1];
    month = +m[2];
    if (m[3]) year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  }
  if (!m) {
    m = t.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)(?:\s+(\d{4}))?$/);
    if (m && MONTHS.includes(m[2].slice(0, 3))) {
      day = +m[1];
      month = MONTHS.indexOf(m[2].slice(0, 3)) + 1;
      if (m[3]) year = +m[3];
    }
  }
  if (day === null) {
    m = t.match(/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?$/);
    if (m && MONTHS.includes(m[1].slice(0, 3))) {
      month = MONTHS.indexOf(m[1].slice(0, 3)) + 1;
      day = +m[2];
      if (m[3]) year = +m[3];
    }
  }
  if (day === null || month === null) return null;
  if (year !== null) return valid(year, month, day);
  const thisYear = Number(today.slice(0, 4));
  const candidate = valid(thisYear, month, day);
  if (!candidate) return valid(direction === "past" ? thisYear - 1 : thisYear + 1, month, day);
  if (direction === "past" && candidate > today) return valid(thisYear - 1, month, day);
  if (direction === "future" && candidate < today) return valid(thisYear + 1, month, day);
  return candidate;
}
