import type { AnswerEvent, IntentEvent, Json, Kit, MessageEvent, Sender } from "../../sdk";
import { CHECKIN_OPTIONS, copy, LOGGED, OFFER_OPTIONS, SAVED, type GroupHabit, type Streaker } from "./copy";
import { batchOf, batchWord, bestStreak, cleanName, isOn, parseDays, scanDays, streak, type Batch } from "./streaks";

/**
 * Pacts: a habit kept together. A pact is its own WhatsApp group (one of the install's extra
 * groups) that the person adds friends, a study partner or a partner to. Anyone there can add
 * a habit, and twice a day (morning and evening) the habits that are due go out as one poll
 * for the whole group, where everyone ticks what they did. WhatsApp shows who ticked what, so
 * the poll is the scoreboard and nothing is posted per answer.
 *
 * Whose answers are kept: the person who made the pact, and anyone with a Zelfred profile.
 * Someone without one is offered a profile on their first answer ("Good start Asha. Let me create an
 * account for you..."); on their yes their streak is kept from that day, on "not now" what they
 * answered is forgotten and they are not asked again ("set me up" brings it back).
 *
 * Storage (all per install, apart from the private habits' collections)
 *   pacts    key = group key                      data = Pact         sort = created (ms)
 *   phabits  key = habit id                       data = PactHabit    sort = created (ms)
 *   pjoins   key = "<habitId>:<personId>"         data = Join         (who is doing a habit)
 *   plogs    key = "<habitId>:<personId>:<day>"   data = 1            sort = day   (did it)
 *   pmissed  key = "<habitId>:<personId>:<day>"   data = 1            sort = day   (said they didn't)
 *   pwait    key = "<personId>:<habitId>"         data = 1            (answered before deciding on a profile)
 *   people   key = person id                      data = Person
 *   pasked   key = habit id                       data = the day of its latest check-in (before 4.0.0;
 *            read once more to close that poll, then removed)
 *   batches  key = "<group key>:<morning|evening>" data = Sent: the day that check-in last went
 *            out there and the refs of its polls ("" is the main group)
 */

export interface Pact {
  name: string;
  created: number;
  closed?: boolean;
}

export interface PactHabit {
  pact: string;
  name: string;
  createdDay: string;
  archived: boolean;
  /** An hour that says which check-in it is in (before noon: morning, else evening); unset: the default one. */
  hour?: number | null;
  /** Weekdays it's due on, 0 Sunday to 6 Saturday; unset or null: every day. */
  days?: number[] | null;
  /** Who added it. */
  by: string;
}

interface Join {
  name: string | null;
  /** The first day that counts for them. */
  since: string;
  /** The last day they answered. Someone silent for a week stops counting toward "together". */
  last?: string;
}

interface Person {
  name: string | null;
  /** The day they were offered a profile. Asked once, ever. */
  asked?: string;
  /** true: said yes. false: said not now. */
  profile?: boolean;
  /** Someone else voted on their offer and was told it needs their own consent (said once). */
  told?: boolean;
}

export interface PactRef {
  pact: string;
  habitId: string;
  day: string;
}
interface OfferRef {
  offer: string;
}

/**
 * A check-in with several habits: one poll (or more, twelve habits each) where every habit done
 * is ticked. `ids` are the habits in the order of the poll's options: "h:<id>" one of the
 * owner's own, "p:<id>" one kept in a group. `group`: the pact's key, "" for the main group.
 */
export interface BatchRef {
  batch: Batch;
  day: string;
  group: string;
  part: number;
  ids: string[];
  /** Someone besides the owner takes part: nothing is posted back, the poll shows who did what. */
  shared: boolean;
}
export const isBatchRef = (r: unknown): r is BatchRef =>
  !!r && typeof r === "object" && typeof (r as BatchRef).batch === "string" && typeof (r as BatchRef).day === "string" && Array.isArray((r as BatchRef).ids);

/** What a check-in last sent to a group: the day, and its polls' refs (closed when the next one goes). */
export interface Sent {
  day: string;
  refs: Json[];
}

export const isPactRef = (r: unknown): r is PactRef =>
  !!r && typeof r === "object" && typeof (r as PactRef).pact === "string" && typeof (r as PactRef).habitId === "string" && typeof (r as PactRef).day === "string";
export const isOfferRef = (r: unknown): r is OfferRef => !!r && typeof r === "object" && typeof (r as OfferRef).offer === "string";

/** What pacts borrow from the private habits' parsing, handed over by index.ts. */
export interface Tools {
  splitAdd(raw: string): { name: string; hour: number | null; days: number[] | null | undefined };
  parseHour(text: string): number | null;
  scanHour(text: string): number | undefined;
  habitName(text: string): string;
}

/** The owner's place among a private habit's people (their own days aren't kept under a person id). */
export const OWNER = "@owner";
const MAX_PACTS = 10;
const MAX_PACT_HABITS = 12;
/** Days without an answer after which someone stops counting toward the together streak. */
const QUIET_DAYS = 7;
/** The most characters a poll's question may have. */
export const POLL_LIMIT = 255;

export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/, "");
}

const first = (name: string | null) => (name ?? "").trim().split(/\s+/)[0] || null;

type Row = { id: string; habit: PactHabit };

async function habitsOf(kit: Kit, pact: string): Promise<Row[]> {
  return (await kit.store.list<PactHabit>("phabits")).filter((h) => h.data.pact === pact && !h.data.archived).map((h) => ({ id: h.key, habit: h.data }));
}

