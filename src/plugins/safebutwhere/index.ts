import { definePlugin, type Json, type Kit, type Photo, type Place } from "../../sdk";
import { copy, COUNT, DELETE, RECENT, SAVED, TAGS, UNDO, type Shown } from "./copy";
import { cleanTags, looksKept, MAX_WHAT, metres, rank, read, sayDay, searchWords, shortAsTag } from "./words";

/**
 * SafeButWhere
 *
 * For things kept safe and then forgotten. The person sends a photo of the spot, a line of
 * words, or both; later they ask where it is and get the words and the photo back.
 *
 * Every photo is its own thing. Words sent after photos go on every photo sent just before.
 *
 * Storage
 *   things  key: thing id                 data: Thing                          sort: kept time (ms)
 *   state   key: "intro"                  data: 1 once the first-keep note was sent
 *   state   key: "last" or "last:<group>" data: Last, what was kept just now   (words, tags and a
 *                                               position sent next are for these)
 */

/** The most things one install keeps. */
export const MAX_THINGS = 1500;
/** How many things one answer shows in full. */
export const SHOWN = 3;
/** Words or a position sent this long after a thing still belong to it. */
export const FOLLOW_MS = 10 * 60_000;
/** Photos of one album arrive one after another: a caption on one covers those within this of it. */
export const ALBUM_MS = 2 * 60_000;
/** "Near here" reaches this far. */
export const NEAR_M = 500;

export interface Thing {
  /** Their own words, as written; null for a photo with no words. */
  what: string | null;
  tags: string[];
  /** The id of its photo (kept by Zelfred), or null. */
  photo: string | null;
  place: Place | null;
  /** When it was kept, and when it was last changed. */
  at: number;
  changed?: number;
}

interface Last {
  ids: string[];
  at: number;
  /** True while the things are photos that have no words yet: the next words are theirs. */
  open: boolean;
  /** The caption one photo of an album came with: photos that follow straight after get it too. */
  words?: { what: string | null; tags: string[] };
}

interface ThingRef {
  kind: "thing";
  ids: string[];
}
const isRef = (ref: unknown): ref is ThingRef =>
  !!ref && typeof ref === "object" && (ref as ThingRef).kind === "thing" && Array.isArray((ref as ThingRef).ids) && (ref as ThingRef).ids.every((i) => typeof i === "string");
const refOf = (ids: string[]) => ({ kind: "thing", ids }) as unknown as Json;

const lastKey = (group: string | null) => (group ? `last:${group}` : "last");

async function allThings(kit: Kit): Promise<{ id: string; thing: Thing }[]> {
  return (await kit.store.list<Thing>("things")).map((r) => ({ id: r.key, thing: r.data }));
}

async function lastFor(kit: Kit, group: string | null): Promise<Last | null> {
  const last = await kit.store.get<Last>("state", lastKey(group));
  return last && kit.now - last.at <= FOLLOW_MS ? last : null;
}

const mapUrl = (p: Place) => `https://maps.google.com/?q=${p.lat},${p.lng}`;

function shown(kit: Kit, t: Thing, away?: number): Shown {
  return {
    what: t.what,
    tags: t.tags,
    day: sayDay(kit.time.day(t.at), kit.today),
    placeName: t.place ? (t.place.name ?? t.place.address) : null,
    mapUrl: t.place ? mapUrl(t.place) : null,
    ...(away !== undefined ? { away } : {}),
  };
}

/** The first thing ever kept gets one message that explains; after that a 👍 is the whole answer. */
async function acknowledge(kit: Kit, photo: boolean, worded: boolean) {
  kit.react(SAVED);
  if (await kit.store.get("state", "intro")) return;
  await kit.store.put("state", "intro", 1);
  kit.send(copy.firstKept({ photo, worded }));
}

async function hasRoom(kit: Kit): Promise<boolean> {
  return (await kit.store.list("things")).length < MAX_THINGS;
}

