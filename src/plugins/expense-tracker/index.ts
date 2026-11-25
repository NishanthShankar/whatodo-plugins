import { definePlugin, type Json, type Kit, type Photo, type Sender } from "../../sdk";
import { copy, MINE, SAVED, type Owes, type Row, type Shown } from "./copy";
import { add, cleanTag, COMMON, currencyOf, guessCurrency, label, MAX_TAGS, money, readAmount, readExpense, sayDay, sign, takeTags, total, type Read, type Sums } from "./money";

/**
 * TripExpenses, a simple expense tracker
 *
 * People send what they paid for and the amount; it is added up. "end trip" closes the list
 * and the next expense starts a new one. Everyone in the group can send expenses. Nothing is
 * split: it is one sum, with what each person sent beside it.
 *
 * Currency. An amount with a currency is kept in that currency. A bare amount is in the
 * trip's currency. A trip's currency comes from its first expense when that names one;
 * otherwise the trip asks, once, with the person's own currency (kit.person.currency, else a
 * guess from their clock) as the first choice. Until someone answers, that first choice
 * stands. What the person who added the app says is handed to Zelfred (kit.learn), which
 * keeps it if it knew nothing.
 *
 * Groups. Besides its own group it takes groups the person already had (onGroup). Each group
 * has its own trips: what is sent in one never shows in another. `here` below is the group's
 * key, null for the app's own group.
 *
 * A new trip starts three ways: the first expense after "end trip", or someone giving the
 * group a new description or a new name (onGroupInfo). The new trip is called what they wrote.
 *
 * Storage
 *   trips     key: trip id                data: Trip      sort: started (ms)
 *   expenses  key: "<trip id>:<id>"       data: Expense   sort: its place in the trip (1, 2, 3...)
 *   homes     key: group key              data: { name }  the groups handed over
 *   people    key: a person's id          data: { name }  the name each person was last heard under
 *   state, one set per group: the key as below in the app's own group, "<key>@<group>" elsewhere
 *   state     key: "open"                 data: { trip }  the trip expenses go to now
 *   state     key: "n"                    data: number    how many trips were started
 *   state     key: "taught"               data: 1 once the first-expense note was sent
 *   state     key: "taughtBill"           data: 1 once a bill was kept here (the note about bills is said once)
 *   state     key: "taughtWho"            data: 1 once an expense was given to someone here (the note about it is said once)
 *   state     key: "shared"               data: 1 once someone other than the owner wrote here
 *   state     key: "prompted"             data: 1 after "I need an amount", until something is kept
 */

/** The group something happens in: its key, or null for the app's own group. */
type Here = string | null;
const STATE = ["open", "n", "taught", "taughtBill", "taughtWho", "shared", "prompted"] as const;
const sk = (here: Here, key: (typeof STATE)[number]) => (here ? `${key}@${here}` : key);

/** The most expenses one trip holds. */
export const MAX_EXPENSES = 500;
/** The most lines of one message read as expenses. */
export const MAX_LINES = 20;
/** How many expenses a list shows: the newest ones. */
export const LISTED = 40;
/** How many ended trips the page shows for each group. */
export const PAGE_TRIPS = 50;
/** How many trips `trips` shows. */
export const TRIPS_SHOWN = 10;
/** The longest name a trip takes. */
export const MAX_NAME = 40;

export interface Trip {
  /** Its number in its group: "Trip 2" until it is named. */
  n: number;
  /** The group it belongs to, when that is one the person handed over. */
  home?: string | null;
  name: string | null;
  /** What bare amounts are counted in. Null until an expense or an answer says. */
  currency: string | null;
  /** The currencies offered while the question about it is open, in the options' order. */
  asked?: string[] | null;
  startedAt: number;
  endedAt: number | null;
  /** How many expenses were ever sent to it: the next one's place in the list. */
  seq?: number;
  /** Set when it ends: how many expenses, and their sums by currency. */
  count?: number;
  sums?: Sums;
  /**
   * The people on it besides those who spent something: everyone who wrote, reacted or was tagged in its group while it was
   * open. Its cost is shared equally by all of them and the spenders.
   */
  crew?: string[];
  /** Set when it ends: the labels and emoji its expenses carried, for the page to offer again. */
  used?: { labels: string[]; marks: string[] };
}

export interface Expense {
  what: string;
  amount: number;
  /** Null: the trip's currency. */
  currency: string | null;
  /** Who spent it, and their name: the sender, until a reply gives it to someone else. */
  by: string;
  name: string | null;
  at: number;
  /** The day it was paid, "YYYY-MM-DD", when that was set on the page. Without it: the day it was sent. */
  day?: string;
  /** Its labels, lowercase, without the "#". */
  tags?: string[];
  /** The id of the photo of its bill (kept by Zelfred). */
  bill?: string | null;
  /** The emoji someone in the group reacted to it with: the group it is in. */
  mark?: string | null;
}

/** A line read as an expense, with the labels that were on it. */
type Kept = Read & { tags: string[] };

interface ExpenseRef {
  kind: "expense";
  trip: string;
  ids: string[];
}
const isExpenseRef = (ref: unknown): ref is ExpenseRef =>
  !!ref && typeof ref === "object" && (ref as ExpenseRef).kind === "expense" && typeof (ref as ExpenseRef).trip === "string" && Array.isArray((ref as ExpenseRef).ids) && (ref as ExpenseRef).ids.every((i) => typeof i === "string");

interface CurrencyRef {
  kind: "currency";
  trip: string;
  codes: string[];
}
const isCurrencyRef = (ref: unknown): ref is CurrencyRef =>
  !!ref && typeof ref === "object" && (ref as CurrencyRef).kind === "currency" && typeof (ref as CurrencyRef).trip === "string" && Array.isArray((ref as CurrencyRef).codes) && (ref as CurrencyRef).codes.every((c) => typeof c === "string");
const currencyRef = (trip: string, codes: string[]): CurrencyRef => ({ kind: "currency", trip, codes });

type Found = { id: string; trip: Trip };

/** The trip expenses go to now, or null when none is open. */
async function openTrip(kit: Kit, here: Here): Promise<Found | null> {
  const open = await kit.store.get<{ trip: string }>("state", sk(here, "open"));
  if (!open) return null;
  const trip = await kit.store.get<Trip>("trips", open.trip);
  return trip && trip.endedAt === null ? { id: open.trip, trip } : null;
}

