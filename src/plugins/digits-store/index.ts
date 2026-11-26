import { definePlugin, type Json, type Kit } from "../../sdk";
import { copy, HIDDEN, HISTORY_WORDS, LIST_WORDS, REMOVE_OPTIONS, SAME_OPTIONS, REMOVE_REACTIONS, REMOVE_WORDS, SAVED, UNDO_WORDS, type Line } from "./copy";
import { dateOf, saysDate, directMatch, LOCKED, masked, overlap, readNumbers, readValue, remindOf, sameLabel, sameWord, sayDate, secretOf, shapeWords, tidyLabel, wordsOf, type DateParts, type Secret, type Shape, type Value } from "./read";

/**
 * NumberKeeper (named Digits until 2026-11-27; the owner: "Lets make it NumberKeeper", of the Keeper
 * family in docs/voice.md): any number with a label, kept and given back. docs/measurements-brief.md in the Zelfred
 * repo, section "2026-11-26: becoming any number, named Digits", holds the owner's rulings.
 *
 * To NumberKeeper a value is a string attached to a label, and maybe a photo. It never asks for a number
 * and never reads meaning into a label: "bp", "sugar", "Amma ring size" and "car number" are all
 * the same to it. A new value for a label is its current one, and every earlier one is kept with
 * its day, so a graph can always be drawn and any entry corrected or taken out.
 *
 * Recall is our own matching first (read.ts, directMatch). Only when that finds nothing is the
 * sorting model asked (kit.sort, the "sort" permission), and it gets the labels and each value's
 * shape in words ("a twelve digit number"), never a value. Zelfred takes every digit out of what
 * goes to it as well.
 *
 * Storage
 *   labels   key: id                 data: Label     sort: the label's words, for the list's order
 *   entries  key: <label>:<entry>    data: Entry     sort: "<day>|<at>", so a label's entries come oldest first
 *   state    key: "taught"           data: 1 once the first keep was said in words
 *   state    key: "firstDay"         data: the day the first number was kept
 *   state    key: "page"             data: 1 once the page was named
 *   state    key: "recalled"         data: 1 once the first answer was given
 *   state    key: "hiddenTaught"     data: 1 once a hidden value was explained in words
 *   state    key: "pending"          data: Pending: a number sent with no word, waiting for one
 *   state    key: "photos"           data: Waiting: photos sent with no number, waiting for one
 *   state    key: "last"             data: Last: what the last message kept, for undo and a photo after it
 *   state    key: "aliases"          data: { word: [words] }: names the person said are one ("amma" and "mom")
 *   state    key: "asked:<a>|<b>"    data: 1 once whether two names are one was asked
 *   state    key: "told:<label>:<day>:<when>"  data: 1 once a date's reminder went
 *
 * Locked values (a card number, a PIN, a CVV, an OTP; the owner, 2026-11-26: "certain messages lock
 * it") are kept whole, not encrypted, but shown in WhatsApp and on the page only as "•••• 1111", or "••••" for a PIN.
 * The page shows one whole only through the "reveal" action, behind the same unlock as a vault: the
 * person's passkey or passphrase (the owner, 2026-11-26: "unlocks are same as vault. i'd love it if we
 * can use one lock/passkey through out zelfred app unless they want to change it on settings"). That
 * one lock is platform work; until it exists the page offers no reveal.
 *
 * Dates are said back in words ("12 March"), so a day written 12/03 is never read the wrong way
 * round, and reminded (the owner, 2026-11-26: "only nudges are birthdays and future dates"): a
 * birthday or an anniversary on the day every year; any other date still to come a week before and
 * on the day. The owner kept these as the default on 2026-11-26.
 */

/** The most labels one install keeps. */
export const MAX_LABELS = 300;
/** The most values one message keeps. */
export const MAX_PIECES = 10;
/** The most entries under one label. */
export const MAX_ENTRIES = 2000;
/** The most photos with one entry. */
export const MAX_PHOTOS = 4;
/** How many lines a list and a history show in WhatsApp; the rest is on the page. */
export const LISTED = 30;
/** A number sent alone waits this long for its word. */
export const PENDING_MS = 60 * 60 * 1000;
/** A photo sent this soon after a number goes with it. */
export const PHOTO_AFTER_MS = 15 * 60 * 1000;
/** How many points of each label the page's home gets for its small graph. */
export const SERIES = 60;
/** A date still to come is told this many days before, and on the day. */
export const BEFORE_DAYS = 7;

export interface Label {
  /** As first written, cleaned: "Amma ring size". */
  name: string;
  /** Its words for matching: ["amma", "ring", "size"]. */
  words: string[];
  count: number;
  /** The latest entry: the one with the latest day, then the latest kept. */
  current: Brief | null;
  /** The first entry, when there is more than one. */
  first: Brief | null;
  /** When it was last added to (ms), for putting the likeliest first. */
  touched: number;
  /**
   * It counts up: its name alone ("gym", "gym today") adds one. Set when the person was seen adding
   * to it one at a time (the owner, 2026-11-26: "it'll mostly be a get. unless you see the user
   * updating it incrementally"). False: the person turned it off on the page, so it is never set again.
   */
  counter?: boolean;
}

export interface Brief {
  id: string;
  /** As it may be shown: a locked value masked, a date in words. */
  text: string;
  day: string;
  photo: string | null;
}