/** Words for things that are already kept: the words replace theirs, the tags are added. */
async function label(kit: Kit, ids: string[], words: { what: string | null; tags: string[] }, opts: { shortIsTag?: boolean } = {}) {
  const extra = opts.shortIsTag ? shortAsTag(words.what) : [];
  for (const id of ids) {
    const t = await kit.store.get<Thing>("things", id);
    if (!t) continue;
    await kit.store.put("things", id, { ...t, what: words.what ?? t.what, tags: cleanTags([...t.tags, ...words.tags, ...extra]), changed: kit.now } as unknown as Json);
  }
}

/** A photo, with or without a caption. */
async function keepPhoto(kit: Kit, photo: Photo, text: string, group: string | null) {
  if (!(await hasRoom(kit))) {
    // Not kept, so the picture must not stay behind either.
    await kit.files.remove(photo.id);
    return kit.send(copy.full({ max: MAX_THINGS }));
  }
  const words = text ? read(text) : null;
  const last = await lastFor(kit, group);
  // A photo that follows a captioned one straight away is part of the same album.
  const album = !words && last?.words && kit.now - last.at <= ALBUM_MS ? last.words : null;
  const mine = words ?? album;
  const id = kit.id();
  const thing: Thing = { what: mine?.what ?? null, tags: cleanTags([...(mine?.tags ?? []), ...(mine ? shortAsTag(mine.what) : [])]), photo: photo.id, place: null, at: kit.now };
  await kit.store.put("things", id, thing as unknown as Json, kit.now);

  let next: Last;
  if (words) {
    // The caption also covers the photos sent just before it that have no words yet.
    if (last?.open) await label(kit, last.ids, words, { shortIsTag: true });
    next = { ids: [...(last?.open ? last.ids : []), id], at: kit.now, open: false, words };
  } else if (album) next = { ...last!, ids: [...last!.ids, id], at: kit.now };
  else if (last?.open) next = { ids: [...last.ids, id], at: kit.now, open: true };
  else next = { ids: [id], at: kit.now, open: true };
  await kit.store.put("state", lastKey(group), next as unknown as Json);

  kit.mark(refOf([id]));
  await acknowledge(kit, true, !!mine);
}

/** A line of words with no photo: a thing of its own. */
async function keepWords(kit: Kit, text: string, group: string | null, place: Place | null = null): Promise<boolean> {
  const words = read(text);
  if (!words.what && !words.tags.length && !place) return false;
  if (!(await hasRoom(kit))) {
    kit.send(copy.full({ max: MAX_THINGS }));
    return true;
  }
  const id = kit.id();
  const thing: Thing = { what: words.what, tags: words.tags, photo: null, place, at: kit.now };
  await kit.store.put("things", id, thing as unknown as Json, kit.now);
  await kit.store.put("state", lastKey(group), { ids: [id], at: kit.now, open: false } as unknown as Json);
  kit.mark(refOf([id]));
  await acknowledge(kit, false, true);
  return true;
}

/** Send things back: each as its own message (so a reply lands on one), with its photo when it has one. */
function answer(kit: Kit, found: { id: string; thing: Thing; away?: number }[]) {
  for (const f of found.slice(0, SHOWN)) {
    const text = copy.thing(shown(kit, f.thing, f.away));
    kit.send(text, { ref: refOf([f.id]), ...(f.thing.photo ? { photo: f.thing.photo } : {}) });
  }
  if (found.length > SHOWN) kit.send(copy.more({ more: found.length - SHOWN }));
}

async function search(kit: Kit, query: string): Promise<{ id: string; thing: Thing }[]> {
  const items = (await allThings(kit)).map((x) => ({ ...x, at: x.thing.at, tags: x.thing.tags, what: x.thing.what, where: x.thing.place ? [x.thing.place.name, x.thing.place.address].filter(Boolean).join(" ") : null }));
  return rank(items, query).map(({ id, thing }) => ({ id, thing }));
}

