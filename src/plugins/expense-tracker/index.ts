import { definePlugin, type Json, type Kit, type Sender } from "../../sdk";
import { copy, SAVED, type Row, type Shown } from "./copy";
import { add, COMMON, currencyOf, guessCurrency, label, money, readAmount, readExpense, sayDay, sign, total, type Read, type Sums } from "./money";

/**
 * Simple Expense Tracker (the group is "TripExpenses")
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
 * Storage
 *   trips     key: trip id                data: Trip      sort: started (ms)
 *   expenses  key: "<trip id>:<id>"       data: Expense   sort: its place in the trip (1, 2, 3...)
 *   state     key: "open"                 data: { trip }  the trip expenses go to now
 *   state     key: "n"                    data: number    how many trips were started
 *   state     key: "taught"               data: 1 once the first-expense note was sent
 *   state     key: "shared"               data: 1 once someone other than the owner wrote here
 *   state     key: "prompted"             data: 1 after "I need an amount", until something is kept
 */

/** The most expenses one trip holds. */
export const MAX_EXPENSES = 500;
/** The most lines of one message read as expenses. */
export const MAX_LINES = 20;
/** How many expenses a list shows: the newest ones. */
export const LISTED = 40;
/** How many trips `trips` shows. */
export const TRIPS_SHOWN = 10;
/** The longest name a trip takes. */
export const MAX_NAME = 40;