export interface Entry {
  text: string;
  num: number | null;
  num2: number | null;
  unit: string | null;
  shape: Shape;
  /** The day it belongs to, in the person's zone. */
  day: string;
  /** When it was kept (ms). */
  at: number;
  photos: string[];
  from: "whatsapp" | "page";
  /** Set when the value is a card number or a PIN: shown masked everywhere. */
  locked?: Secret;
  /** Set when the value is a date that could be read. */
  date?: DateParts;
}

interface Pending {
  value: Value;
  at: number;
  day: string;
  photos: string[];
  ref: Json;
}

interface Waiting {
  photos: string[];
  at: number;
}

interface Last {
  /** "<label>:<entry>" of everything the message kept. */
  ids: string[];
  at: number;
  ref: Json;
}

type Row<T> = { key: string; data: T };

/** What the person's message was marked with, so a reply, a ❌ or deleting it finds its numbers. */
type MessageRef = { k: "m"; ids: string[] };
/** What an answer about a label was sent with, so a reply to it adds to that label. */
type LabelRef = { k: "l"; id: string };
type RemoveRef = { k: "rm"; id: string };
type SortRef = { k: "q"; words: string };
type SameRef = { k: "al"; a: string; b: string; asked?: string; kept?: string };

const j = (x: unknown) => x as Json;
const isMessageRef = (r: unknown): r is MessageRef => !!r && typeof r === "object" && (r as MessageRef).k === "m" && Array.isArray((r as MessageRef).ids) && (r as MessageRef).ids.every((i) => typeof i === "string");
const isLabelRef = (r: unknown): r is LabelRef => !!r && typeof r === "object" && (r as LabelRef).k === "l" && typeof (r as LabelRef).id === "string";
const isRemoveRef = (r: unknown): r is RemoveRef => !!r && typeof r === "object" && (r as RemoveRef).k === "rm" && typeof (r as RemoveRef).id === "string";
const isSortRef = (r: unknown): r is SortRef => !!r && typeof r === "object" && (r as SortRef).k === "q" && typeof (r as SortRef).words === "string";
const isSameRef = (r: unknown): r is SameRef => !!r && typeof r === "object" && (r as SameRef).k === "al" && typeof (r as SameRef).a === "string" && typeof (r as SameRef).b === "string";

/** How a value may be shown: a locked one masked, a date in words, the rest as typed. */
export function faceOf(e: Pick<Entry, "text" | "locked" | "date">): string {
  if (e.locked) return masked(e.text, e.locked);
  if (e.date) return sayDate(e.date);
  return e.text;
}

const sortOf = (e: Entry) => `${e.day}|${String(e.at).padStart(15, "0")}`;
const labels = (kit: Kit) => kit.store.list<Label>("labels");
const entriesOf = (kit: Kit, id: string) => kit.store.list<Entry>("entries", { prefix: `${id}:` });
const brief = (key: string, e: Entry): Brief => ({ id: key.split(":")[1], text: faceOf(e), day: e.day, photo: e.photos[0] ?? null });

/** Work out a label's count, current and first again from its entries. A label with none left is removed. */
async function refresh(kit: Kit, id: string): Promise<Label | null> {
  const label = await kit.store.get<Label>("labels", id);
  if (!label) return null;
  const rows = await entriesOf(kit, id);
  if (!rows.length) {
    await kit.store.delete("labels", id);
    return null;
  }
  const last = rows.at(-1)!;
  const next: Label = { ...label, count: rows.length, current: brief(last.key, last.data), first: rows.length > 1 ? brief(rows[0].key, rows[0].data) : null };
  await kit.store.put("labels", id, j(next));
  return next;
}

/** The label these words name, made when it is new. Null when the install already keeps as many as it may. */
async function labelFor(kit: Kit, all: Row<Label>[], name: string): Promise<Row<Label> | null> {
  const words = wordsOf(name);
  const found = all.find((l) => sameLabel(words.length ? words : [name.toLowerCase()], l.data.words.length ? l.data.words : [l.data.name.toLowerCase()]));
  if (found) return found;
  if (all.length >= MAX_LABELS) return null;
  const row = { key: kit.id(), data: { name, words, count: 0, current: null, first: null, touched: kit.now } satisfies Label };
  await kit.store.put("labels", row.key, j(row.data), words.join(" ") || name.toLowerCase());
  all.push(row);
  return row;
}

/** Keep one value under a label. Returns the entry's full key, or null when the label is full. */
async function keep(kit: Kit, label: Row<Label>, value: Value, day: string, photos: string[], from: Entry["from"]): Promise<string | null> {
  if (label.data.count >= MAX_ENTRIES) return null;
  const id = kit.id();
  const e: Entry = { text: value.text, num: value.num, num2: value.num2, unit: value.unit, shape: value.shape, day, at: kit.now, photos, from, ...extras(label.data.words, value) };
  const key = `${label.key}:${id}`;
  await kit.store.put("entries", key, j(e), sortOf(e));
  label.data = { ...label.data, touched: kit.now };
  await kit.store.put("labels", label.key, j(label.data));
  const fresh = await refresh(kit, label.key);
  if (fresh) label.data = fresh;
  return key;
}

/** What a value carries besides itself: a lock, or the date it names. */
function extras(words: string[], v: Value): Pick<Entry, "locked" | "date"> {
  const secret = secretOf(words, v);
  const date = v.shape === "date" || (v.shape === "reading" && saysDate(words)) ? dateOf(v.text) : null;
  return { ...(secret && LOCKED.includes(secret) ? { locked: secret } : {}), ...(date ? { date } : {}) };
}

