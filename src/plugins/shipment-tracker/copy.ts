/**
 * Everything ShipmentTracker puts on WhatsApp: its welcome and help, every status, every answer
 * and every reaction. index.ts decides what to say; this file decides how.
 *
 * A message is a list of wordings (see src/copy.ts) and one is picked each time. A message
 * takes its data and returns the whole text.
 */
import { fixed, msg } from "../../sdk";

// ── Words the parser in index.ts reads back, and the examples shown to people. ──

/** The platform's own word: it sends this plugin's help. */
export const HELP = fixed("help");
export const UPDATES = fixed("updates");
export const REMOVE = fixed("remove");
export const NAME = fixed("name");
export const REMOVE_EXAMPLE = fixed("remove 2");
export const NAME_EXAMPLE = fixed("name 2 new shoes");
export const NAMED_EXAMPLE = fixed("880154928525 new shoes");

// ── Reactions ──

/** On a message that changed something, when nothing is said in words. */
export const SAVED = fixed("👍");
/** On a link or number while the carrier is asked. Taken off when the answer is sent. */
export const LOOKING = fixed("🕐");

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "today", "tomorrow", "yesterday" or "Thursday 26 November", for a "YYYY-MM-DD" seen from `today`. */
export function sayDay(day: string, today: string): string {
  const at = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  const away = Math.round((at(day) - at(today)) / 86_400_000);
  if (away === 0) return "today";
  if (away === 1) return "tomorrow";
  if (away === -1) return "yesterday";
  const when = new Date(at(day));
  return `${WEEKDAYS[when.getUTCDay()]} ${when.getUTCDate()} ${MONTHS[when.getUTCMonth()]}`;
}

/** "just now", "20 minutes ago", "3 hours ago": how long since the carrier was last asked. */
export function sayAgo(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "a day ago" : `${days} days ago`;
}

/** What is known of one parcel, as a message shows it. */
export interface Shown {
  /** The person's own name for it, or null. */
  name: string | null;
  /** "FedEx 880154928525". */
  parcel: string;
  /** The carrier's own latest line, or null when it gave none. */
  status: string | null;
  place: string | null;
  /** "tomorrow", "Thursday 26 November", or null. */
  due: string | null;
  delivered: boolean;
}

/** "New shoes (FedEx 880154928525)", or "FedEx 880154928525" for one with no name. */
const full = (s: Shown) => (s.name ? `${s.name} (${s.parcel})` : s.parcel);
/** What a later message calls it: the name alone once it has one. */
const short = (s: Shown) => s.name ?? s.parcel;
/** "Departed FedEx hub, Memphis, TN" and, when it is known and still to come, "Expected tomorrow." */
const where = (s: Shown) => {
  const line = [s.status ?? "No status yet", s.place].filter(Boolean).join(", ");
  return s.due && !s.delivered ? `${line}\nExpected ${s.due}.` : line;
};

