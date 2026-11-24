import { definePlugin, type Json, type Kit, type Sender } from "../../sdk";
import { copy, KIND_OPTION, line, NEXT_OPTIONS, SAVED, THUMB_OPTIONS, USED_OPTIONS, type Line } from "./copy";
import { addDays, addMonths, daysBetween, findDate, nextAfter, sayDate, sayLength, sayNear, sayWeekday, sayWhen, weekday, WEEKDAYS, type Every } from "./dates";
import { leads, serviceKind, thingOf, type Kind } from "./lists";
import { add, COMMON, currencyOf, guessCurrency, label, money, sign, total, type Sums } from "./money";
import { findAmount, findEvery, MAX_NAME, readBank, readSub, type Bank, type Read, type Via } from "./read";

/**
 * SubscriptionTracker: what you pay for again and again, and what runs out.
 *
 * Step 1 of docs/subscription-tracker-brief.md (in the Zelfred repo), with renewals in it:
 * people type a thing or forward their bank's message, and the app says what renews each
 * week and again the day before. Nothing is read from a mailbox or a statement here.
 *
 * Every record answers one question: does it renew by itself?
 * - Yes: a subscription, of one of three kinds. "use" (use it or lose it: asked before each
 *   renewal whether it was used, and told where to cancel after two "Not at all" in a row),
 *   "keeps" (keeps things running: the date and the amount, never a word about cancelling),
 *   "trial" (always told before it starts charging).
 * - No: "expires". Told early (1.5 x the square root of the wait, never later than the time
 *   the thing takes), told again, told after the date, and open until someone says done.
 *
 * Everything sent on a schedule is worked out from the dates each morning, not from the slot
 * that fired, and each notice is ticked off on the record. So a morning that was missed is
 * made up the next one: nothing is said twice, and a notice a day late still goes.
 *
 * Storage
 *   subs    key: id           data: Sub                 sort: next date ("YYYY-MM-DD")
 *   thumbs  key: sender id    data: "done" | "okay"     what that person's 👍 on a notice means
 *   state   key: "taught"     data: 1 once the first receipt in words was sent
 *   state   key: "currency"   data: "INR"               what plain amounts are counted in
 *   state   key: "asked"      data: 1 once the currency question was asked
 *   state   key: "weekly"     data: the day the weekly message was last due and handled
 *   state   key: "shared"     data: 1 once someone other than the owner wrote here
 *   state   key: "prompted"   data: 1 after "I couldn't read that", until something is understood
 */

/** The most things one install keeps. */
export const MAX_SUBS = 200;
/** How many of each section a list shows. */
export const LISTED = 40;
/** A usage question goes this many days before a renewal; a week before a yearly one. */
export const ASK_DAYS = 3;
export const YEARLY_DAYS = 7;
/** A trial is told this many days before it starts charging. */
export const TRIAL_DAYS = 2;
/** After the date: the day after, then once a week for four weeks (the owner, 2026-11-23). */
export const AFTER = [1, 8, 15, 22, 29];

export interface Sub {
  name: string;
  amount: number | null;
  /** Null: the amount was plain, so it is in what the group counts in. */
  currency: string | null;
  every: Every;
  /** The day of the month it comes round on, so the 31st stays the 31st. */
  dom: number;
  /** The next renewal, the day it runs out, or a trial's last day. */
  next: string;
  /** Null: asked, and not answered yet. Told the date and the amount meanwhile. */
  kind: Kind | null;
  via: Via;
  /** "HDFC xx4321". */
  account: string | null;
  from: "typed" | "forwarded";
  /** Who added it, and when. */
  by: string;
  added: string;
  /** Ask whether it was used. Off after "don't ask". */
  ask: boolean;
  /** How many renewals in a row nobody who answered had used it. */
  misses: number;
  /** The answers to the open usage question: sender id -> 0 a lot, 1 a little, 2 not at all. */
  answers: Record<string, number>;
  /** The notices already sent, each with the date it was sent about. */
  sent: Record<string, string>;
  /** Expires: how many days before the first and the middle notice go. */
  first: number | null;
  middle: number | null;
  /** Expires: how long one usually lasts, in months, to offer the next date. */
  months: number | null;
  /** Expires: marked done, and waiting to hear the next date. */
  done?: boolean;
}

type Row = { key: string; data: Sub };

type Ref =
  | { kind: "sub" | "notice" | "next"; id: string; day?: string }
  | { kind: "use"; id: string; next: string }
  | { kind: "kind"; id: string; kinds: Kind[] }
  | { kind: "thumb"; id: string; who: string }
  | { kind: "currency"; codes: string[] }
  | { kind: "bank"; amount: number; currency: string; day: string | null; via: Via; account: string | null };