/** Take entries out, with their photos. Returns what they were, as "weight, 72.4". */
async function takeOut(kit: Kit, ids: string[]): Promise<string[]> {
  const gone: string[] = [];
  const touched = new Set<string>();
  for (const key of ids) {
    const e = await kit.store.get<Entry>("entries", key);
    if (!e) continue;
    const labelId = key.split(":")[0];
    const label = await kit.store.get<Label>("labels", labelId);
    for (const p of e.photos) await kit.files.remove(p);
    await kit.store.delete("entries", key);
    touched.add(labelId);
    gone.push(label ? `${label.name}, ${faceOf(e)}` : faceOf(e));
  }
  for (const id of touched) await refresh(kit, id);
  return gone;
}

async function removeLabel(kit: Kit, id: string): Promise<Label | null> {
  const label = await kit.store.get<Label>("labels", id);
  if (!label) return null;
  for (const row of await entriesOf(kit, id)) {
    for (const p of row.data.photos) await kit.files.remove(p);
    await kit.store.delete("entries", row.key);
  }
  await kit.store.delete("labels", id);
  return label;
}

// ── Saying days ──

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "today", "yesterday", "on 3 November", "on 3 November 2025". */
export function sayDay(day: string, today: string, shift: (d: string, n: number) => string): string {
  if (day === today) return "today";
  if (day === shift(today, -1)) return "yesterday";
  const [y, m, d] = day.split("-").map(Number);
  return `on ${d} ${MONTH_NAMES[m - 1]}${y === Number(today.slice(0, 4)) ? "" : ` ${y}`}`;
}
const when = (kit: Kit, day: string) => sayDay(day, kit.today, kit.time.shiftDay);

function lineOf(kit: Kit, l: Label): Line {
  return {
    name: l.name,
    value: l.current?.text ?? "",
    when: l.current ? when(kit, l.current.day) : "",
    count: l.count,
    first: l.first ? { value: l.first.text, when: when(kit, l.first.day) } : null,
  };
}

/** The page, named once, the first time the person comes back on a day after their first. */
async function pageLine(kit: Kit): Promise<string> {
  if (await kit.store.get("state", "page")) return "";
  const first = await kit.store.get<string>("state", "firstDay");
  if (!first || first >= kit.today) return "";
  await kit.store.put("state", "page", 1);
  return `\n\n${copy.page()}`;
}

// ── Answers ──

async function answer(kit: Kit, found: Row<Label>[]): Promise<void> {
  const live = found.filter((l) => l.data.current);
  if (!live.length) return;
  let extra = await pageLine(kit);
  // The first answer ever gets one more line, once.
  if (!(await kit.store.get("state", "recalled"))) {
    await kit.store.put("state", "recalled", 1);
    extra = `\n\n${copy.stillHere()}${extra}`;
  }
  if (live.length === 1) {
    const l = live[0];
    const text = copy.recall({ line: lineOf(kit, l.data) }) + extra;
    const photo = l.data.current?.photo;
    kit.send(text, { ref: j({ k: "l", id: l.key } satisfies LabelRef), ...(photo ? { photo } : {}) });
    return;
  }
  kit.send(copy.recallMany({ lines: live.slice(0, LISTED).map((l) => lineOf(kit, l.data)) }) + extra);
}

async function list(kit: Kit): Promise<void> {
  const all = (await labels(kit)).filter((l) => l.data.current);
  if (!all.length) return kit.send(copy.nothingYet());
  all.sort((a, b) => b.data.touched - a.data.touched);
  const lines = all.slice(0, LISTED).map((l) => lineOf(kit, l.data));
  kit.send(copy.list({ lines, more: Math.max(0, all.length - LISTED) }) + (await pageLine(kit)));
}

async function history(kit: Kit, label: Row<Label>): Promise<void> {
  const rows = (await entriesOf(kit, label.key)).reverse();
  const shown = rows.slice(0, LISTED).map((r) => ({ value: faceOf(r.data), when: when(kit, r.data.day) }));
  kit.send(copy.history({ name: label.data.name, rows: shown, more: Math.max(0, rows.length - LISTED) }) + (await pageLine(kit)), { ref: j({ k: "l", id: label.key } satisfies LabelRef) });
}

/**
 * Words with no number: look them up. Our own matching first; when it finds nothing and something
 * is kept, the sorting model picks among the labels, hearing each value's shape and never the value.
 */
async function recall(kit: Kit, words: string, then: (found: Row<Label>[]) => Promise<void>): Promise<void> {
  const all = (await labels(kit)).filter((l) => l.data.current);
  if (!all.length) return kit.unsure(copy.nothingYet());
  const asked = wordsOf(words);
  const named = all.map((l) => ({ ...l, id: l.key, words: l.data.words }));
  const found = directMatch(asked, named);
  if (found.length) return then(found);
  // Names the person said are one: "Mom" asks for what is kept under "Amma".
  const aliases = (await kit.store.get<Record<string, string[]>>("state", "aliases")) ?? {};
  for (const [i, w] of asked.entries()) {
    for (const other of aliases[w] ?? []) {
      const again = directMatch([...asked.slice(0, i), other, ...asked.slice(i + 1)], named);
      if (again.length) return then(again);
    }
  }
  const likely = [...all].sort((a, b) => overlap(asked, b.data.words) - overlap(asked, a.data.words) || b.data.touched - a.data.touched).slice(0, 20);
  const choices: Record<string, string> = {};
  for (const l of likely) {
    const e = l.data.current ? await kit.store.get<Entry>("entries", `${l.key}:${l.data.current.id}`) : null;
    const shape = e ? shapeWords({ text: e.text, num: e.num, num2: e.num2, unit: e.unit, shape: e.shape }) : "a number";
    choices[l.key] = `${l.data.name}: ${shape}`.slice(0, 300);
  }
  await kit.sort(words.slice(0, 200), choices, j({ k: "q", words: words.slice(0, 60) } satisfies SortRef), { after: 0 });
}

