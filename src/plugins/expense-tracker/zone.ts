/**
 * A trip's own clock. Trips cross time zones, so a trip can run on the time of the place it is in and not on the time of
 * the person who added the app: its days, and the hour its split is sent, follow that. A zone is an IANA name
 * ("Asia/Bangkok"), or "Etc/GMT-7" when all that is known is the hour someone said it was.
 */

/** Where a currency is spent, when that is one time zone (or, for a few, the one most trips there are in). Currencies used across several zones (USD, AUD, CAD) say nothing. */
const ZONE_OF_CURRENCY: Record<string, string> = {
  INR: "Asia/Kolkata",
  THB: "Asia/Bangkok",
  JPY: "Asia/Tokyo",
  SGD: "Asia/Singapore",
  AED: "Asia/Dubai",
  LKR: "Asia/Colombo",
  NPR: "Asia/Kathmandu",
  MYR: "Asia/Kuala_Lumpur",
  VND: "Asia/Ho_Chi_Minh",
  // Most trips counted in rupiah are to Bali.
  IDR: "Asia/Makassar",
  GBP: "Europe/London",
  EUR: "Europe/Paris",
  CHF: "Europe/Zurich",
  HKD: "Asia/Hong_Kong",
  KRW: "Asia/Seoul",
  CNY: "Asia/Shanghai",
  TRY: "Europe/Istanbul",
  EGP: "Africa/Cairo",
  ZAR: "Africa/Johannesburg",
  QAR: "Asia/Qatar",
  SAR: "Asia/Riyadh",
  OMR: "Asia/Muscat",
  BHD: "Asia/Bahrain",
  KWD: "Asia/Kuwait",
  MVR: "Indian/Maldives",
  BTN: "Asia/Thimphu",
  PHP: "Asia/Manila",
  NZD: "Pacific/Auckland",
  MUR: "Indian/Mauritius",
  KES: "Africa/Nairobi",
  BDT: "Asia/Dhaka",
  KHR: "Asia/Phnom_Penh",
  TWD: "Asia/Taipei",
  ILS: "Asia/Jerusalem",
  SEK: "Europe/Stockholm",
  NOK: "Europe/Oslo",
  DKK: "Europe/Copenhagen",
  CZK: "Europe/Prague",
  HUF: "Europe/Budapest",
  PLN: "Europe/Warsaw",
  ISK: "Atlantic/Reykjavik",
  GEL: "Asia/Tbilisi",
  AZN: "Asia/Baku",
};