async function find(kit: Kit, query: string, opts: { orKeep?: boolean } = {}) {
  if (!searchWords(query).length) return kit.send(copy.findWhat());
  const found = await search(kit, query);
  if (found.length) return answer(kit, found);
  if (!(await kit.store.list("things", { limit: 1 })).length) return kit.send(copy.nothingYet());
  kit.send(opts.orKeep ? copy.nothingOrKeep({ query }) : copy.nothing({ query }));
}

async function recent(kit: Kit) {
  const all = await allThings(kit);
  if (!all.length) return kit.send(copy.nothingYet());
  const rows = all.slice(-5).reverse();
  kit.send(copy.recent({ rows: rows.map((r) => shown(kit, r.thing)), total: all.length }));
}

async function tagList(kit: Kit) {
  const counts = new Map<string, number>();
  for (const { thing } of await allThings(kit)) for (const tag of thing.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  if (!counts.size) return kit.send(copy.noTags());
  const tags = [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : 1));
  kit.send(copy.tags({ tags: tags.slice(0, 40) }));
}

async function remove(kit: Kit, id: string): Promise<Thing | null> {
  const t = await kit.store.get<Thing>("things", id);
  if (!t) return null;
  await kit.store.delete("things", id);
  if (t.photo) await kit.files.remove(t.photo);
  return t;
}

async function undo(kit: Kit) {
  const all = await allThings(kit);
  const last = all[all.length - 1];
  if (!last) return kit.send(copy.nothingToUndo());
  await remove(kit, last.id);
  kit.send(copy.undone({ what: last.thing.what }));
}