const KINDS: Kind[] = ["use", "keeps", "trial", "expires"];
function asRef(ref: unknown): Ref | null {
  if (!ref || typeof ref !== "object") return null;
  const r = ref as Record<string, unknown>;
  const id = typeof r.id === "string";
  if ((r.kind === "sub" || r.kind === "notice" || r.kind === "next") && id) return ref as Ref;
  if (r.kind === "use" && id && typeof r.next === "string") return ref as Ref;
  if (r.kind === "kind" && id && Array.isArray(r.kinds) && r.kinds.every((k) => KINDS.includes(k as Kind))) return ref as Ref;
  if (r.kind === "thumb" && id && typeof r.who === "string") return ref as Ref;
  if (r.kind === "currency" && Array.isArray(r.codes) && r.codes.every((c) => typeof c === "string")) return ref as Ref;
  if (r.kind === "bank" && typeof r.amount === "number" && typeof r.currency === "string") return ref as Ref;
  return null;
}
const j = (ref: Ref) => ref as unknown as Json;

const all = (kit: Kit) => kit.store.list<Sub>("subs");
const save = (kit: Kit, row: Row) => kit.store.put("subs", row.key, row.data as unknown as Json, row.data.next);

/** What plain amounts are counted in: what this group settled, else what Zelfred knows of the person, else a guess. */
async function own(kit: Kit): Promise<string> {
  return (await kit.store.get<string>("state", "currency")) ?? kit.person.currency ?? guessCurrency(kit.person.timezone);
}
const said = (sub: Sub, mine: string) => (sub.amount === null ? null : money(sub.amount, sub.currency ?? mine));
const expires = (sub: Sub) => sub.kind === "expires";

function asLine(kit: Kit, sub: Sub, mine: string): Line {
  return { name: sub.name, amount: said(sub, mine), every: sub.every, when: sayWhen(sub.next, kit.today), expires: expires(sub), trial: sub.kind === "trial" };
}

const senderOf = (event: { sender?: Sender }, kit: Kit): Sender => event.sender ?? { id: kit.person.id ?? "owner", name: kit.person.name, owner: true };

const weeklyDay = (kit: Kit) => {
  const d = Number(kit.settings.weeklyDay);
  return Number.isInteger(d) && d >= 0 && d <= 6 ? d : 0;
};
/** "Sunday evening": when the weekly message goes, as the first receipt says it. */
function weeklyWhen(kit: Kit): string {
  const h = kit.settings.weeklyHour;
  const part = typeof h !== "number" ? "" : h < 12 ? " morning" : h < 17 ? " afternoon" : " evening";
  return `${WEEKDAYS[weeklyDay(kit)]}${part}`;
}

/** The things a name is about: the one called exactly that, else every one whose name has it. */
function named(rows: Row[], name: string): Row[] {
  const n = name.toLowerCase().replace(/\s+/g, " ").trim();
  if (!n) return [];
  const exact = rows.filter((r) => r.data.name.toLowerCase() === n);
  return exact.length ? exact : rows.filter((r) => r.data.name.toLowerCase().includes(n));
}

/** The one thing a name is about, or a word to the person about why not. */
async function one(kit: Kit, name: string): Promise<Row | null> {
  const found = named(await all(kit), name);
  if (found.length === 1) return found[0];
  kit.send(found.length ? copy.several({ names: found.slice(0, 8).map((r) => r.data.name) }) : copy.notFound({ name: name.slice(0, MAX_NAME) }));
  return null;
}

/** Put a new date on a record: the notices start over, and how early to speak is worked out from today. */
function redate(kit: Kit, sub: Sub, day: string): Sub {
  const next: Sub = { ...sub, next: day, dom: Number(day.slice(8)), sent: {}, answers: {}, done: false };
  if (!expires(next)) return { ...next, first: null, middle: null };
  const l = leads(daysBetween(kit.today, day), thingOf(sub.name)?.floor ?? 0);
  return { ...next, first: l.first, middle: l.middle };
}

/** The person who added the app named a currency: Zelfred keeps it if it knew nothing. */
async function learn(kit: Kit, sender: Sender, currency: string): Promise<void> {
  if (sender.owner && !kit.person.currency) await kit.learn({ currency });
}

/** A named currency is what this group counts in from now on, unless it already settled one. */
async function settleCurrency(kit: Kit, currency: string, sender: Sender, force = false): Promise<void> {
  if (force || !(await kit.store.get("state", "currency"))) await kit.store.put("state", "currency", currency);
  await learn(kit, sender, currency);
}

/** Which kinds to offer when the app can't tell what something is. Null: it can tell. */
function kindsToAsk(read: { name: string; trial: boolean; expires: boolean | null; every: Every | null }): { kind: Kind | null; ask: Kind[] | null } {
  if (read.trial) return { kind: "trial", ask: null };
  if (read.expires === true) return { kind: "expires", ask: null };
  const service = serviceKind(read.name);
  if (service) return { kind: service, ask: null };
  const thing = thingOf(read.name);
  const renews = read.expires === false || (read.every !== null && read.every !== "once");
  if (thing && !thing.either) return { kind: "expires", ask: null };
  // Insurance on AutoPay keeps things running; paid by hand it runs out. The words may say which.
  if (thing) return renews ? { kind: "keeps", ask: null } : { kind: null, ask: ["keeps", "expires"] };
  return { kind: null, ask: renews ? ["use", "keeps", "trial"] : ["use", "keeps", "trial", "expires"] };
}