const lower = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[.!]+$/, "").trim();
const isWord = (text: string, words: readonly string[]) => words.includes(lower(text));

/** "history weight", "weight history", "graph of weight": the label's words, or null. */
function historyOf(text: string): string | null {
  const t = lower(text).replace(/\?$/, "");
  for (const w of HISTORY_WORDS) {
    if (t.startsWith(`${w} `)) return t.slice(w.length + 1).replace(/^(of|for)\s+/, "");
    if (t.endsWith(` ${w}`)) return t.slice(0, -w.length - 1);
  }
  return null;
}

/** "remove weight", "delete Amma ring size": the label's words, or null. */
function removeOf(text: string): string | null {
  const t = lower(text);
  for (const w of REMOVE_WORDS) if (t.startsWith(`${w} `)) return t.slice(w.length + 1);
  return null;
}

async function askRemove(kit: Kit, label: Row<Label>): Promise<void> {
  kit.ask(copy.askRemove({ name: label.data.name, count: label.data.count }), [...REMOVE_OPTIONS], { ref: j({ k: "rm", id: label.key } satisfies RemoveRef), confirm: false });
}

/** Keep what a message holds. The 👍, or one line in words when there is something to say. */
async function keepAll(kit: Kit, pieces: { label: string; value: Value }[], day: string, photos: string[]): Promise<void> {
  const all = await labels(kit);
  const ids: string[] = [];
  let secret: ReturnType<typeof secretOf> = null;
  const dates: { name: string; date: string; remind: ReturnType<typeof remindOf> }[] = [];
  let jump: { name: string; value: string; before: string } | null = null;
  let full = false;
  let grown: Label | null = null;
  let counting: string | null = null;
  for (const [i, p] of pieces.slice(0, MAX_PIECES).entries()) {
    const label = await labelFor(kit, all, p.label);
    if (!label) {
      full = true;
      continue;
    }
    const before = label.data.current ? await kit.store.get<Entry>("entries", `${label.key}:${label.data.current.id}`) : null;
    const key = await keep(kit, label, p.value, day, i === 0 ? photos : [], "whatsapp");
    if (!key) {
      full = true;
      continue;
    }
    ids.push(key);
    secret ??= secretOf(label.data.words, p.value);
    const e = await kit.store.get<Entry>("entries", key);
    if (e?.date) dates.push({ name: label.data.name, date: sayDate(e.date), remind: remindOf(label.data.words, e.date, kit.today) });
    // A value far from the one before under the same label: both are said, with no verdict.
    if (before?.num && p.value.num !== null && before.unit === p.value.unit && (p.value.num > before.num * 3 || p.value.num < before.num / 3)) {
      jump ??= { name: label.data.name, value: p.value.text, before: faceOf(before) };
    }
    if (label.data.count === 2) grown ??= label.data;
    // Added to one at a time, twice in a row (12, 13, 14): from now on its name alone counts it up.
    // One step is not enough: a waist can go from 30 to 31.
    if (label.data.counter === undefined && label.data.count >= 3 && p.value.shape === "number" && !p.value.unit && (await countsUp(kit, label.key))) {
      label.data = { ...label.data, counter: true };
      await kit.store.put("labels", label.key, j(label.data));
      counting ??= label.data.name;
    }
  }
  if (!ids.length) {
    if (full) kit.send(copy.full({ max: MAX_LABELS }));
    for (const p of photos) await kit.files.remove(p);
    return;
  }
  const ref: MessageRef = { k: "m", ids };
  kit.mark(j(ref));
  await kit.store.put("state", "last", j({ ids, at: kit.now, ref } satisfies Last));
  const firstDay = (await kit.store.get<string>("state", "firstDay")) ?? kit.today;
  if (firstDay === kit.today) await kit.store.put("state", "firstDay", firstDay);

  const said: string[] = [];
  if (full) said.push(copy.full({ max: MAX_LABELS }));
  if (!(await kit.store.get("state", "taught"))) {
    await kit.store.put("state", "taught", 1);
    const label = await kit.store.get<Label>("labels", ids[0].split(":")[0]);
    const e = await kit.store.get<Entry>("entries", ids[0]);
    said.push(copy.firstKept({ name: label?.name ?? pieces[0].label, value: e ? faceOf(e) : pieces[0].value.text }));
    for (const d of dates) if (d.remind) said.push(copy.remindLine({ kind: d.remind.kind }));
  } else if (dates.length) {
    // A date is always said back in words, so 12/03 is never taken the wrong way round.
    for (const d of dates) said.push(copy.keptDate({ name: d.name, date: d.date, remind: d.remind?.kind ?? null }));
  } else if (counting) said.push(copy.nowCounting({ name: counting }));
  else if (jump) said.push(copy.jump(jump));
  else if (grown && firstDay < kit.today && !(await kit.store.get("state", "page"))) {
    await kit.store.put("state", "page", 1);
    said.push(copy.keptWithPage({ name: grown.name, count: grown.count }));
  }
  // A hidden value is marked 🔒 on the person's message, every time; the words come with the first one only
  // (the owner, 2026-11-26). An Aadhaar number isn't hidden, so its offer is said each time.
  const hidden = !!secret && LOCKED.includes(secret);
  if (hidden && !(await kit.store.get("state", "hiddenTaught"))) {
    await kit.store.put("state", "hiddenTaught", 1);
    said.push(copy.locked({ what: secret! }));
  } else if (secret && !hidden) said.push(copy.secret({ what: secret }));
  if (hidden) kit.react(HIDDEN);
  // Otherwise a reaction or a reply, never both (docs/plugin-ui-styleguide.md, section 10).
  if (said.length) kit.send(said.join("\n\n"));
  else if (!hidden) kit.react(SAVED);
}

