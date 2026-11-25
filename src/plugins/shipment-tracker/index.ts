import { definePlugin, type Json, type Kit, type Parcel } from "../../sdk";
import { copy, LOOKING, SAVED, sayAgo, sayDay, type Shown } from "./copy";

/**
 * ShipmentTracker: where your parcels are.
 *
 * The person sends a tracking link or number. Zelfred asks the carrier (the "parcels"
 * permission: this plugin never reaches a carrier itself, and never works out whose parcel a
 * number is). The first answer is said in words; after that the app asks again every hour and
 * writes only when the status is different from the last one it knew. "updates" says where
 * everything stands. A parcel Zelfred can't track is said to be so, and not kept.
 *
 * Storage
 *   parcels  key: id        data: Pack   sort: when it was added (ms)
 *   state    key: "taught"  data: 1 once the first status in this group was sent
 */

/** The most parcels watched at once. Each is one question to a carrier every hour. */
export const MAX_WATCHED = 20;
/** Nothing new for this many days: stop looking and say so. */
export const STALE_DAYS = 30;
/** This many answers in a row with no status (a day of hourly looks): say so, or give up on one never seen. */
export const SILENT_AFTER = 24;
/** A delivered or dropped parcel stays in "updates" this long, and in storage ten times as long. */
export const SHOWN_DAYS = 3;
export const KEPT_DAYS = 30;
/** "updates" asks the carrier again only when the last answer is older than this. */
export const FRESH_MS = 10 * 60_000;
export const MAX_NAME = 40;

const DAY = 86_400_000;

export interface Pack {
  /** The link or number as it was sent: what Zelfred is asked about each time. */
  what: string;
  carrier: string | null;
  carrierName: string | null;
  number: string | null;
  /** The person's own name for it. */
  name: string | null;
  /** The last known status, as the carrier gave it. */
  stage: Parcel["stage"];
  status: string | null;
  place: string | null;
  at: number | null;
  due: string | null;
  added: number;
  /** When a carrier last answered with a status, and when that status last differed. */
  checked: number | null;
  changed: number | null;
  /** Answers in a row that brought no status. */
  fails: number;
  /** The first status was said. Until then the person is waiting for an answer. */
  told: boolean;
  /** Said once that the carrier has been silent for a day. */
  silent?: boolean;
  /** No longer watched: it arrived, or nothing moved for too long. */
  over?: "delivered" | "stale";
  overAt?: number;
}

type Row = { key: string; data: Pack };
type Ref = { p: string };

function asRef(ref: unknown): Ref | null {
  return ref && typeof ref === "object" && typeof (ref as Record<string, unknown>).p === "string" ? (ref as Ref) : null;
}
const j = (ref: Ref) => ref as unknown as Json;

const all = async (kit: Kit): Promise<Row[]> => (await kit.store.list<Pack>("parcels")).map((r) => ({ key: r.key, data: r.data }));
const save = (kit: Kit, row: Row) => kit.store.put("parcels", row.key, row.data as unknown as Json, row.data.added);
const watched = (rows: Row[]) => rows.filter((r) => !r.data.over);
/** What "updates" lists and numbers: everything watched, and what ended in the last few days. */
const listed = (rows: Row[], now: number) => rows.filter((r) => !r.data.over || now - (r.data.overAt ?? 0) < SHOWN_DAYS * DAY);

/** "FedEx 880154928525", or what was sent while the carrier is not known yet. */
const parcelName = (p: Pack) => (p.number ? [p.carrierName, p.number].filter(Boolean).join(" ") : p.what.length > 60 ? `${p.what.slice(0, 57)}...` : p.what);
const shown = (kit: Kit, p: Pack): Shown => ({
  name: p.name,
  parcel: parcelName(p),
  status: p.status,
  place: p.place,
  due: p.due && /^\d{4}-\d{2}-\d{2}$/.test(p.due) ? sayDay(p.due, kit.today) : null,
  delivered: p.stage === "delivered",
});
/** Two answers with the same signature are the same status: nothing to say. */
const signature = (p: Pick<Pack, "stage" | "status" | "place" | "due">) => [p.stage, p.status, p.place, p.due].map((x) => x ?? "").join("|");