async function startTrip(kit: Kit, here: Here, name: string | null = null): Promise<Found> {
  const n = ((await kit.store.get<number>("state", sk(here, "n"))) ?? 0) + 1;
  const id = kit.id();
  const trip: Trip = { n, name, currency: null, startedAt: kit.now, endedAt: null, ...(here ? { home: here } : {}) };
  await kit.store.put("trips", id, trip as unknown as Json, kit.now);
  await kit.store.put("state", sk(here, "n"), n);
  await kit.store.put("state", sk(here, "open"), { trip: id });
  return { id, trip };
}

const save = (kit: Kit, f: Found) => kit.store.put("trips", f.id, f.trip as unknown as Json);

/** The person's own currency: what Zelfred knows, else a guess from their clock. */
const own = (kit: Kit) => kit.person.currency || guessCurrency(kit.person.timezone);
/** What a trip's bare amounts are counted in. */
const of = (kit: Kit, trip: Trip) => trip.currency ?? own(kit);

const expensesOf = (kit: Kit, tripId: string) => kit.store.list<Expense>("expenses", { prefix: `${tripId}:` });

const titleOf = (trip: Trip) => trip.name ?? `Trip ${trip.n}`;
function daysOf(kit: Kit, trip: Trip): string {
  const from = kit.time.day(trip.startedAt);
  const to = kit.time.day(trip.endedAt ?? kit.now);
  if (from === to) return sayDay(from);
  return from.slice(0, 7) === to.slice(0, 7) ? `${Number(from.slice(8))} to ${sayDay(to)}` : `${sayDay(from)} to ${sayDay(to)}`;
}

/** What each label adds up to, biggest first: "food ₹450". Empty when no expense has a label. */
function labelSums(items: { data: Expense }[], mine: string): string[] {
  const by = new Map<string, Sums>();
  for (const { data: e } of items) for (const t of e.tags ?? []) add(by.get(t) ?? by.set(t, {}).get(t)!, e.amount, e.currency ?? mine);
  const size = (s: Sums) => Object.values(s).reduce((a, b) => a + b, 0);
  return [...by].sort((a, b) => size(b[1]) - size(a[1]) || a[0].localeCompare(b[0])).map(([t, s]) => `${t} ${total(s, mine)}`);
}

/** What each emoji's group adds up to, biggest first. Empty when no expense was reacted to. */
function markSums(items: { data: Expense }[], mine: string): { mark: string; total: string; count: number }[] {
  const by = new Map<string, { sums: Sums; count: number }>();
  for (const { data: e } of items) {
    if (!e.mark) continue;
    const g = by.get(e.mark) ?? by.set(e.mark, { sums: {}, count: 0 }).get(e.mark)!;
    add(g.sums, e.amount, e.currency ?? mine);
    g.count++;
  }
  const size = (s: Sums) => Object.values(s).reduce((a, b) => a + b, 0);
  return [...by].sort((a, b) => size(b[1].sums) - size(a[1].sums) || a[0].localeCompare(b[0])).map(([mark, g]) => ({ mark, total: total(g.sums, mine), count: g.count }));
}

/** Reactions that say "seen" or "fine" and not which group an expense is in. */
const PLAIN = new Set(["👍", "✅", "👌", "🙏"]);
/** An emoji without its skin tone or the mark that makes it a picture. */
const bare = (emoji: string) => emoji.replace(/[\u{1F3FB}-\u{1F3FF}\uFE0F]/gu, "");

/** Take an expense out, and its bill's photo with it. */
async function drop(kit: Kit, key: string, e: Expense): Promise<void> {
  if (e.bill) await kit.files.remove(e.bill);
  await kit.store.delete("expenses", key);
}

/** Who is who among some expenses: each person's id and their name, null while nobody has heard it. */
type Names = Map<string, string | null>;

/**
 * The name a person was last heard under is kept, so an expense given to someone who had never written (tagged in a reply)
 * shows their name by itself from the first time they write, react or answer here.
 */
async function know(kit: Kit, s: Sender): Promise<void> {
  const name = s.name ?? (s.owner ? kit.person.name : null);
  if (!name) return;
  if ((await kit.store.get<{ name: string }>("people", s.id))?.name !== name) await kit.store.put("people", s.id, { name });
}

/** The most people one trip is shared by. */
export const MAX_CREW = 50;

/** Count these people in on the open trip of a group: they are here, so its cost is theirs to share. */
async function join(kit: Kit, here: Here, people: Sender[]): Promise<void> {
  const f = await openTrip(kit, here);
  if (!f) return;
  const crew = f.trip.crew ?? [];
  const fresh = [...new Set(people.map((p) => p.id))].filter((id) => !crew.includes(id)).slice(0, MAX_CREW - crew.length);
  if (!fresh.length) return;
  f.trip = { ...f.trip, crew: [...crew, ...fresh] };
  await save(kit, f);
}

/**
 * Who owes whom, when everyone on the trip shares its cost equally: each person's share against what they spent, settled in
 * as few payments as it takes. Each currency is settled on its own. Null with fewer than two people.
 */
function owesOf(trip: Trip, items: { data: Expense }[], mine: string, names: Names): Owes | null {
  const crew = [...new Set([...(trip.crew ?? []), ...items.map((i) => i.data.by)])];
  if (crew.length < 2 || !items.length) return null;
  const sums: Sums = {};
  const paid = new Map<string, Sums>();
  for (const { data: e } of items) {
    const c = e.currency ?? mine;
    add(sums, e.amount, c);
    add(paid.get(e.by) ?? paid.set(e.by, {}).get(e.by)!, e.amount, c);
  }
  const say = (id: string) => names.get(id) ?? "Someone";
  const shares: Sums = {};
  const pays: Owes["pays"] = [];
  for (const c of Object.keys(sums).sort((a, b) => (a === mine ? -1 : b === mine ? 1 : a < b ? -1 : 1))) {
    const share = sums[c] / crew.length;
    shares[c] = Math.round(share * 100) / 100;
    const left = crew.map((id) => ({ id, v: (paid.get(id)?.[c] ?? 0) - share }));
    // The largest first, and by name when two are the same, so the same trip always reads the same.
    const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
    const owe = left.filter((x) => x.v < -0.005).sort((a, b) => (near(a.v, b.v) ? say(a.id).localeCompare(say(b.id)) : a.v - b.v));
    const get = left.filter((x) => x.v > 0.005).sort((a, b) => (near(a.v, b.v) ? say(a.id).localeCompare(say(b.id)) : b.v - a.v));
    for (let i = 0, j = 0; i < owe.length && j < get.length; ) {
      const x = Math.min(-owe[i].v, get[j].v);
      if (x >= 0.01) pays.push({ from: say(owe[i].id), to: say(get[j].id), amount: money(Math.round(x * 100) / 100, c) });
      owe[i].v += x;
      get[j].v -= x;
      if (owe[i].v > -0.005) i++;
      if (get[j].v < 0.005) j++;
    }
  }
  return { n: crew.length, each: total(shares, mine), pays };
}