async function undo(kit: Kit, ids: string[] | null, ref: Json | null): Promise<void> {
  if (!ids?.length) return kit.send(copy.nothingToUndo());
  const gone = await takeOut(kit, ids);
  if (!gone.length) return kit.send(copy.nothingToUndo());
  const last = await kit.store.get<Last>("state", "last");
  if (last && last.ids.some((i) => ids.includes(i))) await kit.store.delete("state", "last");
  if (ref) kit.reactTo(ref, "");
  // One count taken back: say where it stands now.
  if (ids.length === 1) {
    const label = await kit.store.get<Label>("labels", ids[0].split(":")[0]);
    if (label?.counter && label.current) return kit.send(copy.takenOutCount({ name: label.name, count: label.current.text }));
  }
  kit.send(copy.takenOut({ what: gone.join("; ") }));
}

/** A photo with no number: with what was kept just now, or under the label its caption names. */
async function photoOnly(kit: Kit, text: string, photos: string[]): Promise<void> {
  const last = await kit.store.get<Last>("state", "last");
  let key: string | null = null;
  if (text) {
    const all = (await labels(kit)).filter((l) => l.data.current);
    const found = directMatch(wordsOf(text), all.map((l) => ({ ...l, id: l.key, words: l.data.words })));
    if (found.length === 1) key = `${found[0].key}:${found[0].data.current!.id}`;
  }
  if (!key && last && kit.now - last.at <= PHOTO_AFTER_MS) key = last.ids[0] ?? null;
  const e = key ? await kit.store.get<Entry>("entries", key) : null;
  if (!key || !e) {
    // Kept, and asked for its number: the person never sends the photo twice (voice 10, the owner, 2026-11-26).
    const before = await waitingPhotos(kit);
    await kit.store.put("state", "photos", j({ photos: [...before, ...photos], at: kit.now } satisfies Waiting));
    return kit.send(copy.photoAlone());
  }
  const room = Math.max(0, MAX_PHOTOS - e.photos.length);
  for (const p of photos.slice(room)) await kit.files.remove(p);
  if (!room) return kit.send(copy.photosFull());
  await kit.store.put("entries", key, j({ ...e, photos: [...e.photos, ...photos.slice(0, room)] }));
  await refresh(kit, key.split(":")[0]);
  kit.react(SAVED);
}

/** Photos still waiting for their number, taken out of waiting. Too old, and they are let go. */
async function waitingPhotos(kit: Kit): Promise<string[]> {
  const w = await kit.store.get<Waiting>("state", "photos");
  if (!w) return [];
  await kit.store.delete("state", "photos");
  if (kit.now - w.at <= PENDING_MS) return w.photos;
  for (const p of w.photos) await kit.files.remove(p);
  return [];
}

/** The label's last three values are whole numbers with no unit, each one more than the one before. */
async function countsUp(kit: Kit, id: string): Promise<boolean> {
  const last = (await entriesOf(kit, id)).slice(-3).map((r) => r.data);
  return last.length === 3 && last.every((e) => isWhole(e.num) && !e.unit && e.shape === "number") && last[1].num === last[0].num! + 1 && last[2].num === last[1].num! + 1;
}

const isWhole = (n: number | null | undefined): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;