/** Change a thing already kept with what a new line says about it. */
async function update(kit: Kit, row: Row, read: Read, sender: Sender): Promise<void> {
  let sub = row.data;
  if (read.amount !== null) sub = { ...sub, amount: read.amount, currency: read.currency ?? sub.currency };
  if (read.every) sub = { ...sub, every: read.every };
  if (read.via !== "unknown") sub = { ...sub, via: read.via };
  if (read.day) sub = redate(kit, sub, read.day);
  if (read.currency) await settleCurrency(kit, read.currency, sender);
  await save(kit, { key: row.key, data: sub });
  kit.mark(j({ kind: "sub", id: row.key }));
  kit.react(SAVED);
}

/** Keep something new, and answer: a 👍, or words when there is something to say or to ask. */
async function keep(kit: Kit, read: Read, sender: Sender, from: "typed" | "forwarded", bank?: Bank): Promise<void> {
  const rows = await all(kit);
  const same = rows.find((r) => r.data.name.toLowerCase() === read.name.toLowerCase());
  if (same) {
    if (!bank) return update(kit, same, read, sender);
    // The same charge again: the amount as it is now, and the next one a month on.
    const sub = redate(kit, { ...same.data, amount: bank.amount, currency: bank.currency, via: bank.via !== "unknown" ? bank.via : same.data.via, account: bank.account ?? same.data.account }, read.day!);
    await save(kit, { key: same.key, data: sub });
    kit.react(SAVED);
    return;
  }
  if (rows.length >= MAX_SUBS) return void kit.send(copy.full({ max: MAX_SUBS }));

  const { kind, ask } = kindsToAsk(read);
  const runsOut = kind === "expires";
  if (runsOut && !read.day) return void kit.send(copy.needDate({ name: read.name }));
  if (read.day && read.day < kit.today) return void kit.send(copy.pastDate({ when: sayWhen(read.day, kit.today).replace(/^on /, "") }));

  const every: Every = read.every ?? (runsOut ? "once" : "monthly");
  const guessed = !read.day;
  const next = read.day ?? nextAfter(kit.today, every);
  const thing = thingOf(read.name);
  const id = kit.id();
  const base: Sub = {
    name: read.name,
    amount: read.amount,
    currency: read.currency,
    every,
    dom: Number(next.slice(8)),
    next,
    kind,
    via: bank?.via ?? read.via,
    account: bank?.account ?? null,
    from,
    by: sender.id,
    added: kit.today,
    ask: true,
    misses: 0,
    answers: {},
    sent: {},
    first: null,
    middle: null,
    months: runsOut ? (thing?.months ?? null) : null,
  };
  const away = daysBetween(kit.today, next);
  const lead = runsOut ? leads(away, thing?.floor ?? 0) : null;
  const sub = lead ? { ...base, first: lead.first, middle: lead.middle } : base;
  await save(kit, { key: id, data: sub });
  kit.mark(j({ kind: "sub", id }));

  // The currency: taken from the message when it names one, else asked once.
  const known = (await kit.store.get<string>("state", "currency")) ?? kit.person.currency;
  if (read.currency) await settleCurrency(kit, read.currency, sender);
  const askCurrency = read.amount !== null && !read.currency && !known && !(await kit.store.get("state", "asked"));
  const mine = await own(kit);

  const first = !(await kit.store.get("state", "taught"));
  if (first) await kit.store.put("state", "taught", 1);
  const ref = j({ kind: "sub", id });
  if (bank) {
    const paid = bank.via === "upi" ? "paid by UPI AutoPay" : bank.via === "card" ? "paid by card" : null;
    kit.send(copy.bankKept({ name: sub.name, amount: money(bank.amount, bank.currency), paid: paid ? `${paid}${bank.account ? ` from ${bank.account}` : ""}` : bank.account ? `from ${bank.account}` : null, next: sayWhen(next, kit.today), first, weekly: weeklyWhen(kit) }), { ref });
  } else if (first || guessed || lead?.late) {
    kit.send(copy.kept({ line: line(asLine(kit, sub, mine)), guessed, near: lead?.late ? sayNear(away) : null, first, weekly: weeklyWhen(kit) }), { ref });
  } else if (!ask && !askCurrency) {
    // Nothing to say and nothing to ask: the 👍 is the whole receipt.
    kit.react(SAVED);
  }

  if (ask) kit.ask(copy.whichKind({ name: sub.name }), ask.map((k) => KIND_OPTION[k]), { ref: j({ kind: "kind", id, kinds: ask }), confirm: false });
  if (askCurrency) {
    await kit.store.put("state", "asked", 1);
    const codes = [mine, ...COMMON.filter((c) => c !== mine)];
    kit.ask(copy.whichCurrency(), codes.map(label), { ref: j({ kind: "currency", codes }), confirm: false });
  }
}

/** A forwarded bank message: kept as a monthly charge whose next date is a month after this one. */
async function keepBank(kit: Kit, bank: Bank, name: string, sender: Sender): Promise<void> {
  const next = nextAfter(bank.day ?? kit.today, "monthly");
  const read: Read = { name, amount: bank.amount, currency: bank.currency, day: next < kit.today ? nextAfter(kit.today, "monthly") : next, every: "monthly", via: bank.via, trial: false, expires: false };
  await keep(kit, read, sender, "forwarded", bank);
}

