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
async function involve(kit: Kit, pact: string, habitId: string, sender: Sender, day: string) {
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
    { ref: ref as unknown as Json, group: pact, confirm: false },
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
export async function standings(kit: Kit, id: string, habit: PactHabit): Promise<{ people: Standing[]; together: number }> {
  const joins = await joinsOf(kit, id);
  const people: Standing[] = [];
  for (const j of joins) {
    const done = await daysOf(kit, id, j.id);
    people.push({ id: j.id, name: j.join.name, streak: streak(done, kit.today, habit.days), total: done.size, done });
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
  if (!list.length) return `🤝 *${name}* has no habits yet. Add one here, like _add gym_.`;
  const lines = [`🤝 *${name}*`];
  for (const [i, { id, habit }] of list.entries()) {
    const s = await standings(kit, id, habit);
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
  if (list.length >= MAX_PACT_HABITS) return `That's the most habits a pact can hold (${MAX_PACT_HABITS}). Stop one first.`;
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

/** A message in a pact's group. Anyone there can add a habit, log it and see how everyone stands. */
export async function pactMessage(event: MessageEvent, kit: Kit, tools: Tools): Promise<void> {
  const pact = event.group!;
  const p = await kit.store.get<Pact>("pacts", pact);
  const sender = event.sender;
  if (!p || p.closed || !sender) return;
  const text = event.text.trim();
  const lower = text.toLowerCase().replace(/[!.]+$/, "");

  if (/^(habits|list|streaks?|show|status|pact|score|scores|standings)$/.test(lower)) return kit.send(await summary(kit, pact, p.name, tools));

  if (/^(?:(?:please\s+)?(?:hook|set|sign) me up|count me in|set (?:it|my profile) up(?: for me)?|set up my profile)$/.test(lower)) return setUp(kit, sender);

  const list = await habitsOf(kit, pact);
  const missing = (which: string) => kit.send(`I can't find "${which}" in this pact. Send _habits_ to see them.`);

  let m = text.match(/^(?:done|did|logged?|✅)\s+(.+)$/i);
  if (m) {
    const h = find(list, m[1].trim());
    if (!h) return missing(m[1].trim());
    await involve(kit, pact, h.id, sender, kit.today);
    await setDay(kit, h.id, sender.id, kit.today, "done");
    return kit.react("✅");
  }
  m = text.match(/^(?:undo|undone|not done)\s+(.+)$/i);
  if (m) {
    const h = find(list, m[1].trim());
    if (!h) return missing(m[1].trim());
    await setDay(kit, h.id, sender.id, kit.today, null);
    return kit.react("👍");
  }
  m = text.match(/^(?:join|i'?m in(?: for| on)?|count me in(?: for| on)?)\s+(.+)$/i);
  if (m) {
    const h = find(list, m[1].trim());
    if (!h) return missing(m[1].trim());
    await involve(kit, pact, h.id, sender, kit.today);
    return kit.react("👍");
  }
  m = text.match(/^(?:leave|i'?m out(?: of)?|drop out of)\s+(.+)$/i);
  if (m) {
    const h = find(list, m[1].trim());
    if (!h) return missing(m[1].trim());
    await kit.store.delete("pjoins", `${h.id}:${sender.id}`);
    await kit.store.delete("pwait", `${sender.id}:${h.id}`);
    return kit.react("👍");
  }
  m = text.match(/^(?:stop|remove|delete|drop|quit|end)\s+(?:habit\s+)?(.+)$/i);
  if (m) {
    const h = find(list, m[1].trim());
    if (!h) return missing(m[1].trim());
    if (!may(h.habit, sender)) return kit.send(`Only the person who added *${h.habit.name}* or who made this pact can stop it. To step out yourself, send _leave ${h.habit.name.toLowerCase()}_.`);
    await kit.store.put("phabits", h.id, { ...h.habit, archived: true } as unknown as Json);
    return kit.react("👍");
  }
  const tm = text.match(/^(?:time|check[- ]?in|reminder)\s+(.+?)\s+(?:at\s+)?(default|reset|\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?)$/i);
  if (tm) {
    const h = find(list, tm[1].trim());
    if (!h) return missing(tm[1].trim());
    if (!may(h.habit, sender)) return kit.send(`Only the person who added *${h.habit.name}* or who made this pact can change its time.`);
    const hour = /^(default|reset)$/i.test(tm[2]) ? null : tools.parseHour(tm[2]);
    if (hour === null && !/^(default|reset)$/i.test(tm[2])) return kit.send(`Give me a time like _time ${h.habit.name.toLowerCase()} 7am_.`);
    await kit.store.put("phabits", h.id, { ...h.habit, hour } as unknown as Json);
    return kit.react("👍");
  }
  const dm = text.match(/^days?\s+(.+)$/i);
  if (dm) {
    const words = dm[1].trim().split(/\s+/);
    for (let k = 1; k < words.length; k++) {
      const parsed = parseDays(words.slice(k).join(" "));
      if (parsed === undefined) continue;
      const h = find(list, words.slice(0, k).join(" "));
      if (!h) return missing(words.slice(0, k).join(" "));
      if (!may(h.habit, sender)) return kit.send(`Only the person who added *${h.habit.name}* or who made this pact can change its days.`);
      await kit.store.put("phabits", h.id, { ...h.habit, days: parsed } as unknown as Json);
      return kit.react("👍");
    }
    return kit.send("Tell me the habit and the days, like _days gym mon wed fri_.");
  }
  m = text.match(/^(?:add|new|start|track|habit)\s*:?\s+(.+)$/i);
  if (m) {
    const { name: raw, hour, days } = tools.splitAdd(m[1]);
    const name = cleanName(raw);
    if (!name) return kit.send("Name the habit, like _add gym_.");
    const problem = await addHabit(kit, pact, sender, name, hour, days);
    return problem ? kit.send(problem) : kit.react("👍");
  }
  kit.unsure("I didn't get that. Tell me a habit to add here, or send _habits_ to see how everyone is doing.");
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
    if (!h) return kit.send(list.length ? "Which habit? Send _habits_ to see them." : "This pact has no habits yet. Add one, like _add gym_.");
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
  for (const p of await kit.store.list<Pact>("pacts")) {
    if (p.data.closed) continue;
    for (const { id, habit } of await habitsOf(kit, p.key)) {
      const hour = typeof habit.hour === "number" ? habit.hour : fallback;
      if (!all && hour !== hourNow) continue;
      if (!isOn(habit.days, kit.today)) continue;
      // Yesterday's poll for this habit stops taking answers now. It stays in the chat.
      const last = await kit.store.get<string>("pasked", id);
      if (last === kit.today) continue;
      if (last) kit.close({ pact: p.key, habitId: id, day: last });
      await kit.store.put("pasked", id, kit.today, kit.today);
      const s = await standings(kit, id, habit);
      let question = `🤝 Did you ${habit.name} today?`;
      const bits = [...(s.people.length > 1 ? [`Together 🔥 ${s.together}`] : []), ...s.people.map((x) => `${first(x.name) ?? "Someone"} 🔥 ${x.streak}`)];
      for (const [i, bit] of bits.entries()) {
        const next = `${question}${i ? " · " : "  "}${bit}`;
        if (next.length > 255) break;
        question = next;
      }
      const ref: PactRef = { pact: p.key, habitId: id, day: kit.today };
      // Always kept: the poll is how everyone sees who did it.
      kit.ask(question, CHECKIN, { ref: ref as unknown as Json, group: p.key, keep: true });
    }
  }
}

export async function createPact(kit: Kit, name: string): Promise<{ key: string; name: string } | { error: string }> {
  const clean = name.trim().replace(/\s+/g, " ").replace(/[.!?]+$/, "").slice(0, 22);
  const key = slug(clean);
  if (!key) return { error: "Give the pact a name, like _new pact gym buddies_." };
  const old = await kit.store.get<Pact>("pacts", key);
  if (old && !old.closed) return { error: `You already have a pact called *${old.name}*.` };
  const open = (await kit.store.list<Pact>("pacts")).filter((x) => !x.data.closed);
  if (!old && open.length >= MAX_PACTS) return { error: `That's the most pacts I can keep (${MAX_PACTS}). Close one first.` };
  const pact: Pact = { name: old?.name ?? clean, created: old?.created ?? kit.now };
  await kit.groups.open(key, {
    name: `🤝 ${pact.name}`.slice(0, 25),
    hello: `🤝 This is your pact *${pact.name}*.\n\nAdd the people you want to keep going with. Then tell me a habit here, like _add gym_. Every day I'll ask with one poll for all of you, and everyone sees who did it.\n\nSend _habits_ here any time to see how everyone is doing.`,
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

/** The owner's pact messages in their private Habits group. Returns false when `text` isn't one. */
export async function privatePact(kit: Kit, text: string, lower: string): Promise<boolean> {
  let m = text.match(/^(?:new|add|create|make|start)\s+(?:a\s+)?pact\s+(?:(?:for|called|named|with)\s+)?(.+)$/i) ?? text.match(/^pact\s+(?!s$)(.+)$/i);
  if (m) {
    const made = await createPact(kit, m[1]);
    kit.send("error" in made ? made.error : `🤝 I'm making a WhatsApp group for your pact *${made.name}*. Once it appears, add your people to it and tell me a habit there.`);
    return true;
  }
  if (/^(pacts|my pacts)$/.test(lower)) {
    const open = (await kit.store.list<Pact>("pacts")).filter((x) => !x.data.closed);
    if (!open.length) kit.send("No pacts yet. A pact is a habit you keep with other people. Send _new pact gym buddies_ to start one.");
    else {
      const lines = ["*Your pacts*", ""];
      for (const p of open) {
        const n = (await habitsOf(kit, p.key)).length;
        lines.push(`🤝 *${p.data.name}*: ${n} habit${n === 1 ? "" : "s"}`);
      }
      kit.send(lines.join("\n"));
    }
    return true;
  }
  m = lower.match(/^(?:close|end|stop|delete|remove)\s+(?:the\s+)?pact\s+(.+)$/);
  if (m) {
    const closed = await closePact(kit, slug(m[1]));
    kit.send(closed ? `*${closed.name}* is closed. What everyone logged is kept.` : `I don't have a pact called "${m[1]}". Send _pacts_ to see yours.`);
    return true;
  }
  return false;
}

/** Pacts for the web page: each with its habits, who is doing them and how they stand. */
export async function pactsForWeb(kit: Kit, days: number): Promise<Json> {
  const from = kit.time.shiftDay(kit.today, -(days - 1));
  const out = [];
  for (const p of await kit.store.list<Pact>("pacts")) {
    const habits = [];
    for (const { id, habit } of await habitsOf(kit, p.key)) {
      const s = await standings(kit, id, habit);
      habits.push({
        id,
        name: habit.name,
        hour: typeof habit.hour === "number" ? habit.hour : null,
        days: habit.days?.length ? habit.days : null,
        together: s.together,
        people: s.people.map((x) => ({ id: x.id, name: x.name, streak: x.streak, total: x.total, doneDays: [...x.done].filter((d) => d >= from).sort() })),
      });
    }
    out.push({ key: p.key, name: p.data.name, closed: !!p.data.closed, habits });
  }
  return out as unknown as Json;
}