const LINK = /https?:\/\/\S+/i;
/** A tracking number on its own: 8 to 35 letters and digits, at least 6 of them digits. */
const isNumber = (word: string) => /^[a-z0-9]{8,35}$/i.test(word) && (word.match(/\d/g)?.length ?? 0) >= 6;
const tidyName = (s: string) => s.replace(/\s+/g, " ").replace(/^[\s,:;-]+|[\s,:;-]+$/g, "").slice(0, MAX_NAME).trim();

/**
 * What in a message is to be tracked: the first link, else the first word that reads as a
 * tracking number. The words around it are the person's name for it. `more`: there was a
 * second one, which is not taken.
 */
export function readParcel(text: string): { what: string; name: string | null; more: boolean } | null {
  const lead = /^\s*(?:please\s+)?(?:track|watch|follow|add)\s+(?:this\s*:?\s*)?/i;
  const link = text.match(LINK);
  if (link) {
    const rest = text.replace(link[0], " ");
    const more = LINK.test(rest);
    const name = tidyName(rest.replace(/https?:\/\/\S+/gi, " ").replace(lead, ""));
    return { what: link[0].slice(0, 500), name: name || null, more };
  }
  // A number written in groups ("8801 5492 8525") is one number.
  const joined = text.replace(/\b(\d{3,6})[ -](?=\d{3,6}\b)/g, "$1");
  const words = joined.split(/\s+/).filter(Boolean);
  const at = words.findIndex((w) => isNumber(w.replace(/^[#(]+|[).,;:]+$/g, "")));
  if (at < 0) return null;
  const what = words[at].replace(/^[#(]+|[).,;:]+$/g, "");
  const others = words.filter((_, i) => i !== at);
  const more = others.some((w) => isNumber(w.replace(/^[#(]+|[).,;:]+$/g, "")));
  const name = tidyName(others.join(" ").replace(lead, ""));
  return { what, name: name || null, more };
}

/** The parcel a word is about: its number in "updates", else every one whose name or tracking number has it. */
function pick(rows: Row[], now: number, word: string): Row[] {
  const list = listed(rows, now);
  const w = word.toLowerCase().replace(/\s+/g, " ").trim();
  if (!w) return [];
  if (/^\d{1,2}$/.test(w)) return list[Number(w) - 1] ? [list[Number(w) - 1]] : [];
  const exact = list.filter((r) => r.data.name?.toLowerCase() === w || r.data.number?.toLowerCase() === w.replace(/\s/g, ""));
  if (exact.length) return exact;
  return list.filter((r) => r.data.name?.toLowerCase().includes(w) || r.data.number?.toLowerCase().includes(w.replace(/\s/g, "")));
}

async function remove(kit: Kit, row: Row) {
  await kit.store.delete("parcels", row.key);
}

/** Ask the carrier about everything watched whose last answer is older than `olderThan`. */
async function look(kit: Kit, rows: Row[], olderThan: number) {
  for (const r of watched(rows).slice(0, MAX_WATCHED)) {
    if (r.data.checked !== null && kit.now - r.data.checked < olderThan) continue;
    await kit.parcels.read(r.data.what, j({ p: r.key }));
  }
}

async function showUpdates(kit: Kit) {
  const rows = await all(kit);
  const list = listed(rows, kit.now);
  if (!list.length) return void kit.send(copy.nothing());
  const checks = watched(list).map((r) => r.data.checked).filter((c): c is number => c !== null);
  kit.send(copy.updates({ parcels: list.map((r) => shown(kit, r.data)), looked: checks.length ? sayAgo(kit.now - Math.min(...checks)) : null }));
  // Ask again too: if something moved since the last look, it is said as a change.
  await look(kit, rows, FRESH_MS);
}

async function track(kit: Kit, found: { what: string; name: string | null; more: boolean }) {
  const rows = await all(kit);
  const same = watched(rows).find((r) => r.data.what === found.what || (r.data.number && r.data.number.toLowerCase() === found.what.toLowerCase()));
  if (same) return void kit.send(copy.already({ parcel: shown(kit, same.data) }), { ref: j({ p: same.key }) });
  if (watched(rows).length >= MAX_WATCHED) return void kit.send(copy.full({ max: MAX_WATCHED }));
  const id = kit.id();
  const pack: Pack = { what: found.what, carrier: null, carrierName: null, number: null, name: found.name, stage: null, status: null, place: null, at: null, due: null, added: kit.now, checked: null, changed: null, fails: 0, told: false };
  await save(kit, { key: id, data: pack });
  // Their message is the record: the clock sits on it until the carrier has answered.
  kit.mark(j({ p: id }));
  kit.react(LOOKING);
  await kit.parcels.read(found.what, j({ p: id }));
  if (found.more) kit.send(copy.oneAtATime());
}

/** The words that ask where things stand. */
const UPDATES = /^(?:any\s+)?(?:updates?|status|list|packages?|parcels?|where(?:\s+(?:is|are)\s+(?:it|they|everything|my\s+(?:stuff|packages?|parcels?|orders?)))?)[?.!]*$/;

export default definePlugin({
  id: "shipment-tracker",
  version: "1.0.0",
  sdk: "1",
  name: "ShipmentTracker",
  icon: "📦",
  tagline: "FedEx and UPS parcels, checked every hour. A message when the status changes.",
  description:
    "Send a FedEx or UPS tracking link or number to a WhatsApp chat. The carrier is asked every hour and a message comes only when the status changes: picked up, on the way, out for delivery, delivered. Send updates to hear where every parcel is now. A parcel that can't be tracked is said to be so.",
  groupName: "📦 Shipments",
  price: 0,
  // Asks a carrier about every watched parcel every hour, for every install.
  tier: 2,
  // Not in the store until the owner has tried it with real parcels.
  unlisted: true,
  permissions: ["parcels"],
  listing: {
    title: "Package tracker for FedEx and UPS, with updates | Zelfred",
    description: "Send me a FedEx or UPS tracking link. I check every hour and message you on WhatsApp when the status changes. Nothing to install.",
    h1: "Send me the tracking link. I'll say when the parcel moves.",
  },
  welcome: copy.welcome(),
  help: copy.help(),
  schedules: [{ id: "look", hour: "hourly" }],

  async onMessage(event, kit) {
    const text = event.text.trim();
    const lower = text.toLowerCase().replace(/\s+/g, " ");
    const quoted = asRef(event.quotedRef);

    if (UPDATES.test(lower)) return showUpdates(kit);

    const removing = lower.match(/^(?:remove|stop|delete|drop|forget)(?:\s+(?:watching|tracking))?(?:\s+(.+))?$/);
    if (removing) {
      const rows = await all(kit);
      let targets: Row[] = [];
      if (removing[1]) targets = pick(rows, kit.now, removing[1]);
      else if (quoted) targets = rows.filter((r) => r.key === quoted.p);
      else return void kit.send(copy.whichOne());
      if (!targets.length) return void kit.send(removing[1] ? copy.noSuch({ what: removing[1] }) : copy.whichOne());
      if (targets.length > 1) return void kit.send(copy.whichOne());
      await remove(kit, targets[0]);
      return kit.react(SAVED);
    }

    const naming = text.match(/^(?:name|rename|call)\s+(\S+)\s+(?:(?:as|to)\s+)?(.+)$/i);
    if (naming && !quoted) {
      const rows = await all(kit);
      const targets = pick(rows, kit.now, naming[1]);
      const name = tidyName(naming[2]);
      if (targets.length !== 1 || !name) return void kit.send(targets.length ? copy.nameHow() : copy.noSuch({ what: naming[1] }));
      await save(kit, { key: targets[0].key, data: { ...targets[0].data, name } });
      return kit.react(SAVED);
    }
    if (/^(?:name|rename|call)\b/i.test(text) && !quoted) return void kit.send(copy.nameHow());

    const found = readParcel(text);
    if (found) return track(kit, found);

    // A reply to a message about one parcel, with words that are nothing else: its name.
    if (quoted) {
      const data = await kit.store.get<Pack>("parcels", quoted.p);
      const name = tidyName(text.replace(/^(?:name|rename|call)\s+(?:(?:it|this)\s+)?/i, ""));
      if (data && name && text.length <= 60) {
        await save(kit, { key: quoted.p, data: { ...data, name } });
        return kit.react(SAVED);
      }
    }
    kit.unsure(copy.unsure());
  },

  understand: {
    intents: {
      updates: "Hear where their parcels are right now, or whether anything has moved",
      remove: "Stop watching one parcel",
      rename: "Give one parcel a name of their own",
    },
    async targets(kit) {
      return Object.fromEntries(listed(await all(kit), kit.now).slice(0, 50).map((r) => [r.key, r.data.name ?? parcelName(r.data)]));
    },
  },

  async onIntent(event, kit) {
    if (event.intent === "updates") return showUpdates(kit);
    if (event.intent === "rename") return void kit.send(copy.nameHow());
    const data = event.target ? await kit.store.get<Pack>("parcels", event.target) : null;
    if (!data || !event.target) return void kit.send(copy.whichOne());
    await remove(kit, { key: event.target, data });
    kit.react(SAVED);
  },

  async onParcel(event, kit) {
    const ref = asRef(event.ref);
    if (!ref) return;
    const data = await kit.store.get<Pack>("parcels", ref.p);
    // Removed, or already over, while the carrier was being asked.
    if (!data || data.over) return;
    const row: Row = { key: ref.p, data };
    const p = event.parcel;
    const known: Pack = { ...data, carrier: p.carrier ?? data.carrier, carrierName: p.carrierName ?? data.carrierName, number: p.number ?? data.number };

    if (!p.found) {
      const fails = data.fails + 1;
      if (!data.told) {
        // The person is waiting for a first answer: every ending is said in words.
        if (p.reason !== "unavailable") {
          await remove(kit, row);
          kit.reactTo(j(ref), "");
          return void kit.send(p.reason === "unknown" ? copy.unknownNumber({ parcel: parcelName(known) }) : copy.cantTrack({ carrier: p.carrierName }));
        }
        if (fails >= SILENT_AFTER) {
          await remove(kit, row);
          return void kit.send(copy.gaveUp({ parcel: parcelName(known) }));
        }
        await save(kit, { key: row.key, data: { ...known, fails } });
        if (fails === 1) {
          kit.reactTo(j(ref), "");
          kit.send(copy.notNow({ carrier: p.carrierName }), { ref: j(ref) });
        }
        return;
      }
      // A parcel already being watched: one bad answer means nothing. A day of them is said once.
      const silent = fails >= SILENT_AFTER && !data.silent;
      await save(kit, { key: row.key, data: { ...known, fails, ...(silent ? { silent: true } : {}) } });
      if (silent) kit.send(copy.silent({ parcel: shown(kit, known), carrier: known.carrierName }), { ref: j(ref) });
      return;
    }

    const next: Pack = { ...known, stage: p.stage, status: p.status, place: p.place, at: p.at, due: p.due, checked: kit.now, fails: 0, silent: false };
    const delivered = p.stage === "delivered";

    if (!data.told) {
      kit.reactTo(j(ref), "");
      // The same parcel sent a second time, as a link once and a number once.
      const twin = watched(await all(kit)).find((r) => r.key !== row.key && r.data.told && r.data.carrier === next.carrier && r.data.number && r.data.number === next.number);
      if (twin) {
        await remove(kit, row);
        return void kit.send(copy.already({ parcel: shown(kit, twin.data) }), { ref: j({ p: twin.key }) });
      }
      if (delivered) {
        await remove(kit, row);
        return void kit.send(copy.alreadyDelivered({ parcel: shown(kit, next) }));
      }
      const teach = !(await kit.store.get("state", "taught"));
      if (teach) await kit.store.put("state", "taught", 1);
      await save(kit, { key: row.key, data: { ...next, told: true, changed: kit.now } });
      return void kit.send(copy.watching({ parcel: shown(kit, next), teach }), { ref: j(ref) });
    }

    if (signature(next) === signature(data)) return void (await save(kit, { key: row.key, data: next }));
    if (delivered) {
      await save(kit, { key: row.key, data: { ...next, changed: kit.now, over: "delivered", overAt: kit.now } });
      return void kit.send(copy.delivered({ parcel: shown(kit, next) }), { ref: j(ref) });
    }
    await save(kit, { key: row.key, data: { ...next, changed: kit.now } });
    kit.send(copy.changed({ parcel: shown(kit, next) }), { ref: j(ref) });
  },

  async onSchedule(event, kit) {
    if (event.id !== "look") return;
    const rows = await all(kit);
    for (const r of rows) {
      const p = r.data;
      // What ended long ago is forgotten.
      if (p.over && kit.now - (p.overAt ?? 0) > KEPT_DAYS * DAY) await remove(kit, r);
      else if (!p.over && p.told && kit.now - (p.changed ?? p.added) > STALE_DAYS * DAY) {
        p.over = "stale";
        p.overAt = kit.now;
        await save(kit, r);
        kit.send(copy.stale({ parcel: shown(kit, p), days: STALE_DAYS }));
      }
    }
    await look(kit, rows.filter((r) => !r.data.over), 0);
  },
});