async function remove(kit: Kit, row: Row): Promise<void> {
  const refs: Ref[] = [{ kind: "use", id: row.key, next: row.data.next }];
  for (const r of refs) kit.close(j(r));
  await kit.store.delete("subs", row.key);
}

/** Something that ran out is renewed: ask until when, offering the likely date. */
async function done(kit: Kit, row: Row): Promise<void> {
  await save(kit, { key: row.key, data: { ...row.data, done: true } });
  const offered = row.data.months ? addMonths(row.data.next, row.data.months) : null;
  if (offered && offered > kit.today) kit.ask(copy.until({ date: sayDate(offered, kit.today) }), [...NEXT_OPTIONS], { ref: j({ kind: "next", id: row.key, day: offered }), confirm: false });
  else kit.send(copy.nextDate({ name: row.data.name }), { ref: j({ kind: "next", id: row.key }) });
}

async function showList(kit: Kit): Promise<void> {
  const rows = await all(kit);
  if (!rows.length) return void kit.send(copy.nothingYet());
  const mine = await own(kit);
  const paying = rows.filter((r) => !expires(r.data));
  const running = rows.filter((r) => expires(r.data));
  const sums = perMonth(paying, mine);
  const has = Object.keys(sums).length > 0;
  kit.send(
    copy.list({
      paying: paying.slice(0, LISTED).map((r) => line(asLine(kit, r.data, mine))),
      running: running.slice(0, LISTED).map((r) => line(asLine(kit, r.data, mine))),
      month: has ? total(sums, mine) : null,
      year: has ? total(Object.fromEntries(Object.entries(sums).map(([c, n]) => [c, Math.round(n * 12)])), mine) : null,
    }),
  );
}

/** What the subscriptions come to in a month, each currency on its own. Only the ones with an amount. */
function perMonth(rows: Row[], mine: string): Sums {
  const sums: Sums = {};
  const share: Record<Every, number> = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12, once: 0 };
  for (const { data: s } of rows) if (s.amount !== null && s.kind !== "trial" && share[s.every]) add(sums, s.amount * share[s.every], s.currency ?? mine);
  for (const c of Object.keys(sums)) sums[c] = Math.round(sums[c]);
  return sums;
}

/** What renews or runs out in the 7 days after today. */
async function weekAhead(kit: Kit): Promise<{ name: string; day: string; amount: string | null; expires: boolean; trial: boolean }[]> {
  const mine = await own(kit);
  const until = addDays(kit.today, 7);
  return (await all(kit))
    .filter((r) => !r.data.done && r.data.next > kit.today && r.data.next <= until)
    .slice(0, LISTED)
    .map(({ data: s }) => ({ name: s.name, day: sayWeekday(s.next), amount: said(s, mine), expires: expires(s), trial: s.kind === "trial" }));
}

/** The weekly message: only when something is in the week ahead (the owner, 2026-11-23). */
async function sendWeekly(kit: Kit): Promise<void> {
  const items = await weekAhead(kit);
  if (items.length) kit.send(copy.weekly({ items }));
}

/** Count the answers to a usage question and close it. Returns whether everyone who answered said "Not at all". */
function tally(kit: Kit, id: string, sub: Sub): { sub: Sub; unused: boolean } {
  kit.close(j({ kind: "use", id, next: sub.next }));
  const answers = Object.values(sub.answers);
  // Nobody answered: it counts as nothing, and the run of "Not at all" stays as it was.
  if (!answers.length) return { sub, unused: false };
  // The highest answer wins: one person who used it means it was used.
  const unused = Math.min(...answers) === 2;
  return { sub: { ...sub, misses: unused ? sub.misses + 1 : 0, answers: {} }, unused };
}