/** Places people name, beyond the city at the end of a zone's own name (those are read from the zone list below). Lower case. */
const PLACES: Record<string, string> = {
  india: "Asia/Kolkata",
  ist: "Asia/Kolkata",
  delhi: "Asia/Kolkata",
  mumbai: "Asia/Kolkata",
  bangalore: "Asia/Kolkata",
  bengaluru: "Asia/Kolkata",
  chennai: "Asia/Kolkata",
  goa: "Asia/Kolkata",
  thailand: "Asia/Bangkok",
  phuket: "Asia/Bangkok",
  japan: "Asia/Tokyo",
  osaka: "Asia/Tokyo",
  kyoto: "Asia/Tokyo",
  uae: "Asia/Dubai",
  "abu dhabi": "Asia/Dubai",
  "sri lanka": "Asia/Colombo",
  nepal: "Asia/Kathmandu",
  malaysia: "Asia/Kuala_Lumpur",
  kl: "Asia/Kuala_Lumpur",
  vietnam: "Asia/Ho_Chi_Minh",
  hanoi: "Asia/Ho_Chi_Minh",
  saigon: "Asia/Ho_Chi_Minh",
  bali: "Asia/Makassar",
  indonesia: "Asia/Jakarta",
  uk: "Europe/London",
  england: "Europe/London",
  scotland: "Europe/London",
  france: "Europe/Paris",
  germany: "Europe/Berlin",
  italy: "Europe/Rome",
  spain: "Europe/Madrid",
  barcelona: "Europe/Madrid",
  portugal: "Europe/Lisbon",
  netherlands: "Europe/Amsterdam",
  switzerland: "Europe/Zurich",
  austria: "Europe/Vienna",
  greece: "Europe/Athens",
  turkey: "Europe/Istanbul",
  egypt: "Africa/Cairo",
  "south africa": "Africa/Johannesburg",
  "cape town": "Africa/Johannesburg",
  kenya: "Africa/Nairobi",
  maldives: "Indian/Maldives",
  bhutan: "Asia/Thimphu",
  philippines: "Asia/Manila",
  "hong kong": "Asia/Hong_Kong",
  korea: "Asia/Seoul",
  "south korea": "Asia/Seoul",
  china: "Asia/Shanghai",
  beijing: "Asia/Shanghai",
  taiwan: "Asia/Taipei",
  "new zealand": "Pacific/Auckland",
  mauritius: "Indian/Mauritius",
  qatar: "Asia/Qatar",
  doha: "Asia/Qatar",
  saudi: "Asia/Riyadh",
  "saudi arabia": "Asia/Riyadh",
  oman: "Asia/Muscat",
  israel: "Asia/Jerusalem",
  "new york": "America/New_York",
  nyc: "America/New_York",
  boston: "America/New_York",
  miami: "America/New_York",
  washington: "America/New_York",
  est: "America/New_York",
  chicago: "America/Chicago",
  texas: "America/Chicago",
  denver: "America/Denver",
  "los angeles": "America/Los_Angeles",
  la: "America/Los_Angeles",
  "san francisco": "America/Los_Angeles",
  sf: "America/Los_Angeles",
  seattle: "America/Los_Angeles",
  "las vegas": "America/Los_Angeles",
  california: "America/Los_Angeles",
  pst: "America/Los_Angeles",
  hawaii: "Pacific/Honolulu",
  toronto: "America/Toronto",
  vancouver: "America/Vancouver",
  mexico: "America/Mexico_City",
  brazil: "America/Sao_Paulo",
  sydney: "Australia/Sydney",
  melbourne: "Australia/Melbourne",
  perth: "Australia/Perth",
  brisbane: "Australia/Brisbane",
  iceland: "Atlantic/Reykjavik",
  georgia: "Asia/Tbilisi",
  azerbaijan: "Asia/Baku",
  cambodia: "Asia/Phnom_Penh",
  bangladesh: "Asia/Dhaka",
  utc: "Etc/GMT",
  gmt: "Etc/GMT",
};

/** Offsets that are not a whole hour: a zone that has each. Minutes east of UTC. */
const HALVES: Record<number, string> = {
  330: "Asia/Kolkata",
  345: "Asia/Kathmandu",
  390: "Asia/Yangon",
  270: "Asia/Kabul",
  210: "Asia/Tehran",
  570: "Australia/Darwin",
  [-210]: "America/St_Johns",
};

/** Is this a zone the clock knows? */
function real(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The zone a currency points to, or null when it is spent across several. */
export const zoneOfCurrency = (currency: string): string | null => ZONE_OF_CURRENCY[currency] ?? null;

/** The day ("2026-11-25"), hour and minute it is in a zone at an instant. Null when the zone isn't one the clock knows. */
export function clock(zone: string, ms: number): { day: string; hour: number; minute: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
    const at = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return { day: `${at("year")}-${at("month")}-${at("day")}`, hour: Number(at("hour")) % 24, minute: Number(at("minute")) };
  } catch {
    return null;
  }
}