function find(list: Row[], which: string): Row | undefined {
  const n = Number(which.replace(/^#/, ""));
  if (Number.isInteger(n) && n >= 1 && n <= list.length) return list[n - 1];
  const w = which.toLowerCase();
  return list.find((h) => h.habit.name.toLowerCase() === w) ?? list.find((h) => h.habit.name.toLowerCase().startsWith(w)) ?? list.find((h) => h.habit.name.toLowerCase().includes(w));
}

async function joinsOf(kit: Kit, habitId: string): Promise<{ id: string; join: Join }[]> {
  return (await kit.store.list<Join>("pjoins", { prefix: `${habitId}:` })).map((j) => ({ id: j.key.slice(habitId.length + 1), join: j.data }));
}

async function daysOf(kit: Kit, habitId: string, personId: string): Promise<Set<string>> {
  const prefix = `${habitId}:${personId}:`;
  return new Set((await kit.store.list("plogs", { prefix })).map((l) => l.key.slice(prefix.length)));
}

async function setDay(kit: Kit, habitId: string, personId: string, day: string, state: "done" | "missed" | null) {
  const key = `${habitId}:${personId}:${day}`;
  if (state === "done") await kit.store.put("plogs", key, 1, day);
  else await kit.store.delete("plogs", key);
  if (state === "missed") await kit.store.put("pmissed", key, 1, day);
  else await kit.store.delete("pmissed", key);
}

/** Is this person's streak kept? The pact's owner, anyone with a profile, anyone who said yes here. */
async function tracked(kit: Kit, sender: Sender): Promise<boolean> {
  if (sender.owner || sender.profile === true) return true;
  return (await kit.store.get<Person>("people", sender.id))?.profile === true;
}

async function join(kit: Kit, habitId: string, sender: Pick<Sender, "id" | "name">, day: string) {
  const key = `${habitId}:${sender.id}`;
  const old = await kit.store.get<Join>("pjoins", key);
  const next: Join = old ? { ...old, name: sender.name ?? old.name, last: day } : { name: sender.name, since: day, last: day };
  await kit.store.put("pjoins", key, next as unknown as Json);
}

/**
 * Someone is taking part in a habit (added it, answered it, said "join"). If their streak is
 * kept, they're in. If not, what they did waits on their answer to the profile offer, which
 * goes out the first time.
 */
async function involve(kit: Kit, pact: string | null, habitId: string, sender: Sender, day: string) {
  // Everyone who takes part is counted, profile or not: their streak shows with everyone else's.
  await join(kit, habitId, sender, day);
  if (await tracked(kit, sender)) return;
  const person = (await kit.store.get<Person>("people", sender.id)) ?? { name: sender.name };
  if (person.asked) return;
  await kit.store.put("people", sender.id, { ...person, name: sender.name, asked: kit.today } as unknown as Json);
  const who = first(sender.name);
  const ref: OfferRef = { offer: sender.id };
  // One poll, with their WhatsApp name. No bold: a poll's question shows the asterisks.
  kit.ask(
    copy.offer({ name: who ? who.slice(0, 40) : null }),
    OFFER_OPTIONS,
    { ref: ref as unknown as Json, ...(pact ? { group: pact } : {}), confirm: false },
  );
}

/** What someone answered before 3.5.0 while deciding on a profile now simply counts. */
async function settleWaiting(kit: Kit, sender: Sender) {
  const prefix = `${sender.id}:`;
  for (const w of await kit.store.list("pwait", { prefix })) {
    const habitId = w.key.slice(prefix.length);
    const days = [...(await daysOf(kit, habitId, sender.id))].sort();
    const key = `${habitId}:${sender.id}`;
    if (!(await kit.store.get("pjoins", key))) await kit.store.put("pjoins", key, { name: sender.name, since: days[0] ?? kit.today, last: kit.today } as unknown as Json);
    await kit.store.delete("pwait", w.key);
  }
}

/** They said yes to a profile of their own: Zelfred records it, and they can log in and see their streak. */
async function accept(kit: Kit, sender: Sender) {
  await kit.signUp(sender.id);
  const person = (await kit.store.get<Person>("people", sender.id)) ?? { name: sender.name };
  await kit.store.put("people", sender.id, { ...person, name: sender.name, profile: true } as unknown as Json);
  await settleWaiting(kit, sender);
}

/** They said not now: no profile, and they aren't asked again. Their streak is kept all the same. */
async function decline(kit: Kit, sender: Sender) {
  const person = (await kit.store.get<Person>("people", sender.id)) ?? { name: sender.name };
  await kit.store.put("people", sender.id, { ...person, name: sender.name, profile: false } as unknown as Json);
  await settleWaiting(kit, sender);
}

/** Does anyone still do this habit? One nobody does is stopped: there is no one left to ask. */
async function stopIfEmpty(kit: Kit, id: string) {
  if ((await kit.store.list("pjoins", { prefix: `${id}:`, limit: 1 })).length) return;
  const habit = await kit.store.get<PactHabit>("phabits", id);
  if (habit && !habit.archived) await kit.store.put("phabits", id, { ...habit, archived: true } as unknown as Json);
}

/** Step out of a habit. "Stop" means this too: it stops for the one who says it, not for everyone. */
async function leave(kit: Kit, id: string, personId: string) {
  await kit.store.delete("pjoins", `${id}:${personId}`);
  await kit.store.delete("pwait", `${personId}:${id}`);
  await stopIfEmpty(kit, id);
}

export interface Standing {
  id: string;
  name: string | null;
  streak: number;
  total: number;
  done: Set<string>;
}

/**
 * How a habit stands: each person's streak, and the together streak, which counts the days
 * everyone doing it said yes. A person counts from the day they joined, and stops counting
 * once they've been silent for a week, so one who drifted off doesn't hold the rest at zero.
 */
export async function standings(
  kit: Kit,
  id: string,
  days: number[] | null | undefined,
  /** For a habit in the private group: its owner, whose days are kept with the private habits. */
  owner?: { name: string | null; since: string; done: Set<string> },
): Promise<{ people: Standing[]; together: number }> {
  const habit = { days };
  const joins = await joinsOf(kit, id);
  const people: Standing[] = [];
  for (const j of joins) {
    const done = await daysOf(kit, id, j.id);
    people.push({ id: j.id, name: j.join.name, streak: streak(done, kit.today, habit.days), total: done.size, done });
  }
  if (owner) {
    // The owner always counts: it is their habit, and they are asked every day.
    joins.push({ id: OWNER, join: { name: owner.name, since: owner.since, last: kit.today } });
    people.push({ id: OWNER, name: owner.name, streak: streak(owner.done, kit.today, habit.days), total: owner.done.size, done: owner.done });
  }
  const counts = (j: Join, day: string) => j.since <= day && (j.last ?? j.since) >= kit.time.shiftDay(day, -QUIET_DAYS);
  const all = new Set<string>();
  for (const p of people) for (const d of p.done) all.add(d);
  const together = new Set<string>();
  for (const day of all) {
    const due = joins.filter((j) => counts(j.join, day));
    if (due.length && due.every((j) => people.find((p) => p.id === j.id)!.done.has(day))) together.add(day);
  }
  people.sort((a, b) => b.streak - a.streak || (a.name ?? "").localeCompare(b.name ?? ""));
  return { people, together: streak(together, kit.today, habit.days) };
}

/** A group's habits as its summary shows them: when each is asked, and how everyone stands. */
async function forSummary(kit: Kit, list: Row[]): Promise<GroupHabit[]> {
  const out: GroupHabit[] = [];
  for (const { id, habit } of list) {
    const s = await standings(kit, id, habit.days);
    out.push({ name: habit.name, hour: typeof habit.hour === "number" ? habit.hour : null, days: habit.days, together: s.together, people: s.people.map((p) => ({ name: p.name, streak: p.streak })) });
  }
  return out;
}

async function summary(kit: Kit, pact: string, name: string): Promise<string> {
  const list = await habitsOf(kit, pact);
  if (!list.length) return copy.groupNoHabits({ group: name });
  return copy.groupSummary({ group: name, habits: await forSummary(kit, list) });
}

function may(habit: PactHabit, sender: Sender): boolean {
  return sender.owner || habit.by === sender.id;
}

async function addHabit(kit: Kit, pact: string, sender: Sender, name: string, hour: number | null, days: number[] | null | undefined): Promise<string | null> {
  const list = await habitsOf(kit, pact);
  const same = list.find((h) => h.habit.name.toLowerCase() === name.toLowerCase());
  if (same) {
    await involve(kit, pact, same.id, sender, kit.today);
    return null;
  }
  if (list.length >= MAX_PACT_HABITS) return copy.groupIsFull({ max: MAX_PACT_HABITS });
  const id = kit.id();
  const habit: PactHabit = { pact, name, createdDay: kit.today, archived: false, hour, days: days ?? null, by: sender.id };
  await kit.store.put("phabits", id, habit as unknown as Json, kit.now);
  await involve(kit, pact, id, sender, kit.today);
  return null;
}

/** "Set me up": someone who said not now, or was never asked, wants their streak kept after all. */
async function setUp(kit: Kit, sender: Sender): Promise<void> {
  if (await tracked(kit, sender)) return kit.react(SAVED);
  await accept(kit, sender);
  kit.close({ offer: sender.id });
  kit.send(copy.setUp({ name: first(sender.name) }));
}

/**
 * The habit messages that work the same in every group, from anyone in it: add a habit, log
 * it, join or leave it, and (for whoever added it, or the group's owner) stop it or change
 * when it's asked. Returns false when `text` is none of these.
 */
async function habitCommands(kit: Kit, pact: string, sender: Sender, text: string, tools: Tools): Promise<boolean> {
  const list = await habitsOf(kit, pact);
  const missing = (which: string) => kit.send(copy.cantFindHere({ which }));

  let m = text.match(/^(?:done|did|logged?|✅)\s+(.+)$/i);
  if (m) {
    const h = find(list, m[1].trim());
    if (!h) return missing(m[1].trim()), true;
    await involve(kit, pact, h.id, sender, kit.today);
    await setDay(kit, h.id, sender.id, kit.today, "done");
    return kit.react(LOGGED), true;
  }
  m = text.match(/^(?:undo|undone|not done)\s+(.+)$/i);
  if (m) {
    const h = find(list, m[1].trim());
    if (!h) return missing(m[1].trim()), true;
    await setDay(kit, h.id, sender.id, kit.today, null);
    return kit.react(SAVED), true;
  }
  m = text.match(/^(?:join|i'?m in(?: for| on)?|count me in(?: for| on)?)\s+(.+)$/i);
  if (m) {
    const h = find(list, m[1].trim());
    if (!h) return missing(m[1].trim()), true;
    await involve(kit, pact, h.id, sender, kit.today);
    return kit.react(SAVED), true;
  }
  // "leave gym" and "stop gym" are the same: the habit stops for whoever says it. It goes on
  // for the others, and is stopped altogether only when nobody does it any more.
  m = text.match(/^(?:leave|i'?m out(?: of)?|drop out of|stop|remove|delete|drop|quit|end)\s+(?:habit\s+)?(.+)$/i);
  if (m) {
    const h = find(list, m[1].trim());
    if (!h) return missing(m[1].trim()), true;
    await leave(kit, h.id, sender.id);
    return kit.react(SAVED), true;
  }
  const tm = text.match(/^(?:time|check[- ]?in|reminder)\s+(.+?)\s+(?:at\s+|in the\s+)?(default|reset|mornings?|evenings?|nights?|\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?)$/i);
  if (tm) {
    const h = find(list, tm[1].trim());
    if (!h) return missing(tm[1].trim()), true;
    if (!may(h.habit, sender)) return kit.send(copy.notYoursTime({ habit: h.habit.name, owner: first(kit.person.name) })), true;
    const hour = /^(default|reset)$/i.test(tm[2]) ? null : (batchWord(tm[2]) ?? tools.parseHour(tm[2]));
    if (hour === null && !/^(default|reset)$/i.test(tm[2])) return kit.send(copy.giveHabitTimeFor({ habit: h.habit.name })), true;
    await kit.store.put("phabits", h.id, { ...h.habit, hour } as unknown as Json);
    return kit.react(SAVED), true;
  }
  const dm = text.match(/^days?\s+(.+)$/i);
  if (dm) {
    const words = dm[1].trim().split(/\s+/);
    for (let k = 1; k < words.length; k++) {
      const parsed = parseDays(words.slice(k).join(" "));
      if (parsed === undefined) continue;
      const h = find(list, words.slice(0, k).join(" "));
      if (!h) return missing(words.slice(0, k).join(" ")), true;
      if (!may(h.habit, sender)) return kit.send(copy.notYoursDays({ habit: h.habit.name, owner: first(kit.person.name) })), true;
      await kit.store.put("phabits", h.id, { ...h.habit, days: parsed } as unknown as Json);
      return kit.react(SAVED), true;
    }
    return kit.send(copy.tellDaysHere()), true;
  }
  m = text.match(/^(?:add|new|start|track|habit)\s*:?\s+(.+)$/i);
  if (m) {
    const { name: raw, hour, days } = tools.splitAdd(m[1]);
    const name = cleanName(raw);
    if (!name) return kit.send(copy.nameTheHabitHere()), true;
    const problem = await addHabit(kit, pact, sender, name, hour, days);
    return problem ? kit.send(problem) : kit.react(SAVED), true;
  }
  return false;
}

const SET_UP = /^(?:(?:please\s+)?(?:hook|set|sign) me up|count me in|set (?:it|my profile) up(?: for me)?|set up my profile)$/;
const STANDINGS = /^(habits|list|streaks?|show|status|score|scores|standings)$/;

/** A message in one of the extra habit groups. Everyone there is on the same footing. */
export async function pactMessage(event: MessageEvent, kit: Kit, tools: Tools): Promise<void> {
  const pact = event.group!;
  const p = await kit.store.get<Pact>("pacts", pact);
  const sender = event.sender;
  if (!p || p.closed || !sender) return;
  const text = event.text.trim();
  const lower = text.toLowerCase().replace(/[!.]+$/, "");
  if (STANDINGS.test(lower)) return kit.send(await summary(kit, pact, p.name));
  if (SET_UP.test(lower)) return setUp(kit, sender);
  // A group of one's own is made from one's own Zelfred, which means logging in first.
  if (!sender.owner && OWN_GROUP.test(lower)) return kit.send(copy.ownGroup());
  if (await habitCommands(kit, pact, sender, text, tools)) return;
  kit.unsure(copy.unsureInGroup());
}

const OWN_GROUP = /^(?:(?:can i |i want to |i'?d like to )?(?:new|make|create|start|get|have)\s+(?:a\s+|my\s+|my own\s+|an?\s+own\s+)?(?:pact|group|habits?)(?:\s+of my own|\s+for me|\s+for myself)?|my own (?:group|pact|habits?))\b/;

/** The main Habits group's key among the extra-habit records: habits friends added there. */
export const MAIN = "";

/**
 * A friend in someone's main Habits group. They can take part in any of that person's habits
 * and add habits of their own there. What the owner added stays the owner's to change.
 */
export async function friendMessage(event: MessageEvent, kit: Kit, tools: Tools, list: { id: string; name: string }[], summary: () => Promise<string>): Promise<void> {
  const sender = event.sender!;
  const text = event.text.trim();
  const lower = text.toLowerCase().replace(/[!.]+$/, "");
  if (STANDINGS.test(lower)) return kit.send(await summary());
  if (SET_UP.test(lower)) return setUp(kit, sender);
  if (OWN_GROUP.test(lower)) return kit.send(copy.ownGroup());
  const pick = (which: string) => {
    const w = which.toLowerCase();
    return list.find((h) => h.name.toLowerCase() === w) ?? list.find((h) => h.name.toLowerCase().startsWith(w)) ?? list.find((h) => h.name.toLowerCase().includes(w));
  };
  // One of the owner's own habits: a friend can do it and log it, not change it.
  let m = text.match(/^(?:done|did|logged?|✅)\s+(.+)$/i);
  let h = m ? pick(m[1].trim()) : undefined;
  if (m && h) {
    await involve(kit, null, h.id, sender, kit.today);
    await setDay(kit, h.id, sender.id, kit.today, "done");
    return kit.react(LOGGED);
  }
  m = text.match(/^(?:undo|undone|not done)\s+(.+)$/i);
  h = m ? pick(m[1].trim()) : undefined;
  if (m && h) {
    await setDay(kit, h.id, sender.id, kit.today, null);
    return kit.react(SAVED);
  }
  m = text.match(/^(?:join|i'?m in(?: for| on)?|count me in(?: for| on)?)\s+(.+)$/i);
  h = m ? pick(m[1].trim()) : undefined;
  if (m && h) {
    await involve(kit, null, h.id, sender, kit.today);
    return kit.react(SAVED);
  }
  m = text.match(/^(?:leave|i'?m out(?: of)?|drop out of|stop|remove|delete|drop|quit|end)\s+(?:habit\s+)?(.+)$/i);
  h = m ? pick(m[1].trim()) : undefined;
  if (m && h) {
    // It stops for them. It is the owner's habit, so it goes on for the owner.
    await kit.store.delete("pjoins", `${h.id}:${sender.id}`);
    await kit.store.delete("pwait", `${sender.id}:${h.id}`);
    return kit.react(SAVED);
  }
  m = text.match(/^(?:time|check[- ]?in|reminder)\s+(.+?)\s+(?:at\s+|in the\s+)?(?:default|reset|mornings?|evenings?|nights?|\d.*)$/i);
  h = m ? pick(m[1].trim()) : undefined;
  if (m && h) return kit.send(copy.ownersHabit({ habit: h.name, owner: first(kit.person.name) }));
  // Adding one that is already here means doing it too.
  m = text.match(/^(?:add|new|start|track|habit)\s*:?\s+(.+)$/i);
  if (m) {
    const name = cleanName(tools.splitAdd(m[1]).name);
    const same = list.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (same) {
      await involve(kit, null, same.id, sender, kit.today);
      return kit.react(SAVED);
    }
  }
  // Anything else about a habit: the ones friends added here, or a new one of their own.
  if (await habitCommands(kit, MAIN, sender, text, tools)) return;
  kit.unsure(copy.unsureFriend());
}

/** A plain sentence from a friend in someone's main Habits group. */
export async function friendIntent(event: IntentEvent, kit: Kit, tools: Tools, list: { id: string; name: string }[], summary: () => Promise<string>): Promise<void> {
  const sender = event.sender!;
  if (event.intent === "set_me_up") return setUp(kit, sender);
  if (event.intent === "list" || event.intent === "help") return kit.send(await summary());
  const extra = (await habitsOf(kit, MAIN)).map((x) => ({ id: x.id, name: x.habit.name }));
  if (event.intent === "add_habit") {
    const name = tools.habitName(event.text);
    if (!name) return kit.send(copy.whatToCallIt());
    const same = list.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (same) await involve(kit, null, same.id, sender, kit.today);
    else {
      const problem = await addHabit(kit, MAIN, sender, name, tools.scanHour(event.text) ?? null, scanDays(event.text));
      if (problem) return kit.send(problem);
    }
    return kit.react(SAVED);
  }
  if (event.intent === "log_done" || event.intent === "missed" || event.intent === "undo_done") {
    const lower = event.text.toLowerCase();
    const all = [...list, ...extra];
    const named = all.filter((x) => lower.includes(x.name.toLowerCase()));
    const h = named.length === 1 ? named[0] : all.length === 1 ? all[0] : undefined;
    if (!h) return kit.send(copy.whichHabit());
    if (event.intent !== "undo_done") await involve(kit, null, h.id, sender, kit.today);
    await setDay(kit, h.id, sender.id, kit.today, event.intent === "log_done" ? "done" : event.intent === "missed" ? "missed" : null);
    return kit.react(event.intent === "log_done" ? LOGGED : SAVED);
  }
  kit.send(await summary());
}

/**
 * The owner, in their main group, talking about a habit a friend added there. Their own
 * habits are handled by the private commands; this catches the rest. Returns false when the
 * message names none of the friends' habits.
 */
export async function ownerOnExtra(event: MessageEvent, kit: Kit, tools: Tools, own: string[]): Promise<boolean> {
  const sender = event.sender;
  if (!sender) return false;
  const text = event.text.trim();
  const lower = text.toLowerCase();
  if (!/^(?:done|did|logged?|✅|undo|undone|not done|join|leave|stop|remove|delete|drop|quit|end|time|days?|check[- ]?in|reminder)\b/.test(lower)) return false;
  const extra = await habitsOf(kit, MAIN);
  const named = extra.some((x) => lower.includes(x.habit.name.toLowerCase())) && !own.some((n) => lower.includes(n.toLowerCase()));
  return named ? habitCommands(kit, MAIN, sender, text, tools) : false;
}

/** The habits friends added in the main group, for its summary. */
export async function extraHabits(kit: Kit): Promise<GroupHabit[]> {
  return forSummary(kit, await habitsOf(kit, MAIN));
}

/** A friend's tap on one of the owner's private check-in polls: they are doing that habit too. */
export async function friendAnswer(event: AnswerEvent, kit: Kit, habitId: string, day: string): Promise<void> {
  const sender = event.sender!;
  await involve(kit, null, habitId, sender, day);
  await setDay(kit, habitId, sender.id, day, event.choice === 0 ? "done" : "missed");
}

/** Someone ticked one of the owner's own habits on a shared poll, or took the tick back: they are doing it too. */
export async function friendTick(kit: Kit, sender: Sender, habitId: string, day: string, done: boolean): Promise<void> {
  if (done) await involve(kit, null, habitId, sender, day);
  await setDay(kit, habitId, sender.id, day, done ? "done" : null);
}

/** A tick on a habit kept in a group (a pact's, or one a friend added to the main group), or the tick taken back. */
export async function groupTick(kit: Kit, group: string, habitId: string, sender: Sender, day: string, done: boolean): Promise<void> {
  const habit = await kit.store.get<PactHabit>("phabits", habitId);
  if (!habit || habit.archived || habit.pact !== group) return;
  if (done) await involve(kit, group || null, habitId, sender, day);
  await setDay(kit, habitId, sender.id, day, done ? "done" : null);
}

/** One habit of a check-in: what its tick is stored under, and how it reads on the poll. */
export interface Due {
  /** "h:<id>" or "p:<id>", as in a BatchRef. */
  id: string;
  name: string;
  label: string;
}

/** The habits kept in a group that this check-in asks about today. */
export async function dueInGroup(kit: Kit, group: string, batch: Batch): Promise<Due[]> {
  const fallback = typeof kit.settings.checkinHour === "number" ? kit.settings.checkinHour : null;
  const out: Due[] = [];
  for (const { id, habit } of await habitsOf(kit, group)) {
    if (batchOf(typeof habit.hour === "number" ? habit.hour : fallback) !== batch) continue;
    if (!isOn(habit.days, kit.today)) continue;
    // The poll of before 4.0.0, one per habit, stops taking answers now.
    const old = await kit.store.get<string>("pasked", id);
    if (old) {
      if (old !== kit.today) kit.close({ pact: group, habitId: id, day: old });
      await kit.store.delete("pasked", id);
    }
    const s = await standings(kit, id, habit.days);
    out.push({ id: `p:${id}`, name: habit.name, label: copy.checkinOption({ habit: habit.name, streak: null, together: s.people.length > 1 ? s.together : null }) });
  }
  return out;
}

/** Options can't repeat on a poll: a second habit that reads the same gets a number. */
export function distinct(labels: string[]): string[] {
  const seen = new Map<string, number>();
  return labels.map((l) => {
    const k = l.trim().toLowerCase();
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return n === 1 ? l : `${l.slice(0, 96)} (${n})`;
  });
}

/**
 * Send a check-in's polls for several habits: twelve to a poll. Returns their refs, to close
 * when the next one goes out.
 */
export function askBatch(kit: Kit, group: string, batch: Batch, due: Due[], shared: boolean): Json[] {
  const refs: Json[] = [];
  // Split evenly, so no poll is left with a single habit (a poll needs two options).
  const parts = Math.ceil(due.length / 12);
  const size = Math.ceil(due.length / parts);
  for (let i = 0; i < parts; i++) {
    const page = due.slice(i * size, (i + 1) * size);
    const ref: BatchRef = { batch, day: kit.today, group, part: i, ids: page.map((d) => d.id), shared };
    kit.ask(copy.checkinBatch({ batch, simple: kit.settings.quickLog === true, part: i + 1, parts }), distinct(page.map((d) => d.label)), {
      multiple: true,
      ref: ref as unknown as Json,
      ...(group ? { group } : {}),
    });
    refs.push(ref as unknown as Json);
  }
  return refs;
}

/**
 * Has this check-in gone out to the group today? If not, the polls of the last one stop
 * taking answers (they stay in the chat) and the caller sends today's.
 */
export async function openBatch(kit: Kit, group: string, batch: Batch): Promise<boolean> {
  const last = await kit.store.get<Sent>("batches", `${group}:${batch}`);
  if (last?.day === kit.today) return false;
  for (const ref of last?.refs ?? []) kit.close(ref);
  return true;
}

export async function sentBatch(kit: Kit, group: string, batch: Batch, refs: Json[]): Promise<void> {
  await kit.store.put("batches", `${group}:${batch}`, { day: kit.today, refs } as unknown as Json, kit.today);
}

/** Does anyone besides the owner take part in this habit? */
export async function hasFriends(kit: Kit, habitId: string): Promise<boolean> {
  return (await kit.store.list("pjoins", { prefix: `${habitId}:`, limit: 1 })).length > 0;
}

/** The standings as a check-in's question shows them: everyone by their first name. */
export function forPoll(s: { people: Standing[]; together: number }): { together: number; people: Streaker[] } {
  return { together: s.together, people: s.people.map((x) => ({ name: first(x.name), streak: x.streak })) };
}

/**
 * What a friend sees on the web once they log in: every habit they take part in, in pacts and
 * in other people's Habits groups, with their own days and how everyone stands.
 */
export async function forFriend(kit: Kit, sender: Sender, days: number, privateHabits: { id: string; name: string; days: number[] | null | undefined; since: string; done: Set<string> }[]): Promise<Json> {
  const from = kit.time.shiftDay(kit.today, -(days - 1));
  const mine = (s: { people: Standing[]; together: number }) => {
    const me = s.people.find((p) => p.id === sender.id);
    return me
      ? { streak: me.streak, total: me.total, doneDays: [...me.done].filter((d) => d >= from).sort(), together: s.together, people: s.people.map((p) => ({ name: p.id === sender.id ? null : p.name, me: p.id === sender.id, streak: p.streak })) }
      : null;
  };
  const groups: { key: string | null; name: string; habits: unknown[] }[] = [];
  const own = [];
  for (const h of privateHabits) {
    const m = mine(await standings(kit, h.id, h.days, { name: kit.person.name, since: h.since, done: h.done }));
    if (m) own.push({ id: h.id, name: h.name, ...m });
  }
  for (const { id, habit } of await habitsOf(kit, MAIN)) {
    const m = mine(await standings(kit, id, habit.days));
    if (m) own.push({ id, name: habit.name, ...m });
  }
  if (own.length) groups.push({ key: null, name: `${first(kit.person.name) ? `${first(kit.person.name)}'s` : "A friend's"} habits`, habits: own });
  for (const p of await kit.store.list<Pact>("pacts")) {
    if (p.data.closed) continue;
    const habits = [];
    for (const { id, habit } of await habitsOf(kit, p.key)) {
      const m = mine(await standings(kit, id, habit.days));
      if (m) habits.push({ id, name: habit.name, ...m });
    }
    if (habits.length) groups.push({ key: p.key, name: p.data.name, habits });
  }
  return { today: kit.today, groups } as unknown as Json;
}

/** A plain sentence in a pact's group, once the intent model has read it. */
export async function pactIntent(event: IntentEvent, kit: Kit, tools: Tools): Promise<void> {
  const pact = event.group!;
  const p = await kit.store.get<Pact>("pacts", pact);
  const sender = event.sender;
  if (!p || p.closed || !sender) return;
  const list = await habitsOf(kit, pact);
  if (event.intent === "set_me_up") return setUp(kit, sender);
  if (event.intent === "add_habit") {
    const name = tools.habitName(event.text);
    if (!name) return kit.send(copy.whatToCallIt());
    const problem = await addHabit(kit, pact, sender, name, tools.scanHour(event.text) ?? null, scanDays(event.text));
    return problem ? kit.send(problem) : kit.react(SAVED);
  }
  const lower = event.text.toLowerCase();
  const named = list.filter((x) => lower.includes(x.habit.name.toLowerCase()));
  const h = named.length === 1 ? named[0] : list.length === 1 ? list[0] : undefined;
  if (event.intent === "log_done" || event.intent === "missed" || event.intent === "undo_done") {
    if (!h) return kit.send(list.length ? copy.whichHabit() : copy.noHabitsHere());
    if (event.intent !== "undo_done") await involve(kit, pact, h.id, sender, kit.today);
    await setDay(kit, h.id, sender.id, kit.today, event.intent === "log_done" ? "done" : event.intent === "missed" ? "missed" : null);
    return kit.react(event.intent === "log_done" ? LOGGED : SAVED);
  }
  // Everything else: show where the pact stands, which answers most questions asked here.
  kit.send(await summary(kit, pact, p.name));
}

/** An answer to one of a pact's polls: a check-in, or the profile offer. Nothing is posted back for a check-in. */
export async function pactAnswer(event: AnswerEvent, kit: Kit): Promise<void> {
  const sender = event.sender;
  if (!sender) return;
  const ref = event.ref;
  if (isOfferRef(ref)) {
    // The offer is one person's to answer; a tap from anyone else on it is not theirs to give.
    if (sender.id !== ref.offer) {
      const them = await kit.store.get<Person>("people", ref.offer);
      if (!them || them.told) return;
      await kit.store.put("people", ref.offer, { ...them, told: true } as unknown as Json);
      const name = first(them.name);
      kit.send(copy.needsConsent({ name }));
      return;
    }
    if (event.choice === 0) {
      await accept(kit, sender);
      kit.send(copy.setUp({ name: first(sender.name) }));
    } else {
      await decline(kit, sender);
      kit.send(copy.notNow({ name: first(sender.name) }));
    }
    kit.close(ref as unknown as Json);
    return;
  }
  if (!isPactRef(ref)) return;
  const habit = await kit.store.get<PactHabit>("phabits", ref.habitId);
  if (!habit || habit.archived || habit.pact !== ref.pact) return;
  await involve(kit, ref.pact, ref.habitId, sender, ref.day);
  await setDay(kit, ref.habitId, sender.id, ref.day, event.choice === 0 ? "done" : "missed");
}

/** One habit of a group on its own: a poll needs two options, so it is asked with Yes or No. */
export function askOne(kit: Kit, group: string, habitId: string, question: string): Json {
  const ref: PactRef = { pact: group, habitId, day: kit.today };
  // Always kept: the poll is how everyone sees who did it.
  kit.ask(question, CHECKIN_OPTIONS, { ref: ref as unknown as Json, ...(group ? { group } : {}), keep: true });
  return ref as unknown as Json;
}

/** A group habit's Yes or No question, with how everyone stands. */
export async function oneQuestion(kit: Kit, id: string): Promise<string> {
  const habit = (await kit.store.get<PactHabit>("phabits", id))!;
  return copy.checkinTogether({ habit: habit.name, ...forPoll(await standings(kit, id, habit.days)), limit: POLL_LIMIT });
}

/** A check-in for the pacts: each group gets one poll with its habits that are due. */
export async function pactCheckins(kit: Kit, batch: Batch): Promise<void> {
  for (const p of await kit.store.list<Pact>("pacts")) {
    if (p.data.closed) continue;
    if (!(await openBatch(kit, p.key, batch))) continue;
    const due = await dueInGroup(kit, p.key, batch);
    const refs = due.length > 1 ? askBatch(kit, p.key, batch, due, true) : due.length ? [askOne(kit, p.key, due[0].id.slice(2), await oneQuestion(kit, due[0].id.slice(2)))] : [];
    await sentBatch(kit, p.key, batch, refs);
  }
}

export async function createPact(kit: Kit, name: string): Promise<{ key: string; name: string } | { error: string }> {
  const clean = name.trim().replace(/\s+/g, " ").replace(/[.!?]+$/, "").slice(0, 22);
  const key = slug(clean);
  if (!key) return { error: copy.nameTheGroup() };
  const old = await kit.store.get<Pact>("pacts", key);
  if (old && !old.closed) return { error: copy.groupExists({ name: old.name }) };
  const open = (await kit.store.list<Pact>("pacts")).filter((x) => !x.data.closed);
  if (!old && open.length >= MAX_PACTS) return { error: copy.tooManyGroups({ max: MAX_PACTS }) };
  const pact: Pact = { name: old?.name ?? clean, created: old?.created ?? kit.now };
  await kit.groups.open(key, {
    name: copy.newGroupName({ name: pact.name }).slice(0, 25),
    hello: copy.newGroupHello({ name: pact.name }),
  });
  await kit.store.put("pacts", key, pact as unknown as Json, pact.created);
  return { key, name: pact.name };
}

/**
 * A WhatsApp group the person already had becomes a habit group (`joined`), or stops being one
 * (`left`). Zelfred made the key; the group keeps its own name and its own people.
 */
export async function existingGroup(kit: Kit, kind: "joined" | "left", key: string, name: string): Promise<void> {
  const old = await kit.store.get<Pact>("pacts", key);
  if (kind === "left") {
    // Their days and habits are kept, as when a group is closed.
    if (old && !old.closed) await kit.store.put("pacts", key, { ...old, closed: true } as unknown as Json, old.created);
    return;
  }
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 40) || copy.groupWithoutName();
  const pact: Pact = { name: clean, created: old?.created ?? kit.now };
  await kit.store.put("pacts", key, pact as unknown as Json, pact.created);
  kit.send(copy.existingGroupHello());
}

/** A group's key from what the person called it: the key itself for groups made here, the name for ones they already had. */
async function keyFor(kit: Kit, said: string): Promise<string> {
  const key = slug(said);
  if (await kit.store.get<Pact>("pacts", key)) return key;
  const byName = (await kit.store.list<Pact>("pacts")).find((x) => !x.data.closed && slug(x.data.name) === key);
  return byName?.key ?? key;
}

export async function closePact(kit: Kit, key: string): Promise<Pact | null> {
  const pact = await kit.store.get<Pact>("pacts", key);
  if (!pact || pact.closed) return null;
  await kit.groups.close(key);
  await kit.store.put("pacts", key, { ...pact, closed: true } as unknown as Json, pact.created);
  return pact;
}

/** The owner's messages about habit groups, in their main Habits group. Returns false when `text` isn't one. */
export async function privatePact(kit: Kit, text: string, lower: string): Promise<boolean> {
  const GROUP = "(?:habit\\s+)?(?:group|pact)";
  let m = text.match(new RegExp(`^(?:new|add|create|make|start)\\s+(?:a\\s+|another\\s+)?${GROUP}\\s+(?:(?:for|called|named|with)\\s+)?(.+)$`, "i"));
  if (m) {
    const made = await createPact(kit, m[1]);
    kit.send("error" in made ? made.error : copy.makingGroup({ name: made.name }));
    return true;
  }
  if (/^(groups|my groups|habit groups|pacts|my pacts)$/.test(lower)) {
    const open = (await kit.store.list<Pact>("pacts")).filter((x) => !x.data.closed);
    if (!open.length) kit.send(copy.onlyThisGroup());
    else {
      const groups = [];
      for (const p of open) groups.push({ name: p.data.name, habits: (await habitsOf(kit, p.key)).length });
      kit.send(copy.groupList({ groups }));
    }
    return true;
  }
  m = lower.match(new RegExp(`^(?:close|end|delete|remove)\\s+(?:the\\s+)?${GROUP}\\s+(.+)$`));
  if (m) {
    const closed = await closePact(kit, await keyFor(kit, m[1]));
    kit.send(closed ? copy.groupClosed({ name: closed.name }) : copy.noSuchGroup({ name: m[1] }));
    return true;
  }
  return false;
}

/** The habit groups for the web page: each with its habits, who is doing them and how they stand. */
export async function pactsForWeb(kit: Kit, days: number): Promise<Json> {
  const from = kit.time.shiftDay(kit.today, -(days - 1));
  const out = [];
  const groups = [{ key: MAIN, name: "Habits", closed: false }, ...(await kit.store.list<Pact>("pacts")).map((x) => ({ key: x.key, name: x.data.name, closed: !!x.data.closed }))];
  for (const p of groups) {
    const habits = [];
    for (const { id, habit } of await habitsOf(kit, p.key)) {
      const s = await standings(kit, id, habit.days);
      // The owner's own side of it, for their card on the page: there even before they take part.
      const me = kit.person.id ?? "";
      const mine = s.people.find((x) => x.id === me);
      habits.push({
        id,
        name: habit.name,
        createdDay: habit.createdDay,
        hour: typeof habit.hour === "number" ? habit.hour : null,
        days: habit.days?.length ? habit.days : null,
        together: s.together,
        mine: {
          joined: !!mine,
          streak: mine?.streak ?? 0,
          best: mine ? bestStreak(mine.done, habit.days, kit.today) : 0,
          total: mine?.total ?? 0,
          doneDays: mine ? [...mine.done].filter((d) => d >= from).sort() : [],
        },
        people: s.people.map((x) => ({ id: x.id, name: x.name, me: x.id === me, streak: x.streak, total: x.total, doneDays: [...x.done].filter((d) => d >= from).sort() })),
      });
    }
    // The main group is listed only when friends added habits to it (the owner's own are elsewhere on the page).
    if (p.key === MAIN && !habits.length) continue;
    out.push({ key: p.key || null, name: p.name, closed: p.closed, habits });
  }
  return out as unknown as Json;
}

// ── The owner's own side of a group habit, from the web page ──

async function groupHabit(kit: Kit, id: string): Promise<PactHabit> {
  const habit = await kit.store.get<PactHabit>("phabits", id);
  if (!habit || habit.archived) throw new Error("No such habit.");
  return habit;
}

function me(kit: Kit): { id: string; name: string | null } {
  if (!kit.person.id) throw new Error("That isn't available yet.");
  return { id: kit.person.id, name: kit.person.name };
}

/** Mark one of the owner's own days on a group habit. Doing so means they take part in it. */
export async function ownerDay(kit: Kit, id: string, day: string, done: boolean): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > kit.today) throw new Error("Pick a day up to today.");
  await groupHabit(kit, id);
  const who = me(kit);
  const key = `${id}:${who.id}`;
  const old = await kit.store.get<Join>("pjoins", key);
  // Joining through an earlier day counts from that day.
  const next: Join = old ? { ...old, name: who.name ?? old.name, since: day < old.since ? day : old.since, last: old.last && old.last > day ? old.last : day } : { name: who.name, since: day, last: day };
  await kit.store.put("pjoins", key, next as unknown as Json);
  await setDay(kit, id, who.id, day, done ? "done" : null);
}

export async function ownerJoin(kit: Kit, id: string, on: boolean): Promise<void> {
  await groupHabit(kit, id);
  const who = me(kit);
  if (on) await join(kit, id, who, kit.today);
  else await leave(kit, id, who.id);
}

/** Rename, reschedule or stop a group habit. On the page that is the owner, who may change any habit in their groups. */
export async function ownerChange(kit: Kit, id: string, patch: { name?: string; hour?: number | null; days?: number[] | null; archived?: boolean }): Promise<void> {
  const habit = await groupHabit(kit, id);
  const next = { ...habit };
  if (patch.name !== undefined) {
    const clean = cleanName(patch.name);
    if (!clean) throw new Error("Name the habit.");
    next.name = clean;
  }
  if (patch.hour !== undefined) {
    if (patch.hour !== null && (!Number.isInteger(patch.hour) || patch.hour < 0 || patch.hour > 23)) throw new Error("Pick an hour.");
    next.hour = patch.hour;
  }
  if (patch.days !== undefined) next.days = patch.days;
  if (patch.archived) next.archived = true;
  await kit.store.put("phabits", id, next as unknown as Json);
}