/** The names for some expenses, and for anyone else asked about: the one each person was last heard under, else the one kept with their expenses. */
async function namesOf(kit: Kit, items: { data: Expense }[], others: string[] = []): Promise<Names> {
  const names: Names = new Map();
  for (const id of others) names.set(id, null);
  for (const { data: e } of items) if (e.name || !names.has(e.by)) names.set(e.by, e.name ?? names.get(e.by) ?? null);
  for (const by of names.keys()) {
    const heard = (await kit.store.get<{ name: string }>("people", by))?.name;
    if (heard) names.set(by, heard);
  }
  return names;
}

/** A trip as a list: its newest expenses, the sum, and what each person sent when several did. */
function shown(kit: Kit, trip: Trip, items: { data: Expense }[], names: Names): Shown {
  const mine = of(kit, trip);
  const sums: Sums = {};
  const by = new Map<string, { name: string | null; sums: Sums }>();
  for (const { data: e } of items) {
    const c = e.currency ?? mine;
    add(sums, e.amount, c);
    const p = by.get(e.by) ?? { name: names.get(e.by) ?? null, sums: {} };
    add(p.sums, e.amount, c);
    by.set(e.by, p);
  }
  const several = by.size > 1;
  const from = Math.max(0, items.length - LISTED);
  const rows: Row[] = items.slice(from).map(({ data: e }) => ({ what: e.what, amount: money(e.amount, e.currency ?? mine), who: several ? (by.get(e.by)?.name ?? null) : null, tags: e.tags ?? [], bill: !!e.bill, mark: e.mark ?? null }));
  const people = several ? [...by.values()].map((p) => `${p.name ?? "Someone"} ${total(p.sums, mine)}`) : [];
  return { title: titleOf(trip), days: daysOf(kit, trip), count: items.length, total: total(sums, mine), rows, from: from + 1, people, labels: labelSums(items, mine), marks: markSums(items, mine).map((m) => `${m.mark} ${m.total}`), owes: owesOf(trip, items, mine, names) };
}

/** The person who added the app said which currency they count in: Zelfred keeps it if it knew nothing. */
async function learn(kit: Kit, sender: Sender, currency: string): Promise<void> {
  if (sender.owner && !kit.person.currency) await kit.learn({ currency });
}

/** A trip's currency is settled: record it and take the question about it away. */
async function settle(kit: Kit, f: Found, currency: string, sender: Sender): Promise<void> {
  if (f.trip.asked) kit.close(currencyRef(f.id, f.trip.asked) as unknown as Json);
  f.trip = { ...f.trip, currency, asked: null };
  await save(kit, f);
  await learn(kit, sender, currency);
}

/** Ask what a new trip is counted in: the person's own currency first, then the usual ones. */
async function askCurrency(kit: Kit, f: Found, first: boolean): Promise<void> {
  const mine = own(kit);
  const codes = [mine, ...COMMON.filter((c) => c !== mine)];
  f.trip = { ...f.trip, asked: codes };
  await save(kit, f);
  // No confirm line of Zelfred's: onAnswer says it, the same whoever is in the group.
  kit.ask(copy.whichCurrency({ first }), codes.map(label), { ref: currencyRef(f.id, codes) as unknown as Json, confirm: false });
}

const senderOf = (event: { sender?: Sender }, kit: Kit): Sender => event.sender ?? { id: kit.person.id ?? "owner", name: kit.person.name, owner: true };

/** Something was understood: the next message with no amount is told how again. */
const heard = (kit: Kit, here: Here) => kit.store.delete("state", sk(here, "prompted"));

async function keep(kit: Kit, here: Here, reads: Kept[], bad: string[], sender: Sender, bill: string | null = null): Promise<boolean> {
  const f = (await openTrip(kit, here)) ?? (await startTrip(kit, here));
  const have = (await expensesOf(kit, f.id)).length;
  if (have + reads.length > MAX_EXPENSES) {
    kit.send(copy.full({ max: MAX_EXPENSES }));
    return false;
  }
  const name = sender.name ?? (sender.owner ? kit.person.name : null);
  const ids = reads.map(() => kit.id());
  const seq = f.trip.seq ?? 0;
  for (const [i, r] of reads.entries()) {
    // A bill sent with several lines is the first one's.
    const expense: Expense = { what: r.what, amount: r.amount, currency: r.currency, by: sender.id, name, at: kit.now, ...(r.tags.length ? { tags: r.tags } : {}), ...(bill && i === 0 ? { bill } : {}) };
    await kit.store.put("expenses", `${f.id}:${ids[i]}`, expense as unknown as Json, seq + i + 1);
  }
  // Saved before anything below reads the trip again.
  f.trip = { ...f.trip, seq: seq + reads.length };
  await save(kit, f);
  kit.mark({ kind: "expense", trip: f.id, ids } as unknown as Json);
  await heard(kit, here);

  // A trip with no currency yet takes it from the first expense that names one.
  const named = reads.find((r) => r.currency)?.currency ?? null;
  const unsettled = f.trip.currency === null;
  if (unsettled && named) await settle(kit, f, named, sender);

  const taught = await kit.store.get("state", sk(here, "taught"));
  const ask = unsettled && !named && have === 0 && !f.trip.asked;
  // The first bill kept here, once the group knows what a 👍 means: say how bills work.
  const billNews = !!bill && !!taught && !(await kit.store.get("state", sk(here, "taughtBill")));
  if (bill) await kit.store.put("state", sk(here, "taughtBill"), 1);
  if (!taught) {
    // The first expense ever sent here: say once what happens in this group.
    await kit.store.put("state", sk(here, "taught"), 1);
    const kept = reads.map((r) => `${r.what}, ${r.currency ? money(r.amount, r.currency) : f.trip.currency ? money(r.amount, f.trip.currency) : r.amount}`);
    kit.send(copy.firstKept({ kept, currency: f.trip.currency ? sign(f.trip.currency) : null }));
    if (ask) await askCurrency(kit, f, true);
  } else if (ask) {
    await askCurrency(kit, f, f.trip.n === 1);
  } else if (billNews) {
    kit.send(copy.firstBill({ what: reads[0].what }));
  } else if (!bad.length) {
    kit.react(SAVED);
  }
  if (bad.length) kit.send(copy.someNotKept({ kept: reads.length, lines: bad }));
  return true;
}