/** Everything due for one record this morning. Returns the record as it is now. */
async function notices(kit: Kit, id: string, start: Sub, mine: string): Promise<Sub> {
  let sub = start;
  const notice = j({ kind: "notice", id });
  const mark = (what: string) => (sub = { ...sub, sent: { ...sub.sent, [what]: sub.next } });
  const was = (what: string) => sub.sent[what] === sub.next;

  if (expires(sub)) {
    if (sub.done) return sub;
    const away = daysBetween(kit.today, sub.next);
    if (away >= 2) {
      const due = sub.middle !== null && away <= sub.middle && !was("middle") ? "middle" : sub.first !== null && away <= sub.first && !was("first") ? "first" : null;
      if (due) {
        kit.send(copy.early({ name: sub.name, date: sayDate(sub.next, kit.today), near: sayNear(away) }), { ref: notice });
        mark("first");
        if (due === "middle") mark("middle");
      }
    } else if (away >= 0) {
      if (!was("eve")) {
        kit.send(copy.expires({ name: sub.name, when: sayWhen(sub.next, kit.today) }), { ref: notice });
        mark("eve");
      }
    } else {
      // After the date: the latest of the five that is due and not said yet. Never two at once.
      const gone = -away;
      const step = [...AFTER].reverse().find((n) => n <= gone);
      if (step && gone < AFTER[AFTER.length - 1] + 7 && sub.sent.after !== `${sub.next}:${step}`) {
        const ago = gone === 1 ? "yesterday" : `${sayLength(gone)} ago`;
        kit.send(copy.expired({ name: sub.name, ago }), { ref: notice });
        sub = { ...sub, sent: { ...sub.sent, after: `${sub.next}:${step}` } };
      }
    }
    return sub;
  }

  // The date has gone by: it has renewed, and the next one is a period on.
  while (sub.next < kit.today) {
    if (sub.sent.poll === sub.next) sub = tally(kit, id, sub).sub;
    // A trial that ended is a subscription from here on.
    const kind = sub.kind === "trial" ? (serviceKind(sub.name) ?? "use") : sub.kind;
    sub = { ...sub, kind, next: nextAfter(sub.next, sub.every === "once" ? "monthly" : sub.every, sub.dom), every: sub.every === "once" ? "monthly" : sub.every, answers: {} };
  }
  const away = daysBetween(kit.today, sub.next);
  const when = sayWhen(sub.next, kit.today);
  const amount = said(sub, mine);

  if (away <= 1) {
    if (was("eve")) return sub;
    if (sub.kind === "trial") kit.send(copy.trialEnds({ name: sub.name, when, amount }), { ref: notice });
    else {
      let unused = false;
      if (was("poll")) ({ sub, unused } = tally(kit, id, sub));
      const spent = unused && sub.amount !== null ? money(sub.amount * sub.misses, sub.currency ?? mine) : null;
      kit.send(copy.renews({ name: sub.name, when, amount, unused, run: sub.misses, spent, every: sub.every, via: sub.via }), { ref: notice });
    }
    mark("eve");
    return sub;
  }
  if (sub.kind === "trial") {
    if (away <= TRIAL_DAYS && !was("trial")) {
      kit.send(copy.trialEnds({ name: sub.name, when, amount }), { ref: notice });
      mark("trial");
    }
    return sub;
  }
  const yearly = sub.every === "yearly";
  // A weekly one is not asked about: a question every week is noise.
  if (sub.kind === "use" && sub.ask && sub.every !== "weekly") {
    if (away <= (yearly ? YEARLY_DAYS : ASK_DAYS) && !was("poll")) {
      kit.ask(copy.used({ name: sub.name, when, amount, every: sub.every }), [...USED_OPTIONS], { ref: j({ kind: "use", id, next: sub.next }) });
      mark("poll");
    }
  } else if (yearly && away <= YEARLY_DAYS && !was("week")) {
    kit.send(copy.yearly({ name: sub.name, when, amount }), { ref: notice });
    mark("week");
  }
  return sub;
}

