import { definePlugin, type Json, type Kit, type Sender } from "../../sdk";
import { copy, SAVED, type Row, type Shown } from "./copy";
import { add, COMMON, currencyOf, guessCurrency, label, money, readAmount, readExpense, sayDay, sign, total, type Read, type Sums } from "./money";

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
 *   state, one set per group: the key as below in the app's own group, "<key>@<group>" elsewhere
 *   state     key: "open"                 data: { trip }  the trip expenses go to now
 *   state     key: "n"                    data: number    how many trips were started
 *   state     key: "taught"               data: 1 once the first-expense note was sent
 *   state     key: "shared"               data: 1 once someone other than the owner wrote here
 *   state     key: "prompted"             data: 1 after "I need an amount", until something is kept
 */

/** The group something happens in: its key, or null for the app's own group. */
type Here = string | null;
const STATE = ["open", "n", "taught", "shared", "prompted"] as const;
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
}

export interface Expense {
  what: string;
  amount: number;
  /** Null: the trip's currency. */
  currency: string | null;
  /** The sender's id and their name when it was sent. */
  by: string;
  name: string | null;
  at: number;
}

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

/** A trip as a list: its newest expenses, the sum, and what each person sent when several did. */
function shown(kit: Kit, trip: Trip, items: { data: Expense }[]): Shown {
  const mine = of(kit, trip);
  const sums: Sums = {};
  const by = new Map<string, { name: string | null; sums: Sums }>();
  for (const { data: e } of items) {
    const c = e.currency ?? mine;
    add(sums, e.amount, c);
    const p = by.get(e.by) ?? { name: e.name, sums: {} };
    add(p.sums, e.amount, c);
    if (e.name) p.name = e.name;
    by.set(e.by, p);
  }
  const several = by.size > 1;
  const from = Math.max(0, items.length - LISTED);
  const rows: Row[] = items.slice(from).map(({ data: e }) => ({ what: e.what, amount: money(e.amount, e.currency ?? mine), who: several ? (by.get(e.by)?.name ?? null) : null }));
  const people = several ? [...by.values()].map((p) => `${p.name ?? "Someone"} ${total(p.sums, mine)}`) : [];
  return { title: titleOf(trip), days: daysOf(kit, trip), count: items.length, total: total(sums, mine), rows, from: from + 1, people };
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

async function keep(kit: Kit, here: Here, reads: Read[], bad: string[], sender: Sender): Promise<void> {
  const f = (await openTrip(kit, here)) ?? (await startTrip(kit, here));
  const have = (await expensesOf(kit, f.id)).length;
  if (have + reads.length > MAX_EXPENSES) {
    kit.send(copy.full({ max: MAX_EXPENSES }));
    return;
  }
  const name = sender.name ?? (sender.owner ? kit.person.name : null);
  const ids = reads.map(() => kit.id());
  const seq = f.trip.seq ?? 0;
  for (const [i, r] of reads.entries()) {
    const expense: Expense = { what: r.what, amount: r.amount, currency: r.currency, by: sender.id, name, at: kit.now };
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
  if (!taught) {
    // The first expense ever sent here: say once what happens in this group.
    await kit.store.put("state", sk(here, "taught"), 1);
    const kept = reads.map((r) => `${r.what}, ${r.currency ? money(r.amount, r.currency) : f.trip.currency ? money(r.amount, f.trip.currency) : r.amount}`);
    kit.send(copy.firstKept({ kept, currency: f.trip.currency ? sign(f.trip.currency) : null }));
    if (ask) await askCurrency(kit, f, true);
  } else if (ask) {
    await askCurrency(kit, f, f.trip.n === 1);
  } else if (!bad.length) {
    kit.react(SAVED);
  }
  if (bad.length) kit.send(copy.someNotKept({ kept: reads.length, lines: bad }));
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
  f.trip = { ...f.trip, currency: mine, asked: null, endedAt: kit.now, count: items.length, sums };
  await save(kit, f);
  await kit.store.delete("state", sk(here, "open"));
  return shown(kit, f.trip, items);
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
  kit.send(copy.total(shown(kit, f.trip, items)));
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
    const s = shown(kit, t.data, items);
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
  await kit.store.delete("expenses", last.key);
  kit.send(copy.removed({ what: last.data.what, amount: money(last.data.amount, last.data.currency ?? of(kit, f.trip)) }));
}

/** A reply to an expense: remove it, or put it right. */
async function onReply(kit: Kit, ref: ExpenseRef, text: string, lower: string): Promise<void> {
  const trip = await kit.store.get<Trip>("trips", ref.trip);
  const rows: { key: string; data: Expense }[] = [];
  for (const id of ref.ids) {
    const data = await kit.store.get<Expense>("expenses", `${ref.trip}:${id}`);
    if (data) rows.push({ key: `${ref.trip}:${id}`, data });
  }
  if (!trip || !rows.length) {
    kit.send(copy.gone());
    return;
  }
  if (trip.endedAt !== null) {
    kit.send(copy.closed());
    return;
  }
  if (/^(delete|remove|undo|cancel|forget)( (it|this|that|these|them))?$/.test(lower)) {
    for (const r of rows) await kit.store.delete("expenses", r.key);
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
  open: boolean;
  rows?: PageRow[];
}

async function pageTrip(kit: Kit, id: string, trip: Trip, withRows: boolean): Promise<PageTrip | null> {
  const open = trip.endedAt === null;
  const mine = of(kit, trip);
  if (!open && !withRows) {
    return { id, title: titleOf(trip), days: daysOf(kit, trip), count: trip.count ?? 0, total: total(trip.sums ?? {}, mine), currency: sign(mine), people: [], open };
  }
  const items = await expensesOf(kit, id);
  // An open trip nobody has sent anything to yet (it was only named) is not a trip to show.
  if (open && !items.length) return null;
  const s = shown(kit, trip, items);
  const names = new Map<string, string | null>();
  for (const { data: e } of items) if (e.name || !names.has(e.by)) names.set(e.by, e.name ?? names.get(e.by) ?? null);
  const rows: PageRow[] = items.map(({ key, data: e }, i) => ({ id: key.slice(id.length + 1), n: i + 1, what: e.what, amount: money(e.amount, e.currency ?? mine), who: names.size > 1 ? (names.get(e.by) ?? null) : null, at: e.at }));
  return { id, title: s.title, days: s.days, count: s.count, total: s.total, currency: sign(mine), people: s.people, open, ...(withRows || open ? { rows } : {}) };
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
  return { groups, trip: want && asked ? await pageTrip(kit, want, asked, true) : null } as unknown as Json;
}

export default definePlugin({
  id: "expense-tracker",
  version: "1.2.0",
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
  permissions: ["members", "groups"],
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
        if (!(await kit.store.get<Expense>("expenses", key))) throw new Error("That one is already removed.");
        await kit.store.delete("expenses", key);
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
    if (!text) return;
    const lower = text.toLowerCase().replace(/\s+/g, " ").replace(/[!.]+$/, "");
    const sender = senderOf(event, kit);
    const here: Here = event.group ?? null;
    if (!sender.owner && !(await kit.store.get("state", sk(here, "shared")))) await kit.store.put("state", sk(here, "shared"), 1);

    if (isExpenseRef(event.quotedRef)) {
      await heard(kit, here);
      return onReply(kit, event.quotedRef, text, lower);
    }
    if (await command(kit, here, text.replace(/\s+/g, " "), lower, sender)) {
      await heard(kit, here);
      return;
    }

    // A currency on its own, while the trip is asking which one: that is the answer.
    const f = await openTrip(kit, here);
    const typed = f?.trip.asked ? currencyOf(lower) : null;
    if (f && typed) {
      await settle(kit, f, typed, sender);
      await heard(kit, here);
      kit.send(copy.counting({ currency: sign(typed) }));
      return;
    }

    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, MAX_LINES);
    const reads: Read[] = [];
    const bad: string[] = [];
    for (const line of lines) {
      const r = readExpense(line);
      if (r) reads.push(r);
      else bad.push(line.slice(0, 80));
    }
    if (reads.length) return keep(kit, here, reads, bad, sender);

    // No amount: say how, once. In a group with friends in it, people also just talk, so one
    // telling is enough until something is kept or asked for.
    if ((await kit.store.get("state", sk(here, "shared"))) && (await kit.store.get("state", sk(here, "prompted")))) return;
    await kit.store.put("state", sk(here, "prompted"), 1);
    kit.unsure(copy.format());
  },

  async onAnswer(event, kit) {
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