/** Close the open trip of a group. Returns it as a list, or null when there was nothing in it to close. */
async function close(kit: Kit, here: Here): Promise<Shown | null> {
  const f = await openTrip(kit, here);
  const items = f ? await expensesOf(kit, f.id) : [];
  if (!f || !items.length) return null;
  if (f.trip.asked) kit.close(currencyRef(f.id, f.trip.asked) as unknown as Json);
  const mine = of(kit, f.trip);
  const sums: Sums = {};
  for (const { data: e } of items) add(sums, e.amount, e.currency ?? mine);
  // The currency it was counted in is fixed with it, so the sums stay true whatever is learnt later.
  const used = { labels: [...new Set(items.flatMap((i) => i.data.tags ?? []))], marks: [...new Set(items.flatMap((i) => (i.data.mark ? [i.data.mark] : [])))] };
  f.trip = { ...f.trip, currency: mine, asked: null, endedAt: kit.now, count: items.length, sums, used };
  await save(kit, f);
  await kit.store.delete("state", sk(here, "open"));
  return shown(kit, f.trip, items, await namesOf(kit, items, f.trip.crew));
}

async function end(kit: Kit, here: Here): Promise<void> {
  const closed = await close(kit, here);
  kit.send(closed ? copy.ended(closed) : copy.nothingToEnd());
}