/** The words after "find", "where is my" and the like; null when the message isn't a search. */
function searchOf(text: string): string | null {
  const asked = /\?\s*$/.test(text);
  const t = text.replace(/[?!.\s]+$/, "");
  const m =
    /^(?:find|search(?:\s+for)?|look\s+for|show(?:\s+me)?|locate)\b\s*(.*)$/i.exec(t) ??
    /^where(?:'s|\s+is|\s+are|\s+was|\s+were)?\b\s*(.*)$/i.exec(t) ??
    /^where\s+(?:did|do|have|had)\s+(?:i|we)\s+(?:keep|kept|put|leave|left|store|stored|place|placed|hide|hid|hidden)\b\s*(.*)$/i.exec(t);
  // "my passport", "the spare key": the thing itself is what gets looked for and quoted back.
  if (m) return m[1].replace(/^(?:(?:is|are|my|our|the|a|an)\s+)+/i, "").trim();
  return asked ? t : null;
}

/** Their position, shared in the group. */
async function onPlace(kit: Kit, place: Place, text: string, group: string | null) {
  // Straight after keeping something: it is where that thing is.
  const last = await lastFor(kit, group);
  if (last) {
    let any = false;
    for (const id of last.ids) {
      const t = await kit.store.get<Thing>("things", id);
      if (!t) continue;
      any = true;
      await kit.store.put("things", id, { ...t, place, changed: kit.now } as unknown as Json);
    }
    if (any) {
      if (text && last.open) {
        await label(kit, last.ids, read(text), { shortIsTag: true });
        await kit.store.put("state", lastKey(group), { ...last, open: false } as unknown as Json);
      }
      return kit.react(SAVED);
    }
  }
  // With words of its own: a thing kept at that position.
  if (text && (await keepWords(kit, text, group, place))) return;
  // On its own: what is kept near there.
  const near = (await allThings(kit))
    .filter((x) => x.thing.place)
    .map((x) => ({ ...x, away: metres(place, x.thing.place!) }))
    .filter((x) => x.away <= NEAR_M)
    .sort((a, b) => a.away - b.away);
  if (!near.length) return kit.send(copy.nothingNear());
  answer(kit, near);
}

/** A reply to a thing: their own photo or line, or one of the plugin's answers. */
async function onReply(kit: Kit, ids: string[], text: string, lower: string) {
  const live: string[] = [];
  for (const id of ids) if (await kit.store.get("things", id)) live.push(id);
  if (!live.length) return kit.send(copy.gone());
  if (new RegExp(`^(?:${DELETE}|remove|forget)(?:\\s+(?:this|it|that))?$`).test(lower)) {
    for (const id of live) await remove(kit, id);
    return kit.react(SAVED);
  }
  const words = read(text);
  if (!words.what && !words.tags.length) return kit.unsure(copy.unsure());
  await label(kit, live, words);
  kit.react(SAVED);
}

async function command(kit: Kit, lower: string): Promise<boolean> {
  if (new RegExp(`^(?:${RECENT}|latest|list|last|show all|all)$`).test(lower)) return (await recent(kit), true);
  if (new RegExp(`^(?:${TAGS}|my tags|labels)$`).test(lower)) return (await tagList(kit), true);
  if (new RegExp(`^(?:${UNDO}|delete last|remove last)$`).test(lower)) return (await undo(kit), true);
  if (new RegExp(`^(?:${COUNT}|how many)$`).test(lower)) {
    const all = await allThings(kit);
    kit.send(all.length ? copy.count({ total: all.length, photos: all.filter((x) => x.thing.photo).length }) : copy.nothingYet());
    return true;
  }
  return false;
}

export default definePlugin({
  id: "safebutwhere",
  version: "1.0.0",
  sdk: "1",
  name: "SafeButWhere",
  icon: "📍",
  tagline: "Remember where you put things. Send a photo of the spot, ask for it later.",
  description:
    "For the things you keep safe and then can't find. Send a photo of where you put something, a few words about it, or both, to its WhatsApp group. Months later, ask where it is and get the words and the photo back. Add tags, and keep the position too.",
  groupName: copy.groupName(),
  price: 0,
  // Tier 2: it stores a photo for most things it keeps.
  tier: 2,
  // "lock-members": the group is about where valuables are kept, so it stays between the person and Zelfred.
  permissions: ["photos", "location", "lock-members"],
  // Being tried out first: only people Zelfred allows can add it.
  unlisted: true,
  listing: {
    title: "Remember Where You Kept Things, on WhatsApp | Zelfred",
    description: "Kept it safe and forgot where? Send a photo of the spot to a WhatsApp chat when you put something away. Ask for it later and get the photo back.",
    h1: "Remember where you kept things",
  },
  welcome: copy.welcome(),
  help: copy.help(),

  async onMessage(event, kit) {
    const text = event.text.trim().replace(/\s+/g, " ");
    const lower = text.toLowerCase().replace(/[!.]+$/, "");
    const here = event.group ?? null;

    if (event.photos?.length) {
      for (const photo of event.photos) await keepPhoto(kit, photo, text, here);
      return;
    }
    if (event.place) return onPlace(kit, event.place, text, here);
    if (!text) return;

    if (isRef(event.quotedRef)) return onReply(kit, event.quotedRef.ids, text, lower);
    if (await command(kit, lower)) return;

    const query = searchOf(text);
    if (query !== null) return find(kit, query);

    // Words straight after photos that have none: they are for those photos, all of them.
    const last = await lastFor(kit, here);
    if (last?.open) {
      await label(kit, last.ids, read(text), { shortIsTag: true });
      await kit.store.put("state", lastKey(here), { ...last, at: kit.now, open: false } as unknown as Json);
      kit.mark(refOf(last.ids));
      return kit.react(SAVED);
    }

    // A thing and a place: keep it. A few plain words: they are looking for something.
    if (looksKept(text)) {
      if (await keepWords(kit, text, here)) return;
      return kit.unsure(copy.unsure());
    }
    const found = await search(kit, text);
    if (found.length) return answer(kit, found);
    kit.unsure(searchWords(text).length ? copy.nothingOrKeep({ query: text.slice(0, 80) }) : copy.unsure());
  },

  understand: {
    intents: {
      find: "Find out where they kept or put something",
      keep: "Tell where they are putting or have put something, so it is remembered",
      recent: "See the last things they kept",
      tags: "See their tags",
      undo: "Remove the last thing they kept",
      help: "Find out how this works or what they can send",
    },
  },

  async onIntent(event, kit) {
    const text = event.text.trim().replace(/\s+/g, " ");
    switch (event.intent) {
      case "find":
        return find(kit, searchOf(text) ?? text);
      case "keep":
        if (await keepWords(kit, text, null)) return;
        return kit.send(copy.unsure());
      case "recent":
        return recent(kit);
      case "tags":
        return tagList(kit);
      case "undo":
        return undo(kit);
      case "help":
        return kit.send(copy.help());
      default:
        return kit.send(copy.unsure());
    }
  },

  web: {
    lockable: true,
    async load(kit, args) {
      const all = (await allThings(kit)).reverse();
      const limit = Math.min(1000, Math.max(1, Number(args.limit) || 600));
      const counts = new Map<string, number>();
      for (const { thing } of all) for (const tag of thing.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
      return {
        total: all.length,
        max: MAX_THINGS,
        things: all.slice(0, limit).map(({ id, thing }) => ({ id, what: thing.what, tags: thing.tags, photo: thing.photo, place: thing.place, at: thing.at, changed: thing.changed ?? null })),
        tags: [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : 1)),
      } as unknown as Json;
    },
    actions: {
      /** Keep a thing from the page. `photo` is the id Zelfred gave the page for a picture it added. */
      async add(kit, args) {
        const what = typeof args.what === "string" ? args.what.replace(/\s+/g, " ").trim().slice(0, MAX_WHAT) || null : null;
        const tags = cleanTags(Array.isArray(args.tags) ? args.tags.filter((t): t is string => typeof t === "string") : []);
        const photo = typeof args.photo === "string" && (await kit.files.get(args.photo)) ? args.photo : null;
        const place = placeOf(args.place);
        if (!what && !tags.length && !photo) throw new Error("Add a photo or a few words first.");
        if (!(await hasRoom(kit))) {
          if (photo) await kit.files.remove(photo);
          throw new Error(copy.full({ max: MAX_THINGS }));
        }
        const id = kit.id();
        await kit.store.put("things", id, { what, tags, photo, place, at: kit.now } as unknown as Json, kit.now);
        return { id };
      },
      /** Change a thing's words, tags or position. Leave a field out to keep it; `place: null` takes the position off. */
      async edit(kit, args) {
        const id = String(args.id ?? "");
        const t = await kit.store.get<Thing>("things", id);
        if (!t) throw new Error("That one isn't kept any more.");
        const next: Thing = { ...t, changed: kit.now };
        if (typeof args.what === "string") next.what = args.what.replace(/\s+/g, " ").trim().slice(0, MAX_WHAT) || null;
        if (Array.isArray(args.tags)) next.tags = cleanTags(args.tags.filter((x): x is string => typeof x === "string"));
        if (args.place === null) next.place = null;
        else if (args.place !== undefined) next.place = placeOf(args.place) ?? t.place;
        if (!next.what && !next.tags.length && !next.photo) throw new Error("A thing needs a photo or a few words.");
        await kit.store.put("things", id, next as unknown as Json);
      },
      async remove(kit, args) {
        await remove(kit, String(args.id ?? ""));
      },
    },
  },
});

/** A position from the page, checked. */
function placeOf(raw: unknown): Place | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.lat !== "number" || typeof p.lng !== "number" || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) return null;
  const str = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim().slice(0, 200) : null);
  return { lat: p.lat, lng: p.lng, name: str(p.name), address: str(p.address) };
}