/** "9:05pm", "9pm". */
export const sayTime = (hour: number, minute: number) => `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, "0")}` : ""}${hour < 12 ? "am" : "pm"}`;

/** How a zone is said: "Bangkok", "Ho Chi Minh", "GMT+7". */
export function placeOf(zone: string): string {
  const etc = zone.match(/^Etc\/GMT(?:([+-])(\d{1,2}))?$/);
  // In these names the sign is the other way round: Etc/GMT-7 is seven hours ahead.
  if (etc) return etc[1] ? `GMT${etc[1] === "-" ? "+" : "-"}${etc[2]}` : "GMT";
  if (zone === "Asia/Makassar") return "Bali";
  if (zone === "Asia/Kolkata") return "India";
  return (zone.split("/").pop() ?? zone).replace(/_/g, " ");
}

/** The zone that is this many minutes east of UTC. Null for an offset no place has. */
function zoneAt(minutes: number): string | null {
  if (minutes < -12 * 60 || minutes > 14 * 60) return null;
  if (minutes % 60 === 0) return minutes === 0 ? "Etc/GMT" : `Etc/GMT${minutes > 0 ? "-" : "+"}${Math.abs(minutes) / 60}`;
  return HALVES[minutes] ?? null;
}

/**
 * The zone someone named: a place ("tokyo", "sri lanka"), a zone's own name ("asia/tokyo"), or an offset ("+7", "gmt+5:30",
 * "utc-8"). Null when it is none of them.
 */
export function zoneNamed(text: string): string | null {
  const t = text.toLowerCase().replace(/[.!?]+$/, "").replace(/\s+/g, " ").replace(/ time$/, "").trim();
  if (!t) return null;
  if (PLACES[t]) return PLACES[t];
  const off = t.match(/^(?:gmt|utc)?\s?([+-])\s?(\d{1,2})(?:[:.]?(\d{2}))?$/);
  if (off) return zoneAt((off[1] === "-" ? -1 : 1) * (Number(off[2]) * 60 + Number(off[3] ?? 0)));
  if (/^[a-z_]+\/[a-z_/+-]+$/.test(t)) {
    const named = t.split("/").map((p) => p.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("_")).join("/");
    return real(named) ? named : null;
  }
  // The city a zone is named after: "tokyo", "kuala lumpur".
  const city = t.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("_");
  for (const area of ["Asia", "Europe", "America", "Africa", "Australia", "Pacific", "Indian", "Atlantic"]) if (real(`${area}/${city}`)) return `${area}/${city}`;
  return null;
}

/**
 * The zone it must be, from someone saying what time it is where they are ("it's 9pm here", "time is 21:30"): the nearest
 * half hour's difference from the real time. Null when that isn't what the text says, or the time has no am, pm or minutes
 * to tell it from a bare number.
 */
export function zoneFromTime(text: string, now: number, bare = false): string | null {
  // `bare`: the time on its own counts too ("9pm", "21:30"), as an answer to "what time is it there?".
  const lead = String.raw`(?:it'?s|it is|the time is|time is|it'?s now|now it'?s|local time is)`;
  const m = text.toLowerCase().replace(/[.!?]+$/, "").replace(/\s+/g, " ").trim().match(new RegExp(String.raw`^(?:${lead}\s+)${bare ? "?" : ""}(\d{1,2})(?:[:.](\d{2}))?\s?(am|pm)?(?:\s+(?:here|now|local time|local|over here))*$`));
  if (!m || (!m[2] && !m[3])) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] ?? 0);
  if (hour > 23 || minute > 59 || (m[3] && (hour < 1 || hour > 12))) return null;
  if (m[3]) hour = (hour % 12) + (m[3] === "pm" ? 12 : 0);
  const utc = new Date(now);
  let diff = hour * 60 + minute - (utc.getUTCHours() * 60 + utc.getUTCMinutes());
  // The same clock time is reached a day apart both ways: take the difference a real place has.
  if (diff > 14 * 60) diff -= 24 * 60;
  if (diff < -12 * 60) diff += 24 * 60;
  const rounded = Math.round(diff / 15) * 15;
  return zoneAt(rounded % 30 === 0 || HALVES[rounded] ? rounded : Math.round(diff / 30) * 30);
}