/** A reply to one of the app's messages about one thing, or to the person's own message that added it. */
async function onReply(kit: Kit, row: Row, text: string, lower: string, sender: Sender, wantsDate: boolean): Promise<void> {
  const sub = row.data;
  if (/^(remove|delete|cancel(?:led|ed)?|stop|forget)( (it|this|that))?$/.test(lower)) {
    await remove(kit, row);
    return void kit.react(SAVED);
  }
  if (/^(?:it(?:'| i)?s )?(?:not renewed again|not renewed|not renewing|never|none|no|not again)$/.test(lower) && wantsDate) {
    await remove(kit, row);
    return void kit.send(copy.ended({ name: sub.name }));
  }
  if (/^(done|renewed|paid|did it|it'?s done)$/.test(lower)) {
    if (!expires(sub)) return void kit.send(copy.notExpiring({ name: sub.name }));
    return done(kit, row);
  }
  if (/^(don'?t|do not|stop) ask(ing)?( me)?( about (this|it)( one)?)?$/.test(lower) || /^ask( me)?( again)?$/.test(lower)) {
    await save(kit, { key: row.key, data: { ...sub, ask: lower.startsWith("ask") } });
    return void kit.react(SAVED);
  }
  const date = findDate(lower, kit.today);
  if (date && !date.rest.replace(/\b(on|the|until|till|next|is|it'?s|to)\b/g, "").trim()) {
    if (date.day < kit.today) return void kit.send(copy.pastDate({ when: sayWhen(date.day, kit.today).replace(/^on /, "") }));
    await save(kit, { key: row.key, data: redate(kit, sub, date.day) });
    if (wantsDate) return void kit.send(copy.nextSet({ name: sub.name, date: sayDate(date.day, kit.today) }));
    return void kit.react(SAVED);
  }
  const often = findEvery(lower);
  if (often && !often.rest) {
    await save(kit, { key: row.key, data: { ...sub, every: often.every } });
    return void kit.react(SAVED);
  }
  const amount = findAmount(lower);
  if (amount && !amount.rest) {
    if (amount.currency) await settleCurrency(kit, amount.currency, sender);
    await save(kit, { key: row.key, data: { ...sub, amount: amount.amount, currency: amount.currency ?? sub.currency } });
    return void kit.react(SAVED);
  }
  kit.send(wantsDate ? copy.nextDate({ name: sub.name }) : copy.replyHow(), wantsDate ? { ref: j({ kind: "next", id: row.key }) } : undefined);
}

/** The ready-made messages. True when the text was one. */
async function command(kit: Kit, text: string, lower: string, sender: Sender): Promise<boolean> {
  if (/^(list|show|subscriptions|subs|renewals|all|everything|what do i pay for|show (the |my )?(list|subscriptions))\??$/.test(lower)) {
    await showList(kit);
    return true;
  }
  if (/^(this week|week|next 7 days|what(?:'s| is)? (renewing|due|coming)( up)?( this week)?|upcoming)\??$/.test(lower)) {
    const items = await weekAhead(kit);
    kit.send(items.length ? copy.weekly({ items }) : copy.nothingThisWeek());
    return true;
  }
  let m = lower.match(/^currency(?:\s+(?:is\s+|to\s+|in\s+)?(.+))?$/);
  if (m) {
    if (!m[1]) kit.send(copy.countingNow({ currency: sign(await own(kit)) }));
    else {
      const currency = currencyOf(m[1]) ?? (/^[a-z]{3}$/.test(m[1]) ? m[1].toUpperCase() : null);
      if (!currency) kit.send(copy.currencyUnknown());
      else {
        const codes = [await own(kit), ...COMMON];
        kit.close(j({ kind: "currency", codes: [...new Set(codes)] }));
        await settleCurrency(kit, currency, sender, true);
        kit.send(copy.counting({ currency: sign(currency) }));
      }
    }
    return true;
  }
  m = text.match(/^(?:remove|delete|drop|forget|cancelled|canceled|stop tracking)\s+(.+)$/i);
  if (m) {
    const row = await one(kit, m[1]);
    if (row) {
      await remove(kit, row);
      kit.react(SAVED);
    }
    return true;
  }
  m = text.match(/^(?:done|renewed)\s+(.+)$/i) ?? text.match(/^(.+?)\s+(?:is\s+)?(?:done|renewed)$/i);
  if (m) {
    const row = await one(kit, m[1]);
    if (row) {
      if (expires(row.data)) await done(kit, row);
      else kit.send(copy.notExpiring({ name: row.data.name }));
    }
    return true;
  }
  m = text.match(/^(don'?t ask|do not ask|stop asking|ask)(?:\s+(?:me\s+)?(?:about\s+)?)\s*(.+)$/i);
  if (m) {
    const row = await one(kit, m[2]);
    if (row) {
      await save(kit, { key: row.key, data: { ...row.data, ask: /^ask/i.test(m[1]) } });
      kit.react(SAVED);
    }
    return true;
  }
  m = text.match(/^kind\s+(.+)$/i);
  if (m) {
    const row = await one(kit, m[1]);
    if (row) kit.ask(copy.whichKind({ name: row.data.name }), KINDS.map((k) => KIND_OPTION[k]), { ref: j({ kind: "kind", id: row.key, kinds: KINDS }), confirm: false });
    return true;
  }
  return false;
}

/** A line to keep: a bank's message, or what the person typed. True when it was one. */
async function tryKeep(kit: Kit, text: string, sender: Sender): Promise<boolean> {
  const bank = readBank(text, kit.today);
  if (bank) {
    if (bank.name) await keepBank(kit, bank, bank.name, sender);
    else kit.send(copy.bankWho({ amount: money(bank.amount, bank.currency), when: bank.day ? sayWhen(bank.day, kit.today) : null }), { ref: j({ kind: "bank", amount: bank.amount, currency: bank.currency, day: bank.day, via: bank.via, account: bank.account }) });
    return true;
  }
  const read = readSub(text, kit.today);
  if (!read) return false;
  await keep(kit, read, sender, "typed");
  return true;
}

export default definePlugin({
  id: "subscription-tracker",
  version: "1.0.0",
  sdk: "1",
  name: "SubscriptionTracker",
  icon: "🔁",
  tagline: "What you pay for again and again, and what runs out, said before the date.",
  description:
    "Tell it what you pay for, like \"Netflix 649 monthly on the 5th\", or forward the message your bank sent. Tell it what runs out too: a passport, car insurance, a PUC certificate. You get a list of what renews each week, a word the day before, and a question about whether you still use the ones you could drop. It never sees your bank account.",
  groupName: copy.groupName(),
  price: 0,
  // Tier 1: a few records, two daily slots, and a handful of messages a week.
  tier: 1,
  // "members": others in the group can add, forward and answer (the owner, 2026-11-23).
  permissions: ["members"],
  listing: {
    title: "Subscription tracker and renewal reminders | Zelfred",
    description: "Tell me what you pay for and what runs out. I'll say what renews this week, before the money goes, and I never see your bank account.",
    h1: "Tell me what you pay for. I'll say what renews this week, before the money goes.",
  },
  welcome: copy.welcome(),
  help: copy.help(),
  // Sunday evening by default, and the person's to change on the page (the owner, 2026-11-23).
  settings: { weeklyDay: 0, weeklyHour: 19 },
  schedules: [
    { id: "notices", hour: 9 },
    { id: "weekly", hour: { setting: "weeklyHour" } },
  ],

  async onMessage(event, kit) {
    const text = event.text.trim();
    if (!text) return;
    const flat = text.replace(/\s+/g, " ");
    const lower = flat.toLowerCase().replace(/[!.]+$/, "");
    const sender = senderOf(event, kit);
    if (!sender.owner && !(await kit.store.get("state", "shared"))) await kit.store.put("state", "shared", 1);
    /** Something was understood: the next message that can't be read is answered again. */
    const heard = () => kit.store.delete("state", "prompted");

    const ref = asRef(event.quotedRef);
    if (ref?.kind === "bank") {
      // The name of a charge whose bank message had none that could be read.
      const name = flat.replace(/^(?:it(?:'| i)?s|for|its)\s+/i, "").slice(0, MAX_NAME).trim();
      if (!/\p{L}/u.test(name)) return void kit.send(copy.bankWho({ amount: money(ref.amount, ref.currency), when: null }), { ref: j(ref) });
      return keepBank(kit, { name, amount: ref.amount, currency: ref.currency, day: ref.day, via: ref.via, account: ref.account }, name, sender);
    }
    if (ref && "id" in ref && ref.kind !== "kind" && ref.kind !== "thumb") {
      const data = await kit.store.get<Sub>("subs", ref.id);
      if (!data) return void kit.send(copy.gone());
      await heard();
      return onReply(kit, { key: ref.id, data }, flat, lower, sender, ref.kind === "next");
    }

    if ((await command(kit, flat, lower, sender)) || (await tryKeep(kit, text, sender))) return void (await heard());
    // With friends in the group people also just talk, so one telling is enough until
    // something is understood.
    if ((await kit.store.get("state", "shared")) && (await kit.store.get("state", "prompted"))) return;
    await kit.store.put("state", "prompted", 1);
    kit.unsure(copy.format());
  },

  understand: {
    intents: {
      add: "Tell it about something they pay for again and again, a free trial, or something that runs out on a date",
      list: "See everything it keeps and what it adds up to",
      this_week: "See what renews or runs out in the coming days",
      remove: "Take one thing off the list, because it was cancelled or is no longer wanted",
      done: "Say that something which ran out has been renewed",
    },
    async targets(kit) {
      return Object.fromEntries((await all(kit)).slice(0, 50).map((r) => [r.key, r.data.name]));
    },
  },

  async onIntent(event, kit) {
    const sender = senderOf(event, kit);
    if (event.intent === "list") return showList(kit);
    if (event.intent === "this_week") {
      const items = await weekAhead(kit);
      return void kit.send(items.length ? copy.weekly({ items }) : copy.nothingThisWeek());
    }
    if (event.intent === "add") {
      // Read it again without the words people put in front: "i pay", "i have", "please add".
      const bare = event.text.replace(/^\s*(?:please\s+)?(?:i\s+(?:pay|have|pay for|got|subscribed to|am paying)|add|track|remember|note)\s+(?:for\s+)?/i, "");
      if (!(await tryKeep(kit, bare, sender))) kit.send(copy.format());
      return;
    }
    const data = event.target ? await kit.store.get<Sub>("subs", event.target) : null;
    if (!data || !event.target) return void kit.send(copy.whichOne({ example: event.intent === "done" ? "done car insurance" : "remove netflix" }));
    const row = { key: event.target, data };
    if (event.intent === "remove") {
      await remove(kit, row);
      return void kit.react(SAVED);
    }
    if (expires(data)) await done(kit, row);
    else kit.send(copy.notExpiring({ name: data.name }));
  },

  async onAnswer(event, kit) {
    const ref = asRef(event.ref);
    if (!ref) return;
    const sender = senderOf(event, kit);

    if (ref.kind === "currency") {
      const currency = ref.codes[event.choice];
      kit.close(event.ref as Json);
      if (!currency) return;
      await settleCurrency(kit, currency, sender, true);
      return void kit.send(copy.counting({ currency: sign(currency) }));
    }
    if (!("id" in ref)) return;
    const data = await kit.store.get<Sub>("subs", ref.id);
    // Removed since it was asked: the question is over.
    if (!data) return void kit.close(event.ref as Json);
    const row = { key: ref.id, data };

    if (ref.kind === "use") {
      // An answer about a renewal that has already gone by changes nothing.
      if (data.next !== ref.next || !(event.choice >= 0 && event.choice <= 2)) return;
      await save(kit, { key: ref.id, data: { ...data, answers: { ...data.answers, [sender.id]: event.choice } } });
      return;
    }
    if (ref.kind === "kind") {
      const kind = ref.kinds[event.choice];
      // The first answer settles it for the group.
      kit.close(event.ref as Json);
      if (!kind) return;
      let sub: Sub = { ...data, kind };
      if (kind === "expires") {
        const thing = thingOf(sub.name);
        sub = redate(kit, { ...sub, every: "once", months: thing?.months ?? null }, sub.next);
      } else if (data.kind === "expires") {
        sub = { ...sub, every: sub.every === "once" ? "yearly" : sub.every, first: null, middle: null, months: null, done: false };
      }
      await save(kit, { key: ref.id, data: sub });
      return void kit.send(copy.kindSet({ name: sub.name, kind }), { ref: j({ kind: "sub", id: ref.id }) });
    }
    if (ref.kind === "thumb") {
      // Only the person whose 👍 it was can say what it meant.
      if (sender.id !== ref.who) return;
      const isDone = event.choice === 0;
      kit.close(event.ref as Json);
      await kit.store.put("thumbs", sender.id, isDone ? "done" : "okay");
      kit.send(copy.learnt({ done: isDone }));
      if (isDone && expires(data) && !data.done) await done(kit, row);
      return;
    }
    if (ref.kind === "next") {
      kit.close(event.ref as Json);
      if (event.choice === 0 && ref.day) {
        await save(kit, { key: ref.id, data: redate(kit, data, ref.day) });
        return void kit.send(copy.nextSet({ name: data.name, date: sayDate(ref.day, kit.today) }));
      }
      if (event.choice === 1) return void kit.send(copy.nextDate({ name: data.name }), { ref: j({ kind: "next", id: ref.id }) });
      if (event.choice === 2) {
        await remove(kit, row);
        return void kit.send(copy.ended({ name: data.name }));
      }
    }
  },

  async onReaction(event, kit) {
    const ref = asRef(event.ref);
    if (!ref || ref.kind !== "notice" || (event.emoji !== "👍" && event.emoji !== "✅")) return;
    const data = await kit.store.get<Sub>("subs", ref.id);
    // Only a thing that runs out can be done, and only once.
    if (!data || !expires(data) || data.done) return;
    const sender = senderOf(event, kit);
    const row = { key: ref.id, data };
    if (event.emoji === "✅") return done(kit, row);
    const means = await kit.store.get<string>("thumbs", sender.id);
    if (means === "done") return done(kit, row);
    // The first 👍 from this person on one of these: ask what it meant, once.
    if (!means) kit.ask(copy.thumbQuestion({ name: data.name }), [...THUMB_OPTIONS], { ref: j({ kind: "thumb", id: ref.id, who: sender.id }), confirm: false });
  },

  async onSchedule(event, kit) {
    const day = weeklyDay(kit);
    if (event.id === "weekly") {
      if (weekday(kit.today) !== day) return;
      if ((await kit.store.get<string>("state", "weekly")) === kit.today) return;
      await kit.store.put("state", "weekly", kit.today);
      return sendWeekly(kit);
    }
    if (event.id !== "notices") return;
    const mine = await own(kit);
    for (const row of await all(kit)) {
      const now = await notices(kit, row.key, row.data, mine);
      if (now !== row.data) await save(kit, { key: row.key, data: now });
    }
    // The weekly message whose evening was missed yesterday still goes this morning: a day late still helps.
    const yesterday = addDays(kit.today, -1);
    if (typeof kit.settings.weeklyHour === "number" && weekday(yesterday) === day && (await kit.store.get<string>("state", "weekly")) !== yesterday && (await kit.store.get("state", "taught"))) {
      await kit.store.put("state", "weekly", yesterday);
      await sendWeekly(kit);
    }
  },

  web: {
    lockable: true,
    async load(kit) {
      const rows = await all(kit);
      const mine = await own(kit);
      const show = ({ key, data: s }: Row) => ({
        id: key,
        name: s.name,
        amount: said(s, mine),
        every: s.every,
        next: s.next,
        kind: s.kind,
        via: s.via,
        account: s.account,
        ask: s.ask,
        misses: s.misses,
        done: !!s.done,
      });
      const paying = rows.filter((r) => !expires(r.data));
      const sums = perMonth(paying, mine);
      const has = Object.keys(sums).length > 0;
      return {
        subscriptions: paying.map(show),
        expires: rows.filter((r) => expires(r.data)).map(show),
        perMonth: has ? total(sums, mine) : null,
        perYear: has ? total(Object.fromEntries(Object.entries(sums).map(([c, n]) => [c, Math.round(n * 12)])), mine) : null,
        currency: mine,
        weeklyDay: weeklyDay(kit),
        weeklyHour: typeof kit.settings.weeklyHour === "number" ? kit.settings.weeklyHour : null,
        /** What the person's own 👍 on a notice about something that expires means. Null: not asked yet. */
        thumb: kit.person.id ? ((await kit.store.get<string>("thumbs", kit.person.id)) ?? null) : null,
      } as unknown as Json;
    },
    actions: {
      /** The page asks "are you sure" before calling this. */
      async remove(kit, { id }) {
        const data = await kit.store.get<Sub>("subs", String(id));
        if (!data) throw new Error("That one is already off the list.");
        await remove(kit, { key: String(id), data });
      },
      async setAsk(kit, { id, ask }) {
        const data = await kit.store.get<Sub>("subs", String(id));
        if (!data) throw new Error("That one is off the list.");
        await save(kit, { key: String(id), data: { ...data, ask: ask === true } });
      },
      async setWeekly(kit, { day, hour }) {
        if (!(typeof day === "number" && Number.isInteger(day) && day >= 0 && day <= 6)) throw new Error("Pick a day of the week.");
        if (!(hour === null || (typeof hour === "number" && Number.isInteger(hour) && hour >= 0 && hour <= 23))) throw new Error("Pick an hour, or turn the weekly message off.");
        await kit.setSettings({ weeklyDay: day, weeklyHour: hour });
      },
      async setThumb(kit, { means }) {
        if (means !== "done" && means !== "okay") throw new Error("A 👍 can mean done or okay.");
        if (!kit.person.id) throw new Error("I can't tell whose 👍 that is.");
        await kit.store.put("thumbs", kit.person.id, means);
      },
    },
  },
});