export interface Trip {
  /** Its number: "Trip 2" until it is named. */
  n: number;
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
async function openTrip(kit: Kit): Promise<Found | null> {
  const open = await kit.store.get<{ trip: string }>("state", "open");
  if (!open) return null;
  const trip = await kit.store.get<Trip>("trips", open.trip);
  return trip && trip.endedAt === null ? { id: open.trip, trip } : null;
}

async function startTrip(kit: Kit): Promise<Found> {
  const n = ((await kit.store.get<number>("state", "n")) ?? 0) + 1;
  const id = kit.id();
  const trip: Trip = { n, name: null, currency: null, startedAt: kit.now, endedAt: null };
  await kit.store.put("trips", id, trip as unknown as Json, kit.now);
  await kit.store.put("state", "n", n);
  await kit.store.put("state", "open", { trip: id });
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
const heard = (kit: Kit) => kit.store.delete("state", "prompted");

async function keep(kit: Kit, reads: Read[], bad: string[], sender: Sender): Promise<void> {
  const f = (await openTrip(kit)) ?? (await startTrip(kit));
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
  await heard(kit);

  // A trip with no currency yet takes it from the first expense that names one.
  const named = reads.find((r) => r.currency)?.currency ?? null;
  const unsettled = f.trip.currency === null;
  if (unsettled && named) await settle(kit, f, named, sender);

  const taught = await kit.store.get("state", "taught");
  const ask = unsettled && !named && have === 0 && !f.trip.asked;
  if (!taught) {
    // The first expense ever sent here: say once what happens in this group.
    await kit.store.put("state", "taught", 1);
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

async function end(kit: Kit): Promise<void> {
  const f = await openTrip(kit);
  const items = f ? await expensesOf(kit, f.id) : [];
  if (!f || !items.length) {
    kit.send(copy.nothingToEnd());
    return;
  }
  if (f.trip.asked) kit.close(currencyRef(f.id, f.trip.asked) as unknown as Json);
  const mine = of(kit, f.trip);
  const sums: Sums = {};
  for (const { data: e } of items) add(sums, e.amount, e.currency ?? mine);
  // The currency it was counted in is fixed with it, so the sums stay true whatever is learnt later.
  f.trip = { ...f.trip, currency: mine, asked: null, endedAt: kit.now, count: items.length, sums };
  await save(kit, f);
  await kit.store.delete("state", "open");
  kit.send(copy.ended(shown(kit, f.trip, items)));
}

async function showTotal(kit: Kit): Promise<void> {
  const f = await openTrip(kit);
  const items = f ? await expensesOf(kit, f.id) : [];
  if (!f || !items.length) {
    kit.send(copy.nothingYet());
    return;
  }
  kit.send(copy.total(shown(kit, f.trip, items)));
}

async function showTrips(kit: Kit): Promise<void> {
  const all = (await kit.store.list<Trip>("trips")).reverse();
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

async function undo(kit: Kit, sender: Sender): Promise<void> {
  const f = await openTrip(kit);
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
async function command(kit: Kit, text: string, lower: string, sender: Sender): Promise<boolean> {
  if (/^(end( it| now)?|(end|close|finish|stop) (it|(the |this )?(trip|list))|(trip|list) (is )?(over|ended|done|finished))$/.test(lower)) {
    await end(kit);
    return true;
  }
  if (/^(total|sum|list|show|expenses|summary|how much|so far|total so far|show (the )?(total|list|expenses))\??$/.test(lower)) {
    await showTotal(kit);
    return true;
  }
  if (/^(trips|my trips|all trips|past trips|old trips|history)$/.test(lower)) {
    await showTrips(kit);
    return true;
  }
  if (/^(undo|delete last|remove last|remove the last one|delete the last one)$/.test(lower)) {
    await undo(kit, sender);
    return true;
  }
  let m = lower.match(/^currency(?:\s+(?:is\s+|to\s+|in\s+)?(.+))?$/);
  if (m) {
    const f = (await openTrip(kit)) ?? (m[1] ? await startTrip(kit) : null);
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
      const f = (await openTrip(kit)) ?? (await startTrip(kit));
      f.trip = { ...f.trip, name };
      await save(kit, f);
      kit.react(SAVED);
      return true;
    }
  }
  return false;
}

export default definePlugin({
  id: "expense-tracker",
  version: "1.0.0",
  sdk: "1",
  name: "Simple Expense Tracker",
  icon: "🧾",
  tagline: "Trip expenses, added up. Send what you paid and the amount.",
  description:
    "For a trip, a weekend or anything you pay for along the way. Send each expense to its WhatsApp group as what it was and the amount, like \"lunch 450\". It is added up, and so is what your friends send once you add them to the group. Say \"end trip\" and you get the list and the total, and the next expense starts a new one.",
  groupName: copy.groupName(),
  price: 0,
  // Tier 1: a little text per expense, and it only answers when written to.
  tier: 1,
  // "members": friends on the trip send their expenses too.
  permissions: ["members"],
  listing: {
    title: "Trip Expense Tracker on WhatsApp | Zelfred",
    description: "Send what you paid and the amount to a WhatsApp chat, like \"lunch 450\". Your trip's expenses are added up as you go. Nothing to install.",
    h1: "Trip expenses, added up in WhatsApp",
  },
  welcome: copy.welcome(),
  help: copy.help(),

  async onMessage(event, kit) {
    const text = event.text.trim();
    if (!text) return;
    const lower = text.toLowerCase().replace(/\s+/g, " ").replace(/[!.]+$/, "");
    const sender = senderOf(event, kit);
    if (!sender.owner && !(await kit.store.get("state", "shared"))) await kit.store.put("state", "shared", 1);

    if (isExpenseRef(event.quotedRef)) {
      await heard(kit);
      return onReply(kit, event.quotedRef, text, lower);
    }
    if (await command(kit, text.replace(/\s+/g, " "), lower, sender)) {
      await heard(kit);
      return;
    }

    // A currency on its own, while the trip is asking which one: that is the answer.
    const f = await openTrip(kit);
    const typed = f?.trip.asked ? currencyOf(lower) : null;
    if (f && typed) {
      await settle(kit, f, typed, sender);
      await heard(kit);
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
    if (reads.length) return keep(kit, reads, bad, sender);

    // No amount: say how, once. In a group with friends in it, people also just talk, so one
    // telling is enough until something is kept or asked for.
    if ((await kit.store.get("state", "shared")) && (await kit.store.get("state", "prompted"))) return;
    await kit.store.put("state", "prompted", 1);
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