/** What a new description or group name makes of a trip's name: its first line, plainly. */
function nameFrom(value: string): string | null {
  const line = value.split("\n").map((l) => l.replace(/[*_~`]/g, "").replace(/\s+/g, " ").trim()).find(Boolean) ?? "";
  return line.slice(0, MAX_NAME).trim() || null;
}

/** The group got a new description or name: what was open is closed, and a trip with that name starts. */
async function renamed(kit: Kit, here: Here, value: string): Promise<void> {
  const name = nameFrom(value);
  const closed = await close(kit, here);
  const open = await openTrip(kit, here);
  // An open trip with nothing in it yet (two changes in a row, or a name before any expense) takes the name.
  if (open) {
    if (open.trip.asked) kit.close(currencyRef(open.id, open.trip.asked) as unknown as Json);
    open.trip = { ...open.trip, name, asked: null };
    await save(kit, open);
  }
  const f = open ?? (await startTrip(kit, here, name));
  await heard(kit, here);
  kit.send(copy.newTrip({ title: titleOf(f.trip), closed }));
}

async function showTotal(kit: Kit, here: Here): Promise<void> {
  const f = await openTrip(kit, here);
  const items = f ? await expensesOf(kit, f.id) : [];
  if (!f || !items.length) {
    kit.send(copy.nothingYet());
    return;
  }
  kit.send(copy.total(shown(kit, f.trip, items, await namesOf(kit, items, f.trip.crew))));
}

/** Who owes whom on the open trip, when everyone on it shares its cost equally. */
async function showSplit(kit: Kit, here: Here): Promise<void> {
  const f = await openTrip(kit, here);
  const items = f ? await expensesOf(kit, f.id) : [];
  if (!f || !items.length) return void kit.send(copy.nothingYet());
  const owes = owesOf(f.trip, items, of(kit, f.trip), await namesOf(kit, items, f.trip.crew));
  kit.send(owes ? copy.split({ title: titleOf(f.trip), owes }) : copy.splitAlone());
}

async function showTrips(kit: Kit, here: Here): Promise<void> {
  const all = (await kit.store.list<Trip>("trips")).filter((t) => (t.data.home ?? null) === here).reverse();
  const rows: { title: string; days: string; count: number; total: string; open: boolean }[] = [];
  for (const t of all) {
    if (rows.length >= TRIPS_SHOWN) break;
    if (t.data.endedAt !== null) {
      rows.push({ title: titleOf(t.data), days: daysOf(kit, t.data), count: t.data.count ?? 0, total: total(t.data.sums ?? {}, of(kit, t.data)), open: false });
      continue;
    }
    const items = await expensesOf(kit, t.key);
    if (!items.length) continue;
    const s = shown(kit, t.data, items, await namesOf(kit, items, t.data.crew));
    rows.push({ title: s.title, days: s.days, count: s.count, total: s.total, open: true });
  }
  kit.send(rows.length ? copy.trips({ trips: rows }) : copy.noTrips());
}

async function undo(kit: Kit, here: Here, sender: Sender): Promise<void> {
  const f = await openTrip(kit, here);
  const last = f ? (await expensesOf(kit, f.id)).filter((e) => e.data.by === sender.id).pop() : undefined;
  if (!f || !last) {
    kit.send(copy.nothingToUndo());
    return;
  }
  await drop(kit, last.key, last.data);
  kit.send(copy.removed({ what: last.data.what, amount: money(last.data.amount, last.data.currency ?? of(kit, f.trip)) }));
}

/** A reply to an expense: remove it, or put it right. */
async function onReply(kit: Kit, here: Here, ref: ExpenseRef, text: string, lower: string, photo: Photo | null, sender: Sender, tagged: Sender[]): Promise<void> {
  const trip = await kit.store.get<Trip>("trips", ref.trip);
  const rows: { key: string; data: Expense }[] = [];
  for (const id of ref.ids) {
    const data = await kit.store.get<Expense>("expenses", `${ref.trip}:${id}`);
    if (data) rows.push({ key: `${ref.trip}:${id}`, data });
  }
  if (!trip || !rows.length) {
    if (photo) await kit.files.remove(photo.id);
    kit.send(copy.gone());
    return;
  }
  // Its bill, asked for. A closed trip's too: looking changes nothing.
  if (!photo && /^(bill|receipt|show (the )?(bill|receipt)|the bill)\??$/.test(lower)) {
    const withBill = rows.find((r) => r.data.bill);
    if (!withBill) kit.send(copy.noBill());
    else kit.send(copy.billOf({ what: withBill.data.what, amount: money(withBill.data.amount, withBill.data.currency ?? of(kit, trip)) }), { photo: withBill.data.bill! });
    return;
  }
  // A photo in reply to an expense is its bill. A bill and labels may be added after the trip closed: the sum stays as it was.
  if (photo) {
    if (rows.length > 1) {
      await kit.files.remove(photo.id);
      kit.send(copy.billWhich());
      return;
    }
    if (rows[0].data.bill) await kit.files.remove(rows[0].data.bill);
    const { tags } = takeTags(text);
    const merged = [...new Set([...(rows[0].data.tags ?? []), ...tags])].slice(0, MAX_TAGS);
    await kit.store.put("expenses", rows[0].key, { ...rows[0].data, bill: photo.id, ...(merged.length ? { tags: merged } : {}) } as unknown as Json);
    const news = !(await kit.store.get("state", sk(here, "taughtBill")));
    await kit.store.put("state", sk(here, "taughtBill"), 1);
    if (news) kit.send(copy.firstBill({ what: rows[0].data.what }));
    else kit.react(SAVED);
    return;
  }
  // Whose it is. A reply that tags someone gives it to them, and "me" or "mine" takes it. Anyone in the group may, for
  // anyone's expense. A closed trip takes it too: the sum stays as it was. A tag beside an amount is a correction, below.
  if ((tagged.length && !/\d/.test(text)) || (!tagged.length && MINE.test(lower))) {
    if (tagged.length > 1) {
      kit.send(copy.whoOne());
      return;
    }
    const to = tagged[0] ?? sender;
    const name = to.name ?? (to.owner ? kit.person.name : null) ?? (await kit.store.get<{ name: string }>("people", to.id))?.name ?? null;
    for (const r of rows) await kit.store.put("expenses", r.key, { ...r.data, by: to.id, name: name ?? (r.data.by === to.id ? r.data.name : null) } as unknown as Json);
    const news = !(await kit.store.get("state", sk(here, "taughtWho")));
    await kit.store.put("state", sk(here, "taughtWho"), 1);
    if (news) kit.send(copy.firstWho({ what: rows.map((r) => r.data.what).join(", "), who: name }));
    else kit.react(SAVED);
    return;
  }
  // Labels on their own: "#food #client".
  const onlyTags = takeTags(text);
  if (onlyTags.tags.length && !onlyTags.rest) {
    for (const r of rows) {
      const merged = [...new Set([...(r.data.tags ?? []), ...onlyTags.tags])].slice(0, MAX_TAGS);
      await kit.store.put("expenses", r.key, { ...r.data, tags: merged } as unknown as Json);
    }
    kit.react(SAVED);
    return;
  }
  if (trip.endedAt !== null) {
    kit.send(copy.closed());
    return;
  }
  if (/^(delete|remove|undo|cancel|forget)( (it|this|that|these|them))?$/.test(lower)) {
    for (const r of rows) await drop(kit, r.key, r.data);
    kit.react(SAVED);
    return;
  }
  const amount = readAmount(text);
  const whole = amount ? null : text.includes("\n") ? null : readExpense(text);
  if (!amount && !whole) {
    kit.send(copy.replyHow());
    return;
  }
  if (rows.length > 1) {
    kit.send(copy.several());
    return;
  }
  const next: Expense = amount ? { ...rows[0].data, amount: amount.amount, currency: amount.currency ?? rows[0].data.currency } : { ...rows[0].data, what: whole!.what, amount: whole!.amount, currency: whole!.currency ?? rows[0].data.currency };
  await kit.store.put("expenses", rows[0].key, next as unknown as Json);
  kit.react(SAVED);
}

/** The ready-made messages. True when the text was one. */
async function command(kit: Kit, here: Here, text: string, lower: string, sender: Sender): Promise<boolean> {
  if (/^(end( it| now)?|(end|close|finish|stop) (it|(the |this )?(trip|list))|(trip|list) (is )?(over|ended|done|finished))$/.test(lower)) {
    await end(kit, here);
    return true;
  }
  if (/^(total|sum|list|show|expenses|summary|how much|so far|total so far|show (the )?(total|list|expenses))\??$/.test(lower)) {
    await showTotal(kit, here);
    return true;
  }
  if (/^(split|split it|settle|settle up|tally|who owes( whom| who| what)?|who pays( whom| who| what)?|who owes how much)\??$/.test(lower)) {
    await showSplit(kit, here);
    return true;
  }
  if (/^(trips|my trips|all trips|past trips|old trips|history)$/.test(lower)) {
    await showTrips(kit, here);
    return true;
  }
  if (/^(undo|delete last|remove last|remove the last one|delete the last one)$/.test(lower)) {
    await undo(kit, here, sender);
    return true;
  }
  let m = lower.match(/^currency(?:\s+(?:is\s+|to\s+|in\s+)?(.+))?$/);
  if (m) {
    const f = (await openTrip(kit, here)) ?? (m[1] ? await startTrip(kit, here) : null);
    if (!m[1]) {
      kit.send(copy.countingNow({ currency: sign(f ? of(kit, f.trip) : own(kit)) }));
      return true;
    }
    const currency = currencyOf(m[1]) ?? (/^[a-z]{3}$/.test(m[1]) ? m[1].toUpperCase() : null);
    if (!currency || !f) kit.send(copy.currencyUnknown());
    else {
      await settle(kit, f, currency, sender);
      kit.send(copy.counting({ currency: sign(currency) }));
    }
    return true;
  }
  m = text.match(/^(?:name|rename|call)(?:\s+(?:it|this|this trip|the trip|trip))?(?:\s+(?:to|as))?\s+(.+)$/i);
  if (m) {
    const name = m[1].replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
    // A name that ends in an amount is an expense about a name ("name board 300").
    if (name && !readExpense(text)) {
      const f = (await openTrip(kit, here)) ?? (await startTrip(kit, here));
      f.trip = { ...f.trip, name };
      await save(kit, f);
      kit.react(SAVED);
      return true;
    }
  }
  return false;
}

// ── The page ──

/** One expense as the page shows it. */
interface PageRow {
  id: string;
  n: number;
  what: string;
  /** "₹450". */
  amount: string;
  who: string | null;
  at: number;
  /** The day it was paid, "YYYY-MM-DD": set on the page, else the day it was sent. */
  day: string;
  tags: string[];
  /** The id of its bill's photo, or null. */
  bill: string | null;
  /** The emoji it was reacted to with, or null. */
  mark: string | null;
  /** Who spent it: the key of that person in `dash.people`. */
  by: string;
  /** Its amount as a number, when it is in the trip's own currency. Null in any other: it can't be added to the rest. */
  value: number | null;
}
/** One part of a trip, for a bar on the page: a day, an emoji's group, a label or a person. */
interface Part {
  /** The day ("2026-11-24"), the emoji, the label or the person's id. */
  key: string;
  /** How it is said: "24 Nov", "🍕", "food", "Asha". */
  name: string;
  /** Everything in it, each currency on its own: "₹450 + $20". */
  total: string;
  /** What it adds up to in the trip's own currency: the length of its bar. */
  value: number;
  count: number;
}
/** A trip's numbers for the page's graphs. Bars are in the trip's own currency; `outside` says what that leaves out. */
interface Dash {
  /** The days something was paid on, oldest first. */
  days: Part[];
  /** Biggest first, as are the next two. */
  marks: Part[];
  labels: Part[];
  people: Part[];
  /** The sum in the trip's own currency, over the days from its first expense to its last: "₹1,200". */
  perDay: string;
  /** How many days that is. */
  span: number;
  /** The largest single expense in the trip's own currency. */
  top: { what: string; amount: string } | null;
  /** What was paid in other currencies, when anything was: "$20". */
  outside: string | null;
  /** Who owes whom when the trip is shared equally. Null with fewer than two people on it. */
  owes: Owes | null;
}
/** A trip as the page shows it. `rows` only for the open trip and for the one asked for. */
interface PageTrip {
  id: string;
  title: string;
  days: string;
  count: number;
  /** "₹24,990 + $20". */
  total: string;
  /** The sign of what plain amounts are counted in. */
  currency: string;
  /** What each person sent, when more than one did: "Asha ₹450". */
  people: string[];
  /** What each label adds up to: "food ₹450". Only with `rows`. */
  labels: string[];
  /** What each emoji's group adds up to, biggest first. Only with `rows`. */
  marks: { mark: string; total: string; count: number }[];
  open: boolean;
  rows?: PageRow[];
  /** Only with `rows`. */
  dash?: Dash;
}

/** A trip's expenses cut one way: by day, emoji, label or person. An expense with two labels is in both. */
function parts(items: { data: Expense }[], mine: string, keys: (e: Expense) => { key: string; name: string }[]): Part[] {
  const by = new Map<string, { name: string; sums: Sums; count: number }>();
  for (const { data: e } of items)
    for (const k of keys(e)) {
      const g = by.get(k.key) ?? by.set(k.key, { name: k.name, sums: {}, count: 0 }).get(k.key)!;
      add(g.sums, e.amount, e.currency ?? mine);
      g.count++;
    }
  return [...by].map(([key, g]) => ({ key, name: g.name, total: total(g.sums, mine), value: g.sums[mine] ?? 0, count: g.count })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

function dashOf(kit: Kit, trip: Trip, items: { data: Expense }[], mine: string, names: Names): Dash {
  const dayOf = (e: Expense) => e.day ?? kit.time.day(e.at);
  const days = parts(items, mine, (e) => [{ key: dayOf(e), name: sayDay(dayOf(e)) }]).sort((a, b) => (a.key < b.key ? -1 : 1));
  const span = days.length ? Math.round((Date.parse(`${days[days.length - 1].key}T00:00:00Z`) - Date.parse(`${days[0].key}T00:00:00Z`)) / 86_400_000) + 1 : 0;
  const sums: Sums = {};
  let top: Expense | null = null;
  for (const { data: e } of items) {
    add(sums, e.amount, e.currency ?? mine);
    if ((e.currency ?? mine) === mine && (!top || e.amount > top.amount)) top = e;
  }
  const { [mine]: own = 0, ...rest } = sums;
  return {
    days,
    marks: parts(items, mine, (e) => (e.mark ? [{ key: e.mark, name: e.mark }] : [])),
    labels: parts(items, mine, (e) => (e.tags ?? []).map((t) => ({ key: t, name: t }))),
    people: parts(items, mine, (e) => [{ key: e.by, name: names.get(e.by) ?? "Someone" }]),
    perDay: money(span ? Math.round(own / span) : 0, mine),
    span,
    top: top ? { what: top.what, amount: money(top.amount, mine) } : null,
    outside: Object.keys(rest).length ? total(rest, "") : null,
    owes: owesOf(trip, items, mine, names),
  };
}

async function pageTrip(kit: Kit, id: string, trip: Trip, withRows: boolean): Promise<PageTrip | null> {
  const open = trip.endedAt === null;
  const mine = of(kit, trip);
  if (!open && !withRows) {
    return { id, title: titleOf(trip), days: daysOf(kit, trip), count: trip.count ?? 0, total: total(trip.sums ?? {}, mine), currency: sign(mine), people: [], labels: [], marks: [], open };
  }
  const items = await expensesOf(kit, id);
  // An open trip nobody has sent anything to yet (it was only named) is not a trip to show.
  if (open && !items.length) return null;
  const names = await namesOf(kit, items, trip.crew);
  const s = shown(kit, trip, items, names);
  const rows: PageRow[] = items.map(({ key, data: e }, i) => ({ id: key.slice(id.length + 1), n: i + 1, what: e.what, amount: money(e.amount, e.currency ?? mine), who: new Set(items.map((i) => i.data.by)).size > 1 ? (names.get(e.by) ?? null) : null, at: e.at, day: e.day ?? kit.time.day(e.at), tags: e.tags ?? [], bill: e.bill ?? null, mark: e.mark ?? null, by: e.by, value: (e.currency ?? mine) === mine ? e.amount : null }));
  return { id, title: s.title, days: s.days, count: s.count, total: s.total, currency: sign(mine), people: s.people, labels: s.labels ?? [], marks: markSums(items, mine), open, ...(withRows || open ? { rows, dash: dashOf(kit, trip, items, mine, names) } : {}) };
}

/** The expense a page action is about. Throws a plain sentence when it isn't kept any more. */
async function pageExpense(kit: Kit, trip: Json | undefined, id: Json | undefined): Promise<{ key: string; e: Expense }> {
  const key = `${String(trip)}:${String(id)}`;
  const e = await kit.store.get<Expense>("expenses", key);
  if (!e) throw new Error("That expense isn't kept any more.");
  return { key, e };
}

/**
 * What the page shows: every group this app runs in, each with its open trip (and its
 * expenses) and the trips that ended, newest first. `args.trip`: also that trip in full.
 */
async function page(kit: Kit, args: Record<string, Json>): Promise<Json> {
  const all = (await kit.store.list<Trip>("trips")).reverse();
  const homes = await kit.store.list<{ name: string }>("homes");
  const places: { key: Here; name: string | null }[] = [{ key: null, name: null }, ...homes.map((h) => ({ key: h.key as Here, name: h.data.name }))];
  const groups = [];
  for (const p of places) {
    const here = all.filter((t) => (t.data.home ?? null) === p.key);
    let open: PageTrip | null = null;
    const past: PageTrip[] = [];
    for (const t of here) {
      if (t.data.endedAt === null) open = open ?? (await pageTrip(kit, t.key, t.data, true));
      else if (past.length < PAGE_TRIPS) past.push((await pageTrip(kit, t.key, t.data, false))!);
    }
    if (p.key === null || open || past.length) groups.push({ key: p.key, name: p.name, open, past });
  }
  const want = typeof args.trip === "string" ? args.trip : null;
  const asked = want ? await kit.store.get<Trip>("trips", want) : null;
  // The labels and emoji used so far, the most used first: what the page offers when one is being set.
  const uses = { labels: new Map<string, number>(), marks: new Map<string, number>() };
  const used = (m: Map<string, number>, key: string, n: number) => m.set(key, (m.get(key) ?? 0) + n);
  for (const g of groups) {
    for (const part of g.open?.dash?.labels ?? []) used(uses.labels, part.key, part.count);
    for (const part of g.open?.dash?.marks ?? []) used(uses.marks, part.key, part.count);
  }
  for (const t of all) {
    for (const l of t.data.used?.labels ?? []) used(uses.labels, l, 1);
    for (const m of t.data.used?.marks ?? []) used(uses.marks, m, 1);
  }
  const most = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([key]) => key).slice(0, 60);
  return { groups, trip: want && asked ? await pageTrip(kit, want, asked, true) : null, known: { labels: most(uses.labels), marks: most(uses.marks) } } as unknown as Json;
}

export default definePlugin({
  id: "expense-tracker",
  version: "1.6.0",
  sdk: "1",
  name: "TripExpenses",
  icon: "🧾",
  tagline: "Trip expenses, added up. Send what you paid and the amount.",
  description:
    "For a trip, a weekend or anything you pay for along the way. Send each expense to its WhatsApp group as what it was and the amount, like \"lunch 450\". It is added up, and so is what your friends send once you add them to the group. Say \"end trip\" and you get the list and the total, and the next expense starts a new one.",
  groupName: copy.groupName(),
  price: 0,
  // Tier 1: a little text per expense, and it only answers when written to.
  tier: 1,
  // "members": friends on the trip send their expenses too. "groups": it takes a group they already have.
  // "photos": a photo of the bill is kept with its expense. Any other photo sent in the group is deleted at once.
  permissions: ["members", "groups", "photos"],
  listing: {
    title: "Trip Expense Tracker: Added Up as You Go | Zelfred",
    description: "Tell me what you paid and the amount, like \"lunch 450\". Your trip's expenses are added up as you go, with what each friend sent. Nothing to install.",
    h1: "Trip expenses, added up as you go",
  },
  welcome: copy.welcome(),
  help: copy.help(),

  web: {
    // What a person spent is their own business: the page can sit behind the PIN.
    lockable: true,
    load: page,
    actions: {
      /** Take one expense out of the open trip. The page asks "are you sure" before calling this. */
      async remove(kit, { trip, id }) {
        const t = await kit.store.get<Trip>("trips", String(trip));
        if (!t) throw new Error("That trip isn't kept any more.");
        if (t.endedAt !== null) throw new Error("That trip is closed, so it stays as it is.");
        const key = `${String(trip)}:${String(id)}`;
        const e = await kit.store.get<Expense>("expenses", key);
        if (!e) throw new Error("That one is already removed.");
        await drop(kit, key, e);
      },
      /** The day an expense was paid. Allowed after the trip closed: the sum stays as it was. */
      async setDay(kit, { trip, id, day }) {
        const { key, e } = await pageExpense(kit, trip, id);
        if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`)) || new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) throw new Error("Pick a date.");
        if (day > kit.time.shiftDay(kit.time.day(kit.now), 1)) throw new Error("That date hasn't come yet.");
        await kit.store.put("expenses", key, { ...e, day } as unknown as Json);
      },
      /** Who spent an expense: one of the people who already have an expense in its trip. Allowed after the trip closed: the sum stays as it was. */
      async setBy(kit, { trip, id, by }) {
        const { key, e } = await pageExpense(kit, trip, id);
        const theirs = (await expensesOf(kit, String(trip))).filter((x) => x.data.by === by);
        if (typeof by !== "string" || !theirs.length) throw new Error("Pick someone who is on this trip.");
        await kit.store.put("expenses", key, { ...e, by, name: (await namesOf(kit, theirs)).get(by) ?? null } as unknown as Json);
      },
      /** The emoji an expense is grouped under, or (`mark: null`) none. */
      async setMark(kit, { trip, id, mark }) {
        const { key, e } = await pageExpense(kit, trip, id);
        if (!(mark === null || (typeof mark === "string" && mark.trim() && [...mark.trim()].length <= 8 && !/[\p{L}\p{N}\s]/u.test(mark.trim())))) throw new Error("Pick one emoji.");
        await kit.store.put("expenses", key, { ...e, mark: mark === null ? null : mark.trim() } as unknown as Json);
      },
      /** An expense's labels, all of them at once. */
      async setTags(kit, { trip, id, tags }) {
        const { key, e } = await pageExpense(kit, trip, id);
        if (!Array.isArray(tags)) throw new Error("Labels are a list of words.");
        const clean = [...new Set(tags.map((t) => (typeof t === "string" ? cleanTag(t) : null)).filter((t): t is string => !!t))];
        if (clean.length > MAX_TAGS) throw new Error(`An expense takes ${MAX_TAGS} labels at most.`);
        await kit.store.put("expenses", key, { ...e, tags: clean } as unknown as Json);
      },
      /** Keep a photo the page added as an expense's bill, or (`photo: null`) take the bill away. The page asks first before taking one away. */
      async setBill(kit, { trip, id, photo }) {
        const { key, e } = await pageExpense(kit, trip, id);
        if (photo !== null && !(typeof photo === "string" && (await kit.files.get(photo)))) throw new Error("That photo didn't arrive. Try again.");
        if (e.bill && e.bill !== photo) await kit.files.remove(e.bill);
        await kit.store.put("expenses", key, { ...e, bill: photo } as unknown as Json);
      },
    },
  },

  async onGroup(event, kit) {
    const here = event.key;
    if (event.kind === "left") {
      // Zelfred has stopped listening there. What was open is closed, so `trips` stays true; nothing is said.
      await close(kit, here);
      for (const key of STATE) await kit.store.delete("state", sk(here, key));
      await kit.store.delete("homes", here);
      return;
    }
    await kit.store.put("homes", here, { name: event.name.replace(/\s+/g, " ").trim().slice(0, 100) }, kit.now);
    // Other people are in it already and they talk: the note about the format was just given.
    await kit.store.put("state", sk(here, "shared"), 1);
    await kit.store.put("state", sk(here, "prompted"), 1);
    kit.send(copy.joinedGroup());
  },

  async onGroupInfo(event, kit) {
    await renamed(kit, event.group ?? null, event.value);
  },

  async onMessage(event, kit) {
    const text = event.text.trim();
    // WhatsApp sends each photo as its own message, so there is at most one here.
    const photo = event.photos?.[0] ?? null;
    for (const extra of event.photos?.slice(1) ?? []) await kit.files.remove(extra.id);
    const tagged = event.mentions ?? [];
    if (event.sender) await know(kit, event.sender);
    for (const person of tagged) await know(kit, person);
    if (!text && !photo && !tagged.length) return;
    const lower = text.toLowerCase().replace(/\s+/g, " ").replace(/[!.]+$/, "");
    const sender = senderOf(event, kit);
    const here: Here = event.group ?? null;
    // Everyone who writes here, or is tagged, is on the trip that is open: its cost is shared by them too.
    await join(kit, here, [sender, ...tagged]);
    if (!sender.owner && !(await kit.store.get("state", sk(here, "shared")))) await kit.store.put("state", sk(here, "shared"), 1);

    if (isExpenseRef(event.quotedRef)) {
      await heard(kit, here);
      return onReply(kit, here, event.quotedRef, text, lower, photo, sender, tagged);
    }
    // Someone tagged with no words, and not in reply to an expense: talk between friends.
    if (!text && !photo) return;
    // A photo with no words that answers nothing: people share trip photos in such a group. Not kept, and nothing is said.
    if (photo && !text) return void (await kit.files.remove(photo.id));
    if (!photo && (await command(kit, here, text.replace(/\s+/g, " "), lower, sender))) {
      await heard(kit, here);
      return;
    }

    // A currency on its own, while the trip is asking which one: that is the answer.
    const f = await openTrip(kit, here);
    const typed = f?.trip.asked ? currencyOf(lower) : null;
    if (f && typed) {
      if (photo) await kit.files.remove(photo.id);
      await settle(kit, f, typed, sender);
      await heard(kit, here);
      kit.send(copy.counting({ currency: sign(typed) }));
      return;
    }

    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, MAX_LINES);
    const reads: Kept[] = [];
    const bad: string[] = [];
    for (const line of lines) {
      const { rest, tags } = takeTags(line);
      const r = readExpense(rest);
      if (r) reads.push({ ...r, tags });
      else bad.push(line.slice(0, 80));
    }
    if (reads.length) {
      // A photo with an expense as its caption is that expense's bill.
      const kept = await keep(kit, here, reads, bad, sender, photo?.id ?? null);
      if (!kept && photo) await kit.files.remove(photo.id);
      return;
    }
    // A photo whose caption is no expense: a photo with a few words, as people send. Not kept, nothing said.
    if (photo) return void (await kit.files.remove(photo.id));

    // No amount: say how, once. In a group with friends in it, people also just talk, so one
    // telling is enough until something is kept or asked for.
    if ((await kit.store.get("state", sk(here, "shared"))) && (await kit.store.get("state", sk(here, "prompted")))) return;
    await kit.store.put("state", sk(here, "prompted"), 1);
    kit.unsure(copy.format());
  },

  /**
   * A reaction on an expense someone sent: any emoji but a plain "seen" one puts the expense in
   * that emoji's group, to add up and to group by on the page. Anyone in the group may, and the
   * last one counts. Taking a reaction away clears the group. A closed trip takes it too: its
   * sum stays as it was.
   */
  async onReaction(event, kit) {
    if (event.sender) {
      await know(kit, event.sender);
      await join(kit, event.group ?? null, [event.sender]);
    }
    if (!isExpenseRef(event.ref)) return;
    if (event.emoji && PLAIN.has(bare(event.emoji))) return;
    const mark = event.emoji ? [...event.emoji].slice(0, 8).join("") : null;
    for (const id of event.ref.ids) {
      const key = `${event.ref.trip}:${id}`;
      const e = await kit.store.get<Expense>("expenses", key);
      if (e && (e.mark ?? null) !== mark) await kit.store.put("expenses", key, { ...e, mark } as unknown as Json);
    }
  },

  async onAnswer(event, kit) {
    if (event.sender) await know(kit, event.sender);
    if (!isCurrencyRef(event.ref)) return;
    const currency = event.ref.codes[event.choice];
    const trip = await kit.store.get<Trip>("trips", event.ref.trip);
    // Settled already, or the trip has ended: the question is over either way.
    kit.close(event.ref as unknown as Json);
    if (!currency || !trip || trip.endedAt !== null || !trip.asked) return;
    const sender = senderOf(event, kit);
    await settle(kit, { id: event.ref.trip, trip: { ...trip, asked: null } }, currency, sender);
    kit.send(copy.counting({ currency: sign(currency) }));
  },
});