/** Words that ask for a count rather than add to it: "gym?", "gym count", "get gym", "show gym". */
const ASKING = /\?|^(get|show|what|whats|what's|how|tell|see|check)\b|\b(count|total|now|so far)$/i;

/** "gym", "gym today": a counting label's name alone, with nothing asked. The label, or null. */
async function countOf(kit: Kit, text: string): Promise<Row<Label> | null> {
  if (ASKING.test(text)) return null;
  const words = wordsOf(text.replace(/\btoday\b/gi, " "));
  if (!words.length) return null;
  const all = (await labels(kit)).filter((l) => l.data.counter && l.data.current);
  const found = all.filter((l) => sameLabel(words, l.data.words));
  return found.length === 1 ? found[0] : null;
}

/** Add one to a counting label, and say the new count. */
async function countUp(kit: Kit, label: Row<Label>): Promise<void> {
  const e = await kit.store.get<Entry>("entries", `${label.key}:${label.data.current!.id}`);
  const n = (isWhole(e?.num) ? e!.num! : 0) + 1;
  const key = await keep(kit, label, { text: String(n), num: n, num2: null, unit: null, shape: "number" }, kit.today, [], "whatsapp");
  if (!key) return kit.send(copy.fullOne({ max: MAX_ENTRIES }));
  const ref: MessageRef = { k: "m", ids: [key] };
  kit.mark(j(ref));
  await kit.store.put("state", "last", j({ ids: [key], at: kit.now, ref } satisfies Last));
  kit.send(copy.counted({ name: label.data.name, count: n }));
}

export default definePlugin({
  id: "digits-store",
  version: "1.4.0",
  sdk: "1",
  name: "NumberKeeper",
  icon: "🔢",
  tagline: "Any number you want kept, with a word for what it is. Ask for it back any time.",
  description:
    "Send a number with a word for what it is: \"Amma ring size 14\", \"weight 72.4\", \"car service 45,200 km\". Each one is kept with its day, and the one before is kept too, so you can ask for the latest, see every one, or look at a graph on the page. A photo sent with a number is kept with it. Nothing is asked for and nothing is judged.",
  groupName: copy.groupName(),
  price: 0,
  // Tier 1: a few rows per message, no schedules, and the sorting model only when our own matching finds nothing.
  tier: 1,
  // "photos": a photo sent with a number is kept with it. "sort": a question our matching can't place goes to the
  // sorting model with the labels and each value's shape, never a value.
  permissions: ["photos", "sort"],
  unlisted: true,
  listing: {
    title: "Remember any number: sizes, readings, weights | Zelfred",
    description: "Send me a number with a word for what it is. I keep it with the ones before, and give it back when you ask.",
    h1: "Send me a number once. Ask for it back whenever you like.",
  },
  welcome: copy.welcome(),
  help: copy.help(),
  // The morning a date is due (the owner, 2026-11-26: "only nudges are birthdays and future dates").
  schedules: [{ id: "dates", hour: 9 }],

  async onSchedule(event, kit) {
    if (event.id !== "dates") return;
    const soon = kit.time.shiftDay(kit.today, BEFORE_DAYS);
    for (const l of await labels(kit)) {
      if (!l.data.current) continue;
      const e = await kit.store.get<Entry>("entries", `${l.key}:${l.data.current.id}`);
      if (!e?.date) continue;
      const r = remindOf(l.data.words, e.date, kit.today);
      if (!r) continue;
      const due = r.day === kit.today ? "today" : r.kind === "once" && r.day === soon ? "soon" : null;
      if (!due) continue;
      const told = `told:${l.key}:${r.day}:${due}`;
      if (await kit.store.get("state", told)) continue;
      await kit.store.put("state", told, 1);
      kit.send(copy.reminder({ name: l.data.name, date: sayDate(e.date), due, kind: r.kind }), { ref: j({ k: "l", id: l.key } satisfies LabelRef) });
    }
  },

  async onMessage(event, kit) {
    const text = event.text.replace(/\s+/g, " ").trim();
    let photos = (event.photos ?? []).map((p) => p.id);
    const quoted = event.quotedRef;

    // A reply to the person's own message that kept numbers: correct it, or take it out.
    if (isMessageRef(quoted)) {
      if (isWord(text, UNDO_WORDS)) return undo(kit, quoted.ids, j(quoted));
      const v = readValue(text);
      if (v && quoted.ids.length === 1) {
        const e = await kit.store.get<Entry>("entries", quoted.ids[0]);
        if (e) {
          const label = await kit.store.get<Label>("labels", quoted.ids[0].split(":")[0]);
          const { locked: _l, date: _d, ...rest } = e;
          await kit.store.put("entries", quoted.ids[0], j({ ...rest, text: v.text, num: v.num, num2: v.num2, unit: v.unit, shape: v.shape, ...extras(label?.words ?? [], v) }));
          await refresh(kit, quoted.ids[0].split(":")[0]);
          return kit.react(SAVED);
        }
      }
    }
    // A reply to an answer about a label: a number adds to it; "history" and "remove" act on it.
    if (isLabelRef(quoted)) {
      const label = await kit.store.get<Label>("labels", quoted.id);
      if (label) {
        const row = { key: quoted.id, data: label };
        if (isWord(text, HISTORY_WORDS)) return history(kit, row);
        if (isWord(text, REMOVE_WORDS)) return askRemove(kit, row);
        const v = readValue(text);
        if (v) return keepAll(kit, [{ label: label.name, value: v }], kit.today, photos);
      }
    }

    if (!text && photos.length) return photoOnly(kit, "", photos);
    if (!text) return;

    if (isWord(text, LIST_WORDS)) return list(kit);
    if (isWord(text, UNDO_WORDS)) {
      const last = await kit.store.get<Last>("state", "last");
      return undo(kit, last?.ids ?? null, last?.ref ?? null);
    }
    const h = historyOf(text);
    if (h) {
      return recall(kit, h, async (found) => (found.length === 1 ? history(kit, found[0]) : answer(kit, found)));
    }
    const rm = removeOf(text);
    if (rm && !/\d/.test(rm)) {
      return recall(kit, rm, async (found) => (found.length === 1 ? askRemove(kit, found[0]) : answer(kit, found)));
    }
    // "remove weight 72.4": that one value, the newest kept with it. Never kept as a label called "remove weight".
    if (rm) {
      const r = readNumbers(rm);
      const piece = r?.pieces.length === 1 ? r.pieces[0] : null;
      if (piece?.label) {
        const all = (await labels(kit)).filter((l) => l.data.current);
        const found = directMatch(wordsOf(piece.label), all.map((l) => ({ ...l, id: l.key, words: l.data.words })));
        if (found.length === 1) {
          const rows = (await entriesOf(kit, found[0].key)).reverse();
          const hit = rows.find((x) => x.data.text === piece.value.text) ?? rows.find((x) => x.data.num !== null && x.data.num === piece.value.num);
          if (hit) return undo(kit, [hit.key], null);
        }
        return kit.send(copy.notFound({ words: rm }));
      }
    }

    const reading = readNumbers(text);
    if (reading) {
      // Photos sent first, then their number: they go with it.
      const waiting = await waitingPhotos(kit);
      if (waiting.length) photos = [...waiting, ...photos];
      const day = kit.time.shiftDay(kit.today, -reading.daysBack);
      const pieces = reading.pieces;
      // A number alone: it goes under the only label there is, or waits for its word.
      if (pieces.length === 1 && !pieces[0].label) {
        const all = (await labels(kit)).filter((l) => l.data.current);
        if (all.length === 1) return keepAll(kit, [{ label: all[0].data.name, value: pieces[0].value }], day, photos);
        await kit.store.put("state", "pending", j({ value: pieces[0].value, at: kit.now, day, photos, ref: null } satisfies Pending));
        return kit.send(copy.whatIsIt({ value: pieces[0].value.text }));
      }
      return keepAll(kit, pieces, day, photos);
    }

    // Words and no number. The word for a number that was waiting for one?
    const pending = await kit.store.get<Pending>("state", "pending");
    if (pending) {
      await kit.store.delete("state", "pending");
      const name = tidyLabel(text.replace(/\?+$/, ""));
      if (kit.now - pending.at <= PENDING_MS && name) return keepAll(kit, [{ label: name, value: pending.value }], pending.day, [...pending.photos, ...photos]);
      for (const p of pending.photos) await kit.files.remove(p);
    }
    if (photos.length) return photoOnly(kit, text, photos);
    // A counting label's name alone adds one. Anything asked about it gives the count.
    const counter = await countOf(kit, text);
    if (counter) return countUp(kit, counter);
    // Otherwise it is a question: what is kept under these words?
    const words = text.replace(/\?+$/, "").trim();
    return recall(kit, words, (found) => answer(kit, found));
  },

  /** ❌ on the person's own message takes its numbers out, and my 👍 comes off it. */
  async onReaction(event, kit) {
    if (!isMessageRef(event.ref) || !event.emoji) return;
    if (!REMOVE_REACTIONS.some((r) => r.replace(/️/g, "") === event.emoji!.replace(/️/g, ""))) return;
    await undo(kit, event.ref.ids, event.ref);
  },

  /** The person deleted their message for everyone: its numbers go with it, and nothing is said. */
  async onDeleted(event, kit) {
    if (!isMessageRef(event.ref)) return;
    await takeOut(kit, event.ref.ids);
    const last = await kit.store.get<Last>("state", "last");
    if (last && last.ids.some((i) => (event.ref as MessageRef).ids.includes(i))) await kit.store.delete("state", "last");
  },

  /** The sorting model placed words our matching couldn't. Null: nothing kept fits them. */
  async onSorted(event, kit) {
    if (!isSortRef(event.ref)) return;
    const label = event.choice ? await kit.store.get<Label>("labels", event.choice) : null;
    if (!label || !label.current) return kit.send(copy.notFound({ words: event.ref.words }));
    await answer(kit, [{ key: event.choice!, data: label }]);
    // One name asked for in place of another ("Mom" for "Amma"): ask once whether they are one, and remember.
    const asked = wordsOf(event.ref.words);
    const theirs = asked.filter((w) => !label.words.some((x) => sameWord(x, w)));
    const ours = label.words.filter((w) => !asked.some((x) => sameWord(x, w)));
    if (theirs.length === 1 && ours.length === 1) {
      const [a, b] = [theirs[0], ours[0]].sort();
      if (!(await kit.store.get("state", `asked:${a}|${b}`))) {
        await kit.store.put("state", `asked:${a}|${b}`, 1);
        kit.ask(copy.samePerson({ asked: theirs[0], kept: ours[0] }), [...SAME_OPTIONS], { ref: j({ k: "al", a, b, asked: theirs[0], kept: ours[0] } satisfies SameRef), confirm: false });
      }
    }
  },

  async onAnswer(event, kit) {
    if (isSameRef(event.ref)) {
      if (event.choice !== 0) return kit.send(copy.sameNot());
      const { a, b } = event.ref;
      const aliases = (await kit.store.get<Record<string, string[]>>("state", "aliases")) ?? {};
      aliases[a] = [...new Set([...(aliases[a] ?? []), b])];
      aliases[b] = [...new Set([...(aliases[b] ?? []), a])];
      await kit.store.put("state", "aliases", j(aliases));
      return kit.send(copy.sameKept({ asked: event.ref.asked ?? a, kept: event.ref.kept ?? b }));
    }
    if (!isRemoveRef(event.ref)) return;
    const label = await kit.store.get<Label>("labels", event.ref.id);
    if (!label) return;
    if (event.choice === 0) {
      await removeLabel(kit, event.ref.id);
      kit.send(copy.removedLabel({ name: label.name }));
    } else kit.send(copy.keptLabel({ name: label.name }));
  },

  web: {
    lockable: true,
    async load(kit, args) {
      const id = args && typeof args === "object" && !Array.isArray(args) && typeof (args as { label?: unknown }).label === "string" ? (args as { label: string }).label : null;
      if (id) {
        const label = await kit.store.get<Label>("labels", id);
        if (!label) return { label: null, entries: [] };
        const rows = await entriesOf(kit, id);
        return j({
          label: { id, name: label.name, count: label.count },
          entries: rows.reverse().map((r) => ({ id: r.key.split(":")[1], text: faceOf(r.data), locked: !!r.data.locked, num: r.data.locked ? null : r.data.num, num2: r.data.num2, unit: r.data.unit, shape: r.data.shape, day: r.data.day, at: r.data.at, photos: r.data.photos })),
        });
      }
      const all = await labels(kit);
      const out = [];
      for (const l of all) {
        if (!l.data.current) continue;
        const rows = await entriesOf(kit, l.key);
        const points = rows.filter((r) => r.data.num !== null && !r.data.locked).slice(-SERIES).map((r) => ({ day: r.data.day, num: r.data.num, num2: r.data.num2 }));
        out.push({ id: l.key, name: l.data.name, count: l.data.count, current: l.data.current, first: l.data.first, touched: l.data.touched, counter: !!l.data.counter, unit: rows.at(-1)?.data.unit ?? null, series: points });
      }
      out.sort((a, b) => b.touched - a.touched);
      return j({ labels: out, max: MAX_LABELS });
    },
    actions: {
      /** Add a value from the page, to a label kept or a new one, on any day: "my weight in June was 80". */
      async add(kit, args) {
        const a = (args ?? {}) as { label?: unknown; name?: unknown; value?: unknown; day?: unknown };
        const v = readValue(String(a.value ?? ""));
        if (!v) throw new Error("That isn't a number I can read.");
        const day = typeof a.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.day) ? a.day : kit.today;
        if (day > kit.today) throw new Error("That day hasn't come yet.");
        const all = await labels(kit);
        let label: Row<Label> | null = null;
        if (typeof a.label === "string") {
          const l = await kit.store.get<Label>("labels", a.label);
          label = l ? { key: a.label, data: l } : null;
        } else if (typeof a.name === "string" && tidyLabel(a.name)) label = await labelFor(kit, all, tidyLabel(a.name));
        if (!label) throw new Error(all.length >= MAX_LABELS ? `Sorry, I can keep up to ${MAX_LABELS} different things for now.` : "Give it a name.");
        const key = await keep(kit, label, v, day, [], "page");
        if (!key) throw new Error("Sorry, that one is full for now.");
        if (!(await kit.store.get("state", "firstDay"))) await kit.store.put("state", "firstDay", kit.today);
        return { label: label.key, entry: key.split(":")[1] };
      },
      /** Correct one entry: its value, its day, or both. */
      async edit(kit, args) {
        const a = (args ?? {}) as { label?: unknown; entry?: unknown; value?: unknown; day?: unknown };
        const key = `${String(a.label)}:${String(a.entry)}`;
        const e = await kit.store.get<Entry>("entries", key);
        if (!e) throw new Error("That one is gone.");
        let next = { ...e };
        if (a.value !== undefined) {
          const v = readValue(String(a.value));
          if (!v) throw new Error("That isn't a number I can read.");
          const label = await kit.store.get<Label>("labels", String(a.label));
          const { locked: _l, date: _d, ...rest } = next;
          next = { ...rest, text: v.text, num: v.num, num2: v.num2, unit: v.unit, shape: v.shape, ...extras(label?.words ?? [], v) };
        }
        if (a.day !== undefined) {
          if (typeof a.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(a.day)) throw new Error("That isn't a day.");
          if (a.day > kit.today) throw new Error("That day hasn't come yet.");
          next.day = a.day;
        }
        await kit.store.put("entries", key, j(next), sortOf(next));
        await refresh(kit, String(a.label));
      },
      /**
       * A hidden value whole. The page calls it only behind the vault's unlock, the person's passkey or
       * passphrase (the owner, 2026-11-26). Until Zelfred has that one lock for every page, no button calls it.
       */
      async reveal(kit, args) {
        const a = (args ?? {}) as { label?: unknown; entry?: unknown };
        const e = await kit.store.get<Entry>("entries", `${String(a.label)}:${String(a.entry)}`);
        if (!e) throw new Error("That one is gone.");
        return { text: e.text };
      },
      async remove(kit, args) {
        const a = (args ?? {}) as { label?: unknown; entry?: unknown };
        const gone = await takeOut(kit, [`${String(a.label)}:${String(a.entry)}`]);
        if (!gone.length) throw new Error("That one is gone.");
      },
      async rename(kit, args) {
        const a = (args ?? {}) as { label?: unknown; name?: unknown };
        const label = await kit.store.get<Label>("labels", String(a.label));
        if (!label) throw new Error("That one is gone.");
        const name = tidyLabel(String(a.name ?? ""));
        if (!name) throw new Error("Give it a name.");
        const words = wordsOf(name);
        const clash = (await labels(kit)).find((l) => l.key !== a.label && sameLabel(words, l.data.words));
        if (clash) throw new Error(`There is already ${clash.data.name}.`);
        await kit.store.put("labels", String(a.label), j({ ...label, name, words }), words.join(" ") || name.toLowerCase());
      },
      /** Turn counting up by name on or off for a label. Off stays off: it is not set again by itself. */
      async setCounter(kit, args) {
        const a = (args ?? {}) as { label?: unknown; on?: unknown };
        const label = await kit.store.get<Label>("labels", String(a.label));
        if (!label) throw new Error("That one is gone.");
        await kit.store.put("labels", String(a.label), j({ ...label, counter: a.on === true }));
      },
      async removeLabel(kit, args) {
        const a = (args ?? {}) as { label?: unknown };
        if (!(await removeLabel(kit, String(a.label)))) throw new Error("That one is gone.");
      },
      /** Everything, for good. The page asks first. */
      async removeAll(kit) {
        for (const l of await labels(kit)) await removeLabel(kit, l.key);
        for (const k of ["last", "pending", "photos"]) await kit.store.delete("state", k);
      },
    },
  },
});