export const copy = {
  // ── What the app says about itself ──
  welcome: msg([
    `📦 You've added *ShipmentTracker*.\n\nSend me a FedEx or UPS tracking link or number. I look every hour and tell you when the status changes.\n\nSend _${UPDATES}_ to hear where everything is. Send _${HELP}_ for more.`,
  ]),
  help: msg([
    [
      "*ShipmentTracker*",
      "",
      "Send me a FedEx or UPS tracking link or number, and I watch it. I look every hour and write only when the status changes.",
      `Put a name after it to tell them apart: _${NAMED_EXAMPLE}_.`,
      "",
      `_${UPDATES}_ says where each one is now`,
      `_${REMOVE_EXAMPLE}_ stops watching the second one`,
      `_${NAME_EXAMPLE}_ gives it a name`,
      "",
      `Or reply to one of my messages about a parcel with _${REMOVE}_, or with a name for it.`,
      "When one is delivered I say so and stop looking.",
    ].join("\n"),
  ]),

  // ── A new parcel ──

  /** The first status of a parcel just sent. `teach`: the first one ever in this group. */
  watching: msg<{ parcel: Shown; teach: boolean }>([
    ({ parcel, teach }) =>
      `Watching *${full(parcel)}*.\n${where(parcel)}${teach ? `\n\nI look every hour and write only when this changes. Send _${UPDATES}_ to hear where things stand.` : ""}`,
  ]),
  /** Sent already delivered: there is nothing to watch. */
  alreadyDelivered: msg<{ parcel: Shown }>([({ parcel }) => `*${full(parcel)}* is already delivered.\n${where(parcel)}\n\nNothing left to watch, so I haven't kept it.`]),
  /** Zelfred has no way to track it. `carrier`: its name when one could be told. */
  cantTrack: msg<{ carrier: string | null }>([
    ({ carrier }) => (carrier ? `I can't track ${carrier} parcels. FedEx and UPS are the ones I can.` : "I can't track that. I can track FedEx and UPS: send me the tracking link or the number."),
  ]),
  /** The carrier doesn't know the number. */
  unknownNumber: msg<{ parcel: string }>([({ parcel }) => `${parcel}: the carrier doesn't know that number. Check it and send it again. A label made minutes ago can take a while to show.`]),
  /** The carrier couldn't be asked. The parcel is kept and asked about again. */
  notNow: msg<{ carrier: string | null }>([({ carrier }) => `I couldn't reach ${carrier ?? "the carrier"} just now. I've kept it and will look again within the hour.`]),
  /** A day of trying and never an answer: given up. */
  gaveUp: msg<{ parcel: string }>([({ parcel }) => `I can't track ${parcel}. I tried for a day and never got an answer, so I've stopped.`]),
  already: msg<{ parcel: Shown }>([({ parcel }) => `I'm already watching *${full(parcel)}*.\n${where(parcel)}`]),
  full: msg<{ max: number }>([({ max }) => `I'm watching ${max} already, which is as many as I take. Send _${REMOVE_EXAMPLE}_ to drop one first.`]),
  oneAtATime: msg(["One at a time. I took the first one."]),

  // ── What changed ──

  changed: msg<{ parcel: Shown }>([({ parcel }) => `*${short(parcel)}*\n${where(parcel)}`]),
  delivered: msg<{ parcel: Shown }>([({ parcel }) => `*${short(parcel)}* is delivered.\n${where(parcel)}\n\nI've stopped looking.`]),
  /** Nothing new for a long time. */
  stale: msg<{ parcel: Shown; days: number }>([({ parcel, days }) => `*${short(parcel)}* hasn't moved in ${days} days, so I've stopped looking. Send it again to start over.`]),
  /** A day without an answer about a parcel that was being watched. Said once. */
  silent: msg<{ parcel: Shown; carrier: string | null }>([
    ({ parcel, carrier }) => `I haven't been able to reach ${carrier ?? "the carrier"} about *${short(parcel)}* for a day. I'm still trying.\nLast I knew: ${where(parcel)}`,
  ]),

  // ── Asked for ──

  /** Everything watched, numbered. `looked`: how long since each was last checked, by the oldest. */
  updates: msg<{ parcels: Shown[]; looked: string | null }>([
    ({ parcels, looked }) =>
      [...parcels.map((p, i) => `${i + 1}. *${full(p)}*\n${p.delivered ? `Delivered. ${where(p)}` : where(p)}`), ...(looked ? [`Last looked ${looked}.`] : [])].join("\n\n"),
  ]),
  nothing: msg(["I'm not watching anything. Send me a FedEx or UPS tracking link or number."]),
  whichOne: msg([`Which one? Send _${UPDATES}_ to see them numbered, then _${REMOVE_EXAMPLE}_.`]),
  noSuch: msg<{ what: string }>([({ what }) => `I'm not watching anything called "${what}". Send _${UPDATES}_ to see what I have.`]),
  nameHow: msg([`Say which one and the name: _${NAME_EXAMPLE}_. Or reply to my message about it with the name.`]),
  unsure: msg([`I didn't get that. Send me a tracking link or number, or _${UPDATES}_. _${HELP}_ has the rest.`]),
};
