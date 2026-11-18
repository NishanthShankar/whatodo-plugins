import type { AnswerEvent, IntentEvent, Json, Kit, MessageEvent, Sender } from "../../sdk";
import { cleanName, daysLabel, isOn, parseDays, scanDays, streak } from "./streaks";

/**
 * Pacts: a habit kept together. A pact is its own WhatsApp group (one of the install's extra
 * groups) that the person adds friends, a study partner or a partner to. Anyone there can add
 * a habit, and every day each habit gets one poll for the whole group. WhatsApp shows who
 * tapped what, so the poll is the scoreboard and nothing is posted per answer.
 *
 * Whose answers are kept: the person who made the pact, and anyone with a telcurio profile.
 * Someone without one is offered a profile on their first answer ("you've started forming a
 * habit..."); on their yes their streak is kept from that day, on "not now" what they
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
 *   pasked   key = habit id                       data = the day of its latest check-in
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
  /** Its own check-in hour; unset: the default check-in time. */
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
}

export interface PactRef {
  pact: string;
  habitId: string;
  day: string;
}
interface OfferRef {
  offer: string;
}

export const isPactRef = (r: unknown): r is PactRef =>
  !!r && typeof r === "object" && typeof (r as PactRef).pact === "string" && typeof (r as PactRef).habitId === "string" && typeof (r as PactRef).day === "string";
export const isOfferRef = (r: unknown): r is OfferRef => !!r && typeof r === "object" && typeof (r as OfferRef).offer === "string";

/** What pacts borrow from the private habits' parsing, handed over by index.ts. */
export interface Tools {
  splitAdd(raw: string): { name: string; hour: number | null; days: number[] | null | undefined };
  parseHour(text: string): number | null;
  scanHour(text: string): number | undefined;
  hourLabel(h: number): string;
  habitName(text: string): string;
}

/** The owner's place among a private habit's people (their own days aren't kept under a person id). */
export const OWNER = "@owner";
const MAX_PACTS = 10;
const MAX_PACT_HABITS = 12;
/** Days without an answer after which someone stops counting toward the together streak. */
const QUIET_DAYS = 7;
const CHECKIN = ["Yes", "No"];
const OFFER = ["Yes", "Not now"];

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
  if (await tracked(kit, sender)) return await join(kit, habitId, sender, day);
  const person = (await kit.store.get<Person>("people", sender.id)) ?? { name: sender.name };
  if (person.profile === false) return; // said not now: nothing of theirs is kept
  await kit.store.put("pwait", `${sender.id}:${habitId}`, 1);
  if (person.asked) return;
  await kit.store.put("people", sender.id, { ...person, name: sender.name, asked: kit.today } as unknown as Json);
  const who = first(sender.name);
  const ref: OfferRef = { offer: sender.id };
  kit.ask(
    `${who ? `${who}, you've` : "You've"} started forming a habit. Want your own telcurio profile, so I can track your streak too? Tap Yes and I'll set you up. Nothing else to do.`,
    OFFER,
    { ref: ref as unknown as Json, ...(pact ? { group: pact } : {}), confirm: false },
  );
}

/** They said yes to a profile: everything they answered while deciding now counts. */
async function accept(kit: Kit, sender: Sender) {
  await kit.signUp(sender.id);
  const person = (await kit.store.get<Person>("people", sender.id)) ?? { name: sender.name };
  await kit.store.put("people", sender.id, { ...person, name: sender.name, profile: true } as unknown as Json);
  const prefix = `${sender.id}:`;
  for (const w of await kit.store.list("pwait", { prefix })) {
    const habitId = w.key.slice(prefix.length);
    const days = [...(await daysOf(kit, habitId, sender.id))].sort();
    const key = `${habitId}:${sender.id}`;
    if (!(await kit.store.get("pjoins", key))) await kit.store.put("pjoins", key, { name: sender.name, since: days[0] ?? kit.today, last: kit.today } as unknown as Json);
    await kit.store.delete("pwait", w.key);
  }
}

/** They said not now: forget what they answered, and don't ask again. */
async function decline(kit: Kit, sender: Sender) {
  const person = (await kit.store.get<Person>("people", sender.id)) ?? { name: sender.name };
  await kit.store.put("people", sender.id, { ...person, name: sender.name, profile: false } as unknown as Json);
  const prefix = `${sender.id}:`;
  for (const w of await kit.store.list("pwait", { prefix })) {
    const mine = `${w.key.slice(prefix.length)}:${sender.id}:`;
    for (const c of ["plogs", "pmissed"]) for (const l of await kit.store.list(c, { prefix: mine })) await kit.store.delete(c, l.key);
    await kit.store.delete("pwait", w.key);
  }
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

async function summary(kit: Kit, pact: string, name: string, tools: Tools): Promise<string> {
  const list = await habitsOf(kit, pact);
  if (!list.length) return `🌱 *${name}* has no habits yet. Add one here, like _add gym_.`;
  const lines = [`🌱 *${name}*`];
  for (const [i, { id, habit }] of list.entries()) {
    const s = await standings(kit, id, habit.days);
    const own = typeof habit.hour === "number" ? `  ⏰ ${tools.hourLabel(habit.hour)}` : "";
    const when = habit.days?.length ? `  📅 ${daysLabel(habit.days)}` : "";
    lines.push("", `${i + 1}. *${habit.name}*${s.people.length > 1 ? `  Together 🔥 ${s.together}` : ""}${own}${when}`);
    if (!s.people.length) lines.push("_Nobody has answered yet._");
    for (const p of s.people) lines.push(`${p.name ?? "Someone"}  🔥 ${p.streak}`);
  }
  return lines.join("\n");
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
  if (list.length >= MAX_PACT_HABITS) return `That's the most habits one group can hold (${MAX_PACT_HABITS}). Stop one first.`;
  const id = kit.id();
  const habit: PactHabit = { pact, name, createdDay: kit.today, archived: false, hour, days: days ?? null, by: sender.id };
  await kit.store.put("phabits", id, habit as unknown as Json, kit.now);
  await involve(kit, pact, id, sender, kit.today);
  return null;
}

/** "Set me up": someone who said not now, or was never asked, wants their streak kept after all. */
async function setUp(kit: Kit, sender: Sender): Promise<void> {
  if (await tracked(kit, sender)) return kit.react("👍");
  await accept(kit, sender);
  kit.close({ offer: sender.id });
  kit.send(`${first(sender.name) ? `${first(sender.name)}, you're` : "You're"} set up. I'm keeping your streak from here on.`);
}

/**
 * The habit messages that work the same in every group, from anyone in it: add a habit, log
 * it, join or leave it, and (for whoever added it, or the group's owner) stop it or change
 * when it's asked. Returns false when `text` is none of these.
 */
async function habitCommands(kit: Kit, pact: string, sender: Sender, text: string, tools: Tools): Promise<boolean> {
  const list = await habitsOf(kit, pact);
  const missing = (which: string) => kit.send(`I can't find "${which}" here. Send _habits_ to see them.`);
  const notYours = (h: Row, what: string) => kit.send(`*${h.habit.name}* was added by someone else, so only they or ${first(kit.person.name) ?? "the person whose group this is"} can ${what}.${what === "stop it" ? ` To step out yourself, send _leave ${h.habit.name.toLowerCase()}_.` : ""}`);

  let m = text.match(/^(?:done|did|logged?|✅)\s+(.+)$/i);
  if (m) {
    const h = find(list, m[1].trim());
    if (!h) return missing(m[1].trim()), true;
    await involve(kit, pact, h.id, sender, kit.today);
    await setDay(kit, h.id, sender.id, kit.today, "done");
    return kit.react("✅"), true;
  }
  m = text.match(/^(?:undo|undone|not done)\s+(.+)$/i);
  if (m) {
    const h = find(list, m[1].trim());
    if (!h) return missing(m[1].trim()), true;
    await setDay(kit, h.id, sender.id, kit.today, null);
    return kit.react("👍"), true;
  }
  m = text.match(/^(?:join|i'?m in(?: for| on)?|count me in(?: for| on)?)\s+(.+)$/i);
  if (m) {
    const h = find(list, m[1].trim());
    if (!h) return missing(m[1].trim()), true;
    await involve(kit, pact, h.id, sender, kit.today);
    return kit.react("👍"), true;
  }
  m = text.match(/^(?:leave|i'?m out(?: of)?|drop out of)\s+(.+)$/i);
  if (m) {
    const h = find(list, m[1].trim());
    if (!h) return missing(m[1].trim()), true;
    await kit.store.delete("pjoins", `${h.id}:${sender.id}`);
    await kit.store.delete("pwait", `${sender.id}:${h.id}`);
    return kit.react("👍"), true;
  }
  m = text.match(/^(?:stop|remove|delete|drop|quit|end)\s+(?:habit\s+)?(.+)$/i);
  if (m) {
    const h = find(list, m[1].trim());
    if (!h) return missing(m[1].trim()), true;
    if (!may(h.habit, sender)) return notYours(h, "stop it"), true;
    await kit.store.put("phabits", h.id, { ...h.habit, archived: true } as unknown as Json);
    return kit.react("👍"), true;
  }
  const tm = text.match(/^(?:time|check[- ]?in|reminder)\s+(.+?)\s+(?:at\s+)?(default|reset|\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?)$/i);
  if (tm) {
    const h = find(list, tm[1].trim());
    if (!h) return missing(tm[1].trim()), true;
    if (!may(h.habit, sender)) return notYours(h, "change its time"), true;
    const hour = /^(default|reset)$/i.test(tm[2]) ? null : tools.parseHour(tm[2]);
    if (hour === null && !/^(default|reset)$/i.test(tm[2])) return kit.send(`Give me a time like _time ${h.habit.name.toLowerCase()} 7am_.`), true;
    await kit.store.put("phabits", h.id, { ...h.habit, hour } as unknown as Json);
    return kit.react("👍"), true;
  }
  const dm = text.match(/^days?\s+(.+)$/i);
  if (dm) {
    const words = dm[1].trim().split(/\s+/);
    for (let k = 1; k < words.length; k++) {
      const parsed = parseDays(words.slice(k).join(" "));
      if (parsed === undefined) continue;
      const h = find(list, words.slice(0, k).join(" "));
      if (!h) return missing(words.slice(0, k).join(" ")), true;
      if (!may(h.habit, sender)) return notYours(h, "change its days"), true;
      await kit.store.put("phabits", h.id, { ...h.habit, days: parsed } as unknown as Json);
      return kit.react("👍"), true;
    }
    return kit.send("Tell me the habit and the days, like _days gym mon wed fri_."), true;
  }
  m = text.match(/^(?:add|new|start|track|habit)\s*:?\s+(.+)$/i);
  if (m) {
    const { name: raw, hour, days } = tools.splitAdd(m[1]);
    const name = cleanName(raw);
    if (!name) return kit.send("Name the habit, like _add gym_."), true;
    const problem = await addHabit(kit, pact, sender, name, hour, days);
    return problem ? kit.send(problem) : kit.react("👍"), true;
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
  if (STANDINGS.test(lower)) return kit.send(await summary(kit, pact, p.name, tools));
  if (SET_UP.test(lower)) return setUp(kit, sender);
  // A group of one's own is made from one's own telcurio, which means logging in first.
  if (!sender.owner && OWN_GROUP.test(lower)) return kit.send(OWN_GROUP_REPLY);
  if (await habitCommands(kit, pact, sender, text, tools)) return;
  kit.unsure("I didn't get that. Tell me a habit to add here, or send _habits_ to see how it's going.");
}

const OWN_GROUP = /^(?:(?:can i |i want to |i'?d like to )?(?:new|make|create|start|get|have)\s+(?:a\s+|my\s+|my own\s+|an?\s+own\s+)?(?:pact|group|habits?)(?:\s+of my own|\s+for me|\s+for myself)?|my own (?:group|pact|habits?))\b/;
const OWN_GROUP_REPLY = "To have a group of your own, log in at app.whatodo.today and add Habits there. It takes a minute, and then I'll make it for you.";

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
  if (OWN_GROUP.test(lower)) return kit.send(OWN_GROUP_REPLY);
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
    return kit.react("✅");
  }
  m = text.match(/^(?:undo|undone|not done)\s+(.+)$/i);
  h = m ? pick(m[1].trim()) : undefined;
  if (m && h) {
    await setDay(kit, h.id, sender.id, kit.today, null);
    return kit.react("👍");
  }
  m = text.match(/^(?:join|i'?m in(?: for| on)?|count me in(?: for| on)?)\s+(.+)$/i);
  h = m ? pick(m[1].trim()) : undefined;
  if (m && h) {
    await involve(kit, null, h.id, sender, kit.today);
    return kit.react("👍");
  }
  m = text.match(/^(?:leave|i'?m out(?: of)?|drop out of)\s+(.+)$/i);
  h = m ? pick(m[1].trim()) : undefined;
  if (m && h) {
    await kit.store.delete("pjoins", `${h.id}:${sender.id}`);
    await kit.store.delete("pwait", `${sender.id}:${h.id}`);
    return kit.react("👍");
  }
  m = text.match(/^(?:stop|remove|delete|drop|quit|end)\s+(?:habit\s+)?(.+)$/i) ?? text.match(/^(?:time|check[- ]?in|reminder)\s+(.+?)\s+(?:at\s+)?(?:default|reset|\d.*)$/i);
  h = m ? pick(m[1].trim()) : undefined;
  if (m && h) return kit.send(`*${h.name}* is ${first(kit.person.name) ? `${first(kit.person.name)}'s` : "someone else's"} habit, so only they can change it. To step out yourself, send _leave ${h.name.toLowerCase()}_.`);
  // Adding one that is already here means doing it too.
  m = text.match(/^(?:add|new|start|track|habit)\s*:?\s+(.+)$/i);
  if (m) {
    const name = cleanName(tools.splitAdd(m[1]).name);
    const same = list.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (same) {
      await involve(kit, null, same.id, sender, kit.today);
      return kit.react("👍");
    }
  }
  // Anything else about a habit: the ones friends added here, or a new one of their own.
  if (await habitCommands(kit, MAIN, sender, text, tools)) return;
  kit.unsure("I didn't get that. Tell me a habit to add, answer a poll to take part in one, or send _habits_ to see how it's going.");
}

/** A plain sentence from a friend in someone's main Habits group. */
export async function friendIntent(event: IntentEvent, kit: Kit, tools: Tools, list: { id: string; name: string }[], summary: () => Promise<string>): Promise<void> {
  const sender = event.sender!;
  if (event.intent === "set_me_up") return setUp(kit, sender);
  if (event.intent === "list" || event.intent === "help") return kit.send(await summary());
  const extra = (await habitsOf(kit, MAIN)).map((x) => ({ id: x.id, name: x.habit.name }));
  if (event.intent === "add_habit") {
    const name = tools.habitName(event.text);
    if (!name) return kit.send("What should I call it? Like _add gym on mon wed fri_.");
    const same = list.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (same) await involve(kit, null, same.id, sender, kit.today);
    else {
      const problem = await addHabit(kit, MAIN, sender, name, tools.scanHour(event.text) ?? null, scanDays(event.text));
      if (problem) return kit.send(problem);
    }
    return kit.react("👍");
  }
  if (event.intent === "log_done" || event.intent === "missed" || event.intent === "undo_done") {
    const lower = event.text.toLowerCase();
    const all = [...list, ...extra];
    const named = all.filter((x) => lower.includes(x.name.toLowerCase()));
    const h = named.length === 1 ? named[0] : all.length === 1 ? all[0] : undefined;
    if (!h) return kit.send("Which habit? Send _habits_ to see them.");
    if (event.intent !== "undo_done") await involve(kit, null, h.id, sender, kit.today);
    await setDay(kit, h.id, sender.id, kit.today, event.intent === "log_done" ? "done" : event.intent === "missed" ? "missed" : null);
    return kit.react(event.intent === "log_done" ? "✅" : "👍");
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

/** The habits friends added in the main group, as lines for its summary. */
export async function extraLines(kit: Kit, tools: Tools, from: number): Promise<string[]> {
  const lines: string[] = [];
  for (const [i, { id, habit }] of (await habitsOf(kit, MAIN)).entries()) {
    const s = await standings(kit, id, habit.days);
    const own = typeof habit.hour === "number" ? `  ⏰ ${tools.hourLabel(habit.hour)}` : "";
    const when = habit.days?.length ? `  📅 ${daysLabel(habit.days)}` : "";
    lines.push("", `${from + i + 1}. *${habit.name}*${s.people.length > 1 ? `  Together 🔥 ${s.together}` : ""}${own}${when}`);
    if (!s.people.length) lines.push("_Nobody has answered yet._");
    for (const x of s.people) lines.push(`${x.name ?? "Someone"}  🔥 ${x.streak}`);
  }
  return lines;
}

/** A friend's tap on one of the owner's private check-in polls: they are doing that habit too. */
export async function friendAnswer(event: AnswerEvent, kit: Kit, habitId: string, day: string): Promise<void> {
  const sender = event.sender!;
  await involve(kit, null, habitId, sender, day);
  if ((await kit.store.get<Person>("people", sender.id))?.profile === false) return;
  await setDay(kit, habitId, sender.id, day, event.choice === 0 ? "done" : "missed");
}

/** Does anyone besides the owner take part in this habit? */
export async function hasFriends(kit: Kit, habitId: string): Promise<boolean> {
  return (await kit.store.list("pjoins", { prefix: `${habitId}:`, limit: 1 })).length > 0;
}

/** The standings to add to a check-in's question, within the 255 characters a poll allows. */
export function withStandings(question: string, s: { people: Standing[]; together: number }): string {
  const bits = [...(s.people.length > 1 ? [`Together 🔥 ${s.together}`] : []), ...s.people.map((x) => `${first(x.name) ?? "Someone"} 🔥 ${x.streak}`)];
  let out = question;
  for (const [i, bit] of bits.entries()) {
    const next = `${out}${i ? " · " : "  "}${bit}`;
    if (next.length > 255) break;
    out = next;
  }
  return out;
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
    if (!name) return kit.send("What should I call it? Like _add gym on mon wed fri_.");
    const problem = await addHabit(kit, pact, sender, name, tools.scanHour(event.text) ?? null, scanDays(event.text));
    return problem ? kit.send(problem) : kit.react("👍");
  }
  const lower = event.text.toLowerCase();
  const named = list.filter((x) => lower.includes(x.habit.name.toLowerCase()));
  const h = named.length === 1 ? named[0] : list.length === 1 ? list[0] : undefined;
  if (event.intent === "log_done" || event.intent === "missed" || event.intent === "undo_done") {
    if (!h) return kit.send(list.length ? "Which habit? Send _habits_ to see them." : "There are no habits here yet. Add one, like _add gym_.");
    if (event.intent !== "undo_done") await involve(kit, pact, h.id, sender, kit.today);
    await setDay(kit, h.id, sender.id, kit.today, event.intent === "log_done" ? "done" : event.intent === "missed" ? "missed" : null);
    return kit.react(event.intent === "log_done" ? "✅" : "👍");
  }
  // Everything else: show where the pact stands, which answers most questions asked here.
  kit.send(await summary(kit, pact, p.name, tools));
}

/** An answer to one of a pact's polls: a check-in, or the profile offer. Nothing is posted back for a check-in. */
export async function pactAnswer(event: AnswerEvent, kit: Kit): Promise<void> {
  const sender = event.sender;
  if (!sender) return;
  const ref = event.ref;
  if (isOfferRef(ref)) {
    // The offer is one person's to answer; a tap from anyone else on it is not theirs to give.
    if (sender.id !== ref.offer) return;
    if (event.choice === 0) {
      await accept(kit, sender);
      kit.send(`${first(sender.name) ? `${first(sender.name)}, you're` : "You're"} set up. I'm keeping your streak from here on.`);
    } else {
      await decline(kit, sender);
      kit.send(`No problem${first(sender.name) ? `, ${first(sender.name)}` : ""}. Just ask me to set it up for you later if you change your mind.`);
    }
    kit.close(ref as unknown as Json);
    return;
  }
  if (!isPactRef(ref)) return;
  const habit = await kit.store.get<PactHabit>("phabits", ref.habitId);
  if (!habit || habit.archived || habit.pact !== ref.pact) return;
  await involve(kit, ref.pact, ref.habitId, sender, ref.day);
  if ((await kit.store.get<Person>("people", sender.id))?.profile === false) return;
  await setDay(kit, ref.habitId, sender.id, ref.day, event.choice === 0 ? "done" : "missed");
}

/** The hourly check-in for pacts: one poll per habit that is due now, for the whole group. */
export async function pactCheckins(kit: Kit, hourNow: number, all: boolean): Promise<void> {
  const fallback = typeof kit.settings.checkinHour === "number" ? kit.settings.checkinHour : null;
  const groups = [{ key: MAIN, closed: false }, ...(await kit.store.list<Pact>("pacts")).map((p) => ({ key: p.key, closed: !!p.data.closed }))];
  for (const p of groups) {
    if (p.closed) continue;
    for (const { id, habit } of await habitsOf(kit, p.key)) {
      const hour = typeof habit.hour === "number" ? habit.hour : fallback;
      if (!all && hour !== hourNow) continue;
      if (!isOn(habit.days, kit.today)) continue;
      // Yesterday's poll for this habit stops taking answers now. It stays in the chat.
      const last = await kit.store.get<string>("pasked", id);
      if (last === kit.today) continue;
      if (last) kit.close({ pact: p.key, habitId: id, day: last });
      await kit.store.put("pasked", id, kit.today, kit.today);
      const s = await standings(kit, id, habit.days);
      const question = withStandings(`🌱 Did you ${habit.name} today?`, s);
      const ref: PactRef = { pact: p.key, habitId: id, day: kit.today };
      // Always kept: the poll is how everyone sees who did it.
      kit.ask(question, CHECKIN, { ref: ref as unknown as Json, ...(p.key ? { group: p.key } : {}), keep: true });
    }
  }
}

export async function createPact(kit: Kit, name: string): Promise<{ key: string; name: string } | { error: string }> {
  const clean = name.trim().replace(/\s+/g, " ").replace(/[.!?]+$/, "").slice(0, 22);
  const key = slug(clean);
  if (!key) return { error: "Give the group a name, like _new group gym buddies_." };
  const old = await kit.store.get<Pact>("pacts", key);
  if (old && !old.closed) return { error: `You already have a group called *${old.name}*.` };
  const open = (await kit.store.list<Pact>("pacts")).filter((x) => !x.data.closed);
  if (!old && open.length >= MAX_PACTS) return { error: `That's the most habit groups I can keep (${MAX_PACTS}). Close one first.` };
  const pact: Pact = { name: old?.name ?? clean, created: old?.created ?? kit.now };
  await kit.groups.open(key, {
    name: `🌱 ${pact.name}`.slice(0, 25),
    hello: `🌱 This is your habit group *${pact.name}*.\n\nTell me a habit here, like _add gym_, and every day I'll ask about it with a poll. It works on your own, and with other people: add anyone you like to this group and they can take part or add habits of their own.\n\nSend _habits_ here any time to see how it's going.`,
  });
  await kit.store.put("pacts", key, pact as unknown as Json, pact.created);
  return { key, name: pact.name };
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
    kit.send("error" in made ? made.error : `🌱 I'm making a WhatsApp group called *${made.name}*. Once it appears, tell me a habit there. Add other people to it if you want company.`);
    return true;
  }
  if (/^(groups|my groups|habit groups|pacts|my pacts)$/.test(lower)) {
    const open = (await kit.store.list<Pact>("pacts")).filter((x) => !x.data.closed);
    if (!open.length) kit.send("You have one Habits group, this one. Send _new group gym buddies_ to make another, for a different set of habits or of people.");
    else {
      const lines = ["*Your habit groups*", "", "🌱 *Habits* (this one)"];
      for (const p of open) {
        const n = (await habitsOf(kit, p.key)).length;
        lines.push(`🌱 *${p.data.name}*: ${n} habit${n === 1 ? "" : "s"}`);
      }
      kit.send(lines.join("\n"));
    }
    return true;
  }
  m = lower.match(new RegExp(`^(?:close|end|delete|remove)\\s+(?:the\\s+)?${GROUP}\\s+(.+)$`));
  if (m) {
    const closed = await closePact(kit, slug(m[1]));
    kit.send(closed ? `*${closed.name}* is closed. What everyone logged is kept.` : `I don't have a group called "${m[1]}". Send _groups_ to see yours.`);
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
      habits.push({
        id,
        name: habit.name,
        hour: typeof habit.hour === "number" ? habit.hour : null,
        days: habit.days?.length ? habit.days : null,
        together: s.together,
        people: s.people.map((x) => ({ id: x.id, name: x.name, streak: x.streak, total: x.total, doneDays: [...x.done].filter((d) => d >= from).sort() })),
      });
    }
    // The main group is listed only when friends added habits to it (the owner's own are elsewhere on the page).
    if (p.key === MAIN && !habits.length) continue;
    out.push({ key: p.key || null, name: p.name, closed: p.closed, habits });
  }
  return out as unknown as Json;
}
