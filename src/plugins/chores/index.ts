import { definePlugin, type Json, type Kit, type Sender } from "../../sdk";
import { copy, DONE, IDEA_JOBS, ideaOption, SAVED, sayMonth, type CountRow, type DayRow } from "./copy";
import { cleanName, MAX_ROTA, readJob, readNames, readRhythm, readRota, type ReadJob } from "./read";
import { cleanRhythm, dueOn, isDay, nextAfter, readBack, readHour, shift, weekday, type Rhythm } from "./when";

/**
 * Chores: a shared home's jobs, taken in turns.
 *
 * A job has a name, a rhythm and a rota. Each morning the day's jobs go out as one tick list.
 * Whoever ticks a job did it and gets the credit. The turn then moves on to the next person in
 * the rota, whoever did it; a home can switch to the other rule, where the turn stays with the
 * person whose it was until they do it themselves. What was done by whom is kept and shown
 * when someone asks.
 *
 * Homes. A home is a WhatsApp group: the app's own (the person adds the people they live
 * with), or a group the home already had (onGroup). Each has its own jobs, people, settings
 * and count. `here` below is the group's key, null for the app's own group; in the store that
 * group is "main".
 *
 * People. A plugin is never given a group's members, so a person is known by the name put in
 * a rota. When someone writes, ticks or reacts, their WhatsApp first name is matched to such a
 * name and the two are joined; "I'm Ravi" joins them by hand.
 *
 * Storage (every key starts with the home: "main" or the group's key)
 *   homes   key: home                 data: Home    sort: when it was first kept (ms)
 *   jobs    key: "<home>:<id>"        data: Job     sort: when it was made (ms)
 *   people  key: "<home>:<id>"        data: Person  sort: when they were first known (ms)
 *   done    key: "<home>:<id>"        data: Done    sort: the day it was ticked ("YYYY-MM-DD")
 */

/** The group something happens in: its key, or null for the app's own group. */
type Here = string | null;
const MAIN = "main";
const hk = (here: Here): string => here ?? MAIN;
const hereOf = (home: string): Here => (home === MAIN ? null : home);
const to = (here: Here): { group?: string } => (here ? { group: here } : {});

/** The most jobs one home keeps. */
export const MAX_JOBS = 30;
/** The most people one home keeps. */
export const MAX_PEOPLE = 20;
/** The hour a new home's list goes out. */
export const DEFAULT_HOUR = 8;
/** How many days the page looks ahead. */
export const AHEAD = 7;

export interface Home {
  /** The group's name, for a group the home already had. */
  name: string | null;
  /** The local hour the day's list goes out. */
  hour: number;
  /** When someone else does your job: "move" the turn on all the same, or let it "stay" with you. */
  turns: "move" | "stay";
  /** Send the count every Monday. */
  weekly: boolean;
  /** The day the list last went out (or was found empty). */
  sent?: string | null;
  /** The tick lists of that day, to close when the next one goes out. */
  last?: Json[];
  /** Each set once: the first job was kept, the first list was explained, the first tick was explained. */
  taught?: 1;
  taughtList?: 1;
  taughtDone?: 1;
  /** Said once: what happens when someone does another person's job. */
  taughtCover?: 1;
  /** Said once: the people in the rotas need to be in the group. */
  toldPeople?: 1;
  /** The ideas were offered, unasked, once. */
  offered?: 1;
  /** The question "which of these is you?" is open: who was asked, about which job, and the people offered in the options' order. */
  asking?: { sender: string; job: string; ids: string[] } | null;
  /** Someone besides the person who added the app is here: people also just talk. */
  shared?: 1;
  /** The person took the group back. Nothing is sent there any more. */
  left?: 1;
  /** When it was first kept (ms). */
  made?: number;
}

export interface Job {
  name: string;
  rhythm: Rhythm;
  /** The ids of the people who take turns, in order. Empty: anyone. */
  rota: string[];
  /** Whose turn is next: a place in `rota`. */
  at: number;
  /** Swaps, each for one turn: when it is the key's turn, the value does it. */
  over?: Record<string, string>;
  /** The day it came due and wasn't ticked yet, or null. */
  open: string | null;
  /** The last tick, kept so it can be taken back. */
  last: Last | null;
  made: number;
  /** The idea it was added from, while nobody has touched it. */
  idea?: string;
}

interface Last {
  /** The key of its `done` record. */
  key: string;
  /** The day it was ticked, and the day it had come due. */
  day: string;
  occ: string;
  by: string | null;
  /** The sender's id: only they can take it back. */
  sender: string;
  was: { at: number; over: Record<string, string>; from: string | null; open: string | null };
}

export interface Person {
  name: string;
  /** Their `sender.id`, once it is known who they are in the group. */
  sender: string | null;
  /** Away until this day ("open": until someone says they are back), or null. */
  back: string | null;
  /** Marked as a child by the home: in a rota by name, and nothing is counted. */
  child?: boolean;
  /** When they were first known (ms). */
  made: number;
}

export interface Done {
  job: string;
  name: string;
  occ: string;
  /** Who did it: a person's id. Null for a child. */
  by: string | null;
  /** Their name when it was ticked. */
  who: string | null;
  /** Whose turn it was. */
  turn: string | null;
  at: number;
}

type Found = { id: string; job: Job };
type Folk = { id: string; p: Person }[];

// ── Refs ──

interface DayRef {
  kind: "day";
  home: string;
  day: string;
  part: number;
  ids: string[];
}
const isDayRef = (r: unknown): r is DayRef =>
  !!r && typeof r === "object" && (r as DayRef).kind === "day" && typeof (r as DayRef).home === "string" && typeof (r as DayRef).day === "string" && Array.isArray((r as DayRef).ids) && (r as DayRef).ids.every((i) => typeof i === "string");

interface OneRef {
  kind: "one";
  home: string;
  day: string;
  job: string;
}
const isOneRef = (r: unknown): r is OneRef => !!r && typeof r === "object" && (r as OneRef).kind === "one" && typeof (r as OneRef).home === "string" && typeof (r as OneRef).job === "string";

interface IdeasRef {
  kind: "ideas";
  home: string;
  /** The ideas offered, in the options' order. Without it: all of them. */
  ids?: string[];
}

interface MeRef {
  kind: "me";
  home: string;
  sender: string;
}
const isMeRef = (r: unknown): r is MeRef => !!r && typeof r === "object" && (r as MeRef).kind === "me" && typeof (r as MeRef).home === "string" && typeof (r as MeRef).sender === "string";
const isIdeasRef = (r: unknown): r is IdeasRef => !!r && typeof r === "object" && (r as IdeasRef).kind === "ideas" && typeof (r as IdeasRef).home === "string";

/** Reactions that say "done" on a day with one job. */
const DONE_MARKS = new Set(["👍", "✅", "☑", "✔", "👌", "💪", "🙌"]);
const bare = (emoji: string) => emoji.replace(/[\u{1F3FB}-\u{1F3FF}️]/gu, "");

// ── Reading and writing ──

const freshHome = (name: string | null = null): Home => ({ name, hour: DEFAULT_HOUR, turns: "move", weekly: false });
const homeOf = async (kit: Kit, here: Here): Promise<Home> => (await kit.store.get<Home>("homes", hk(here))) ?? freshHome();
const saveHome = async (kit: Kit, here: Here, home: Home): Promise<void> => {
  // The sort is given every time: a home's place in the list never moves.
  home.made = home.made ?? kit.now;
  await kit.store.put("homes", hk(here), home as unknown as Json, home.made);
};

const jobsOf = async (kit: Kit, here: Here): Promise<Found[]> => {
  const prefix = `${hk(here)}:`;
  return (await kit.store.list<Job>("jobs", { prefix })).map((r) => ({ id: r.key.slice(prefix.length), job: r.data }));
};
const saveJob = (kit: Kit, here: Here, f: Found) => kit.store.put("jobs", `${hk(here)}:${f.id}`, f.job as unknown as Json, f.job.made);

const folkOf = async (kit: Kit, here: Here): Promise<Folk> => {
  const prefix = `${hk(here)}:`;
  return (await kit.store.list<Person>("people", { prefix })).map((r) => ({ id: r.key.slice(prefix.length), p: r.data }));
};
const savePerson = (kit: Kit, here: Here, id: string, p: Person) => kit.store.put("people", `${hk(here)}:${id}`, p as unknown as Json, p.made);

const senderOf = (event: { sender?: Sender }, kit: Kit): Sender => event.sender ?? { id: kit.person.id ?? "owner", name: kit.person.name, owner: true };
const ownerSender = (kit: Kit): Sender => ({ id: kit.person.id ?? "owner", name: kit.person.name, owner: true });

const first = (name: string | null | undefined): string | null => {
  const word = (name ?? "").replace(/[*_~`]/g, "").trim().split(/\s+/)[0]?.slice(0, 20);
  return word || null;
};
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const nameOf = (folk: Folk, id: string | null): string | null => (id ? (folk.find((f) => f.id === id)?.p.name ?? null) : null);
const isAway = (p: Person, day: string): boolean => !!p.back && (p.back === "open" || day < p.back);

/** The person in this home that a name means, or undefined. */
const byName = (folk: Folk, name: string) => folk.find((f) => same(f.p.name, name)) ?? folk.find((f) => same(first(f.p.name) ?? "", name));

/** Who a sender is in this home. Joined to a name already in a rota when theirs matches; made when they are new. */
async function meet(kit: Kit, here: Here, sender: Sender, folk: Folk): Promise<Folk[number]> {
  const known = folk.find((f) => f.p.sender === sender.id);
  if (known) return known;
  const given = sender.name ?? (sender.owner ? kit.person.name : null);
  const short = first(given);
  const free = folk.find((f) => !f.p.sender && ((given && same(f.p.name, given)) || (short && same(f.p.name, short))));
  if (free) {
    free.p = { ...free.p, sender: sender.id };
    await savePerson(kit, here, free.id, free.p);
    return free;
  }
  const made = { id: kit.id(), p: { name: short ?? "Someone", sender: sender.id, back: null, made: kit.now } as Person };
  await savePerson(kit, here, made.id, made.p);
  folk.push(made);
  return made;
}

/** The person a typed name means, made when the name is new. Null when the home is full. */
async function named(kit: Kit, here: Here, name: string, folk: Folk): Promise<Folk[number] | null> {
  const known = byName(folk, name);
  if (known) return known;
  if (folk.length >= MAX_PEOPLE) return null;
  const made = { id: kit.id(), p: { name: name.slice(0, 40), sender: null, back: null, made: kit.now } as Person };
  await savePerson(kit, here, made.id, made.p);
  folk.push(made);
  return made;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[*_~`"'?!.]/g, "")
    .replace(/^(?:the|my|our)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();

/** The job some words mean: its name, or the one job whose name holds them. */
function findJob(jobs: Found[], words: string): Found | null {
  const q = norm(words);
  if (!q) return null;
  const exact = jobs.find((j) => norm(j.job.name) === q);
  if (exact) return exact;
  const holds = jobs.filter((j) => ` ${norm(j.job.name)} `.includes(` ${q} `));
  return holds.length === 1 ? holds[0] : null;
}

// ── Turns ──

/** Whose turn a job is on a day: the rota's place it falls to (`slot`), and who does it (`who`, the other person of a swap). */
function turnOf(job: Job, folk: Folk, day: string): { slot: string | null; who: string | null } {
  const n = job.rota.length;
  for (let i = 0; i < n; i++) {
    const id = job.rota[(job.at + i) % n];
    const f = folk.find((x) => x.id === id);
    // Away, or no longer in the home: skipped.
    if (!f || isAway(f.p, day)) continue;
    const sub = job.over?.[id];
    const other = sub ? folk.find((x) => x.id === sub) : undefined;
    return { slot: id, who: other && !isAway(other.p, day) ? other.id : id };
  }
  return { slot: null, who: null };
}

/** Is the job on today's list, sent or not yet? */
const dueToday = (job: Job, home: Home, today: string): boolean => job.open !== null || (home.sent !== today && job.last?.occ !== today && dueOn(job.rhythm, today));

/** Take a person out of a job's rota, keeping the turn where it was. */
function without(job: Job, id: string): Job {
  const idx = job.rota.indexOf(id);
  if (idx < 0) return job;
  const rota = job.rota.filter((r) => r !== id);
  const at = rota.length ? (idx < job.at ? job.at - 1 : job.at) % rota.length : 0;
  const over = Object.fromEntries(Object.entries(job.over ?? {}).filter(([a, b]) => a !== id && b !== id));
  return { ...job, rota, at, over };
}

type Ticked = { status: "done"; by: string | null; next: string | null; /** Whose turn it was, when someone else did it. */ covered: string | null } | { status: "already"; by: string | null } | { status: "notDue" };

/** Someone did a job: they get the credit, and the turn moves on by the home's rule. */
async function tick(kit: Kit, here: Here, home: Home, f: Found, sender: Sender, folk: Folk): Promise<Ticked> {
  const job = f.job;
  const occ = job.open ?? (job.last?.occ !== kit.today && (job.rhythm.kind === "asked" || (home.sent !== kit.today && dueOn(job.rhythm, kit.today))) ? kit.today : null);
  if (!occ) return job.last?.day === kit.today ? { status: "already", by: nameOf(folk, job.last.by) } : { status: "notDue" };
  const me = await meet(kit, here, sender, folk);
  const { slot, who } = turnOf(job, folk, kit.today);
  const key = `${hk(here)}:${kit.id()}`;
  const by = me.p.child ? null : me.id;
  const done: Done = { job: f.id, name: job.name, occ, by, who: by ? me.p.name : null, turn: who, at: kit.now };
  await kit.store.put("done", key, done as unknown as Json, kit.today);
  const was = { at: job.at, over: job.over ?? {}, from: job.rhythm.kind === "every" ? job.rhythm.from : null, open: job.open };
  const next: Job = { ...job, open: null, last: { key, day: kit.today, occ, by, sender: sender.id, was } };
  delete next.idea;
  // "move": the turn goes on whoever did it. "stay": only when the person whose turn it was did it.
  if (slot && (home.turns === "move" || me.id === who)) {
    next.at = (job.rota.indexOf(slot) + 1) % job.rota.length;
    next.over = Object.fromEntries(Object.entries(job.over ?? {}).filter(([a]) => a !== slot));
  }
  // "Every 3 days" counts from the day it was last done.
  if (job.rhythm.kind === "every") next.rhythm = { ...job.rhythm, from: kit.today };
  f.job = next;
  await saveJob(kit, here, f);
  return { status: "done", by: by ? me.p.name : null, next: nameOf(folk, turnOf(next, folk, kit.today).who), covered: who && who !== me.id ? nameOf(folk, who) : null };
}

/** Take a tick back. Only the person who ticked can, and only until the job comes due again. */
async function untick(kit: Kit, here: Here, f: Found, sender: Sender): Promise<boolean> {
  const last = f.job.last;
  if (!last || last.sender !== sender.id || f.job.open !== null) return false;
  await kit.store.delete("done", last.key);
  const rhythm = f.job.rhythm.kind === "every" && last.was.from ? { ...f.job.rhythm, from: last.was.from } : f.job.rhythm;
  f.job = { ...f.job, rhythm, at: last.was.at, over: last.was.over, open: last.was.open ?? last.occ, last: null };
  await saveJob(kit, here, f);
  return true;
}

// ── The morning list ──

/** Options can't repeat on a poll: a second job that reads the same gets a number. */
function distinct(labels: string[]): string[] {
  const seen = new Map<string, number>();
  return labels.map((l) => {
    const k = l.trim().toLowerCase();
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return n === 1 ? l : `${l.slice(0, 94)} (${n})`;
  });
}

/** Who did how many between two days (both counted). */
async function countOf(kit: Kit, here: Here, from: string, until: string, folk: Folk): Promise<{ rows: CountRow[]; total: number }> {
  const done = await kit.store.list<Done>("done", { prefix: `${hk(here)}:`, from, to: until });
  const by = new Map<string, CountRow>();
  for (const { data: d } of done) {
    if (!d.by) continue;
    const row = by.get(d.by) ?? { name: nameOf(folk, d.by) ?? d.who ?? "Someone", n: 0 };
    row.n++;
    by.set(d.by, row);
  }
  return { rows: [...by.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)), total: done.length };
}

/** Send a home its day: what came due, and what was left from before. Once a day. */
async function morning(kit: Kit, here: Here, home: Home): Promise<void> {
  const today = kit.today;
  for (const ref of home.last ?? []) kit.close(ref);
  const folk = await folkOf(kit, here);
  const missed: string[] = [];
  const due: Found[] = [];
  for (const f of await jobsOf(kit, here)) {
    if (f.job.open && f.job.open < today) {
      // Left from an earlier day. It stays with the same person, and is said once.
      if (f.job.rhythm.kind !== "asked") missed.push(f.job.name);
      f.job = { ...f.job, open: today };
      await saveJob(kit, here, f);
      due.push(f);
    } else if (f.job.open) {
      due.push(f);
    } else if (f.job.last?.occ !== today && dueOn(f.job.rhythm, today)) {
      f.job = { ...f.job, open: today };
      await saveJob(kit, here, f);
      due.push(f);
    }
  }

  if (home.weekly && weekday(today) === 1) {
    const c = await countOf(kit, here, shift(today, -7), shift(today, -1), folk);
    if (c.total) kit.send(copy.count({ title: copy.weeklyTitle(), rows: c.rows, total: c.total }), to(here));
  }

  const next: Home = { ...home, sent: today, last: [] };
  if (!due.length) return saveHome(kit, here, next);
  const teach = !home.taughtList;
  next.taughtList = 1;
  const rows = due.map((f) => ({ f, who: nameOf(folk, turnOf(f.job, folk, today).who) }));

  if (rows.length === 1) {
    // A poll needs two options: one job goes out as a line to react to.
    const ref: OneRef = { kind: "one", home: hk(here), day: today, job: rows[0].f.id };
    kit.send(copy.todayOne({ name: rows[0].f.job.name, who: rows[0].who, missed: missed.length > 0, teach }), { ref: ref as unknown as Json, ...to(here) });
    return saveHome(kit, here, next);
  }

  // Twelve to a poll, split evenly so none is left with a single job.
  const parts = Math.ceil(rows.length / 12);
  const size = Math.ceil(rows.length / parts);
  const intro = [...(teach ? [copy.teachList()] : []), ...(missed.length ? [copy.missed({ names: missed })] : [])].join("\n\n");
  for (let i = 0; i < parts; i++) {
    const page = rows.slice(i * size, (i + 1) * size);
    const ref: DayRef = { kind: "day", home: hk(here), day: today, part: i, ids: page.map((r) => r.f.id) };
    kit.ask(copy.todayQuestion({ part: i + 1, parts }), distinct(page.map((r) => copy.todayOption({ name: r.f.job.name, who: r.who }))), {
      multiple: true,
      ref: ref as unknown as Json,
      ...(i === 0 && intro ? { intro } : {}),
      ...to(here),
    });
    next.last!.push(ref as unknown as Json);
  }
  await saveHome(kit, here, next);
}

// ── Jobs ──

type Added = { status: "kept"; f: Found; first: boolean; few: boolean } | { status: "full" } | { status: "peopleFull" };

/** Keep a job, or change the one that has this name. */
async function keepJob(kit: Kit, here: Here, home: Home, read: ReadJob, jobs: Found[], folk: Folk, idea?: string): Promise<Added> {
  let rota: string[] | null = null;
  let few = false;
  if (Array.isArray(read.rota)) {
    rota = [];
    for (const name of read.rota.slice(0, MAX_ROTA)) {
      const p = await named(kit, here, name, folk);
      if (!p) return { status: "peopleFull" };
      if (!rota.includes(p.id)) rota.push(p.id);
    }
  } else if (read.rota === "everyone") {
    // Everyone I know of here. With fewer than two there is nobody to take turns with yet.
    if (folk.length >= 2) rota = folk.map((f) => f.id).slice(0, MAX_ROTA);
    else few = true;
  }

  const known = jobs.find((j) => norm(j.job.name) === norm(read.name));
  if (known) {
    const job: Job = { ...known.job, rhythm: read.rhythm };
    delete job.idea;
    if (rota) Object.assign(job, { rota, at: 0, over: {} });
    known.job = job;
    await saveJob(kit, here, known);
    return { status: "kept", f: known, first: false, few };
  }
  if (jobs.length >= MAX_JOBS) return { status: "full" };
  const f: Found = { id: kit.id(), job: { name: read.name, rhythm: read.rhythm, rota: rota ?? [], at: 0, over: {}, open: null, last: null, made: kit.now, ...(idea ? { idea } : {}) } };
  await saveJob(kit, here, f);
  jobs.push(f);
  const isFirst = !home.taught;
  if (isFirst) {
    home.taught = 1;
    await saveHome(kit, here, home);
  }
  return { status: "kept", f, first: isFirst, few };
}

/** People named in a rota that nobody has seen in the app's own group. Said once, so asking marks it said. */
function unseen(here: Here, home: Home, folk: Folk): string[] {
  if (here !== null || home.shared || home.toldPeople) return [];
  const names = folk.filter((f) => !f.p.sender && !f.p.child).map((f) => f.p.name);
  if (names.length) home.toldPeople = 1;
  return names;
}

/** Offer the usual jobs once, unasked: the ones this home doesn't have yet. */
function offerIdeas(kit: Kit, here: Here, home: Home, jobs: Found[]): void {
  if (home.offered) return;
  const left = IDEA_JOBS.filter((i) => !jobs.some((j) => norm(j.job.name) === norm(i.name)));
  if (left.length < 2) return;
  home.offered = 1;
  const ref: IdeasRef = { kind: "ideas", home: hk(here), ids: left.map((i) => i.id) };
  kit.ask(copy.ideasQuestion(), left.map(ideaOption), { multiple: true, ref: ref as unknown as Json, intro: copy.ideasOffer(), ...to(here) });
}

/**
 * The step after a home's first job: when the job is due today, the person ticks it right
 * there with a 👍, which is how the app is learnt. Otherwise they are told when it comes.
 * `lead` is what was just understood, said in the same message.
 */
async function tryNow(kit: Kit, here: Here, home: Home, f: Found, jobs: Found[], folk: Folk, lead: string | null): Promise<void> {
  const today = kit.today;
  const due = home.sent !== today && f.job.last?.occ !== today && dueOn(f.job.rhythm, today);
  const parts = lead ? [lead] : [];
  if (due) {
    // Today's list is this one message: the morning's doesn't go out a second time today.
    f.job = { ...f.job, open: today };
    await saveJob(kit, here, f);
    home.sent = today;
    home.last = [];
    home.taughtList = 1;
    const ref: OneRef = { kind: "one", home: hk(here), day: today, job: f.id };
    kit.send([...parts, copy.tryNow()].join("\n\n"), { ref: ref as unknown as Json, ...to(here) });
    return saveHome(kit, here, home);
  }
  const next = nextAfter(f.job.rhythm, today);
  parts.push(next ? copy.firstLater({ day: next, hour: home.hour }) : copy.firstAsked({ name: f.job.name }));
  const add = unseen(here, home, folk);
  if (add.length) parts.push(copy.addThem({ names: add }));
  kit.send(parts.join("\n\n"), to(here));
  offerIdeas(kit, here, home, jobs);
  await saveHome(kit, here, home);
}

async function sayKept(kit: Kit, here: Here, home: Home, a: Added, jobs: Found[], folk: Folk, sender: Sender): Promise<void> {
  if (a.status === "full") return kit.send(copy.jobsFull({ max: MAX_JOBS }));
  if (a.status === "peopleFull") return kit.send(copy.peopleFull({ max: MAX_PEOPLE }));
  const { job } = a.f;
  const said =
    a.few && !job.rota.length
      ? copy.whoTakesTurns({ name: job.name, known: folk.map((f) => f.p.name) })
      : copy.jobSaid({ name: job.name, rhythm: job.rhythm, rota: job.rota.map((id) => nameOf(folk, id) ?? "Someone"), next: nameOf(folk, turnOf(job, folk, kit.today).who) });
  if (!a.first) return kit.send(said);

  // The first job in this home. Which name in its rota is the person who sent it? When their
  // WhatsApp name says, nothing is asked. When it doesn't, that is asked first, once.
  const given = sender.name ?? (sender.owner ? kit.person.name : null);
  const short = first(given);
  const known = folk.some((f) => f.p.sender === sender.id || (!f.p.sender && ((given && same(f.p.name, given)) || (short && same(f.p.name, short)))));
  const rota = job.rota.map((id) => folk.find((x) => x.id === id)).filter((x): x is Folk[number] => !!x && !x.p.sender);
  if (!known && rota.length) {
    home.asking = { sender: sender.id, job: a.f.id, ids: rota.map((p) => p.id) };
    await saveHome(kit, here, home);
    kit.send(said);
    const ref: MeRef = { kind: "me", home: hk(here), sender: sender.id };
    kit.ask(copy.whichIsYou(), [...rota.map((p) => p.p.name), copy.noneOfThem()], { ref: ref as unknown as Json, confirm: false });
    return;
  }
  if (known) await meet(kit, here, sender, folk);
  await tryNow(kit, here, home, a.f, jobs, folk, said);
}

async function removeJob(kit: Kit, here: Here, f: Found): Promise<void> {
  await kit.store.delete("jobs", `${hk(here)}:${f.id}`);
}

/** Take a person out of the home: out of every rota, and no longer known. What they did stays counted. */
async function removePerson(kit: Kit, here: Here, id: string, jobs: Found[]): Promise<void> {
  for (const f of jobs) {
    const job = without(f.job, id);
    if (job !== f.job) {
      f.job = job;
      await saveJob(kit, here, f);
    }
  }
  await kit.store.delete("people", `${hk(here)}:${id}`);
}

// ── Showing ──

function dayRows(home: Home, jobs: Found[], folk: Folk, today: string): (DayRow & { id: string })[] {
  const rows: (DayRow & { id: string })[] = [];
  for (const f of jobs) {
    if (dueToday(f.job, home, today)) rows.push({ id: f.id, name: f.job.name, who: nameOf(folk, turnOf(f.job, folk, today).who) });
    else if (f.job.last?.day === today) rows.push({ id: f.id, name: f.job.name, who: null, done: { by: nameOf(folk, f.job.last.by) } });
  }
  return rows;
}

function showToday(kit: Kit, home: Home, jobs: Found[], folk: Folk): void {
  const rows = dayRows(home, jobs, folk, kit.today);
  kit.send(rows.length ? copy.today({ rows }) : copy.nothingToday());
}

function showJobs(kit: Kit, jobs: Found[], folk: Folk): void {
  if (!jobs.length) return kit.send(copy.noJobs());
  kit.send(copy.jobs({ jobs: jobs.map(({ job }) => ({ name: job.name, rhythm: job.rhythm, rota: job.rota.map((id) => nameOf(folk, id) ?? "Someone"), next: nameOf(folk, turnOf(job, folk, kit.today).who) })) }));
}

function showTurn(kit: Kit, home: Home, f: Found, folk: Folk): void {
  const today = kit.today;
  const open = dueToday(f.job, home, today);
  kit.send(copy.turn({ name: f.job.name, who: nameOf(folk, turnOf(f.job, folk, today).who), when: open ? "today" : f.job.rhythm.kind === "asked" ? "asked" : nextAfter(f.job.rhythm, today) }));
}

async function showCount(kit: Kit, here: Here, folk: Folk, lastMonth: boolean): Promise<void> {
  const month = lastMonth ? shift(`${kit.today.slice(0, 7)}-01`, -1).slice(0, 7) : kit.today.slice(0, 7);
  const c = await countOf(kit, here, `${month}-01`, `${month}-31`, folk);
  if (!c.total) return kit.send(copy.noCount({ when: `in ${sayMonth(month)}` }));
  kit.send(copy.count({ title: sayMonth(month), rows: c.rows, total: c.total }));
}

function askIdeas(kit: Kit, here: Here): void {
  const ref: IdeasRef = { kind: "ideas", home: hk(here), ids: IDEA_JOBS.map((i) => i.id) };
  kit.ask(copy.ideasQuestion(), IDEA_JOBS.map(ideaOption), { multiple: true, ref: ref as unknown as Json, intro: copy.ideasIntro(), ...to(here) });
}

/**
 * A job was ticked. What is said depends on what this home has learnt: the first tick by a
 * reaction or by words gets the whole picture, once; the first time someone does another
 * person's job gets one line about credit and turns, once; after that, a ✅ or nothing.
 */
async function afterTick(kit: Kit, here: Here, home: Home, f: Found, r: Ticked, jobs: Found[], folk: Folk, via: "words" | "reaction" | "poll"): Promise<void> {
  if (r.status === "already") return via === "words" ? kit.send(copy.alreadyDone({ name: f.job.name, by: r.by })) : undefined;
  if (r.status === "notDue") return via === "words" ? kit.send(copy.notDue({ name: f.job.name, next: nextAfter(f.job.rhythm, kit.today), who: nameOf(folk, turnOf(f.job, folk, kit.today).who) })) : undefined;
  if (via !== "poll" && !home.taughtDone) {
    home.taughtDone = 1;
    home.taughtList = 1;
    const add = unseen(here, home, folk);
    kit.send([copy.firstDone({ name: f.job.name, by: r.by, next: r.next, hour: home.hour }), ...(add.length ? [copy.addThem({ names: add })] : [])].join("\n\n"), to(here));
    offerIdeas(kit, here, home, jobs);
    return saveHome(kit, here, home);
  }
  if (r.covered && r.by && !home.taughtCover) {
    home.taughtCover = 1;
    await saveHome(kit, here, home);
    return kit.send(copy.firstCover({ name: f.job.name, by: r.by, turn: r.covered, next: r.next, turns: home.turns, owner: ownerName(kit) }), to(here));
  }
  if (via !== "poll") kit.react(DONE);
}

// ── People ──

async function setAway(kit: Kit, here: Here, f: Folk[number], back: string | "open" | null): Promise<void> {
  f.p = { ...f.p, back };
  await savePerson(kit, here, f.id, f.p);
}

/** "I'm Ravi": the sender is the Ravi of the rotas. What they did under another name moves over. */
async function claim(kit: Kit, here: Here, sender: Sender, target: Folk[number], folk: Folk, jobs: Found[]): Promise<"ok" | "taken"> {
  if (target.p.sender === sender.id) return "ok";
  if (target.p.sender) return "taken";
  const mine = folk.find((f) => f.p.sender === sender.id);
  target.p = { ...target.p, sender: sender.id };
  await savePerson(kit, here, target.id, target.p);
  if (!mine) return "ok";
  for (const d of await kit.store.list<Done>("done", { prefix: `${hk(here)}:` })) {
    if (d.data.by !== mine.id && d.data.turn !== mine.id) continue;
    await kit.store.put("done", d.key, { ...d.data, by: d.data.by === mine.id ? target.id : d.data.by, turn: d.data.turn === mine.id ? target.id : d.data.turn, who: d.data.by === mine.id ? target.p.name : d.data.who } as unknown as Json, d.sort ?? kit.time.day(d.data.at));
  }
  for (const f of jobs) {
    let job = f.job;
    if (job.rota.includes(mine.id)) job = job.rota.includes(target.id) ? without(job, mine.id) : { ...job, rota: job.rota.map((r) => (r === mine.id ? target.id : r)) };
    if (job.last?.by === mine.id) job = { ...job, last: { ...job.last, by: target.id } };
    if (job !== f.job) {
      f.job = job;
      await saveJob(kit, here, f);
    }
  }
  await kit.store.delete("people", `${hk(here)}:${mine.id}`);
  return "ok";
}

/** Swap two people's next turns at a job, once each. */
async function swap(kit: Kit, here: Here, f: Found, a: Folk[number], b: Folk[number]): Promise<string | null> {
  for (const p of [a, b]) if (!f.job.rota.includes(p.id)) return copy.notInRota({ name: p.p.name, job: f.job.name });
  if (a.id === b.id) return copy.swapHow();
  f.job = { ...f.job, over: { ...(f.job.over ?? {}), [a.id]: b.id, [b.id]: a.id } };
  await saveJob(kit, here, f);
  return null;
}

// ── Messages ──

type Ctx = { kit: Kit; here: Here; home: Home; jobs: Found[]; folk: Folk; sender: Sender; /** The people tagged in the message. */ tagged: Folk };

const ownerName = (kit: Kit) => first(kit.person.name);

/** "Which of these is you?" is settled: the question goes, and the first use carries on. */
async function answered(kit: Kit, here: Here, home: Home, jobs: Found[], folk: Folk, lead: string | null): Promise<void> {
  const asking = home.asking;
  if (!asking) return;
  kit.close({ kind: "me", home: hk(here), sender: asking.sender } as unknown as Json);
  home.asking = null;
  const f = jobs.find((j) => j.id === asking.job);
  if (f) return tryNow(kit, here, home, f, jobs, folk, lead);
  await saveHome(kit, here, home);
  if (lead) kit.send(lead, to(here));
}

/** The ready-made messages. True when the text was one. */
async function command(c: Ctx, text: string, lower: string): Promise<boolean> {
  const { kit, here, home, jobs, folk, sender } = c;
  let m: RegExpMatchArray | null;

  if (/^(today|todays jobs|today's jobs|what'?s (due |on )?today|whats (due |on )?today|due today|what is due today)\??$/.test(lower)) return showToday(kit, home, jobs, folk), true;
  if (/^(jobs|chores|rota|rotas|all jobs|all chores|the jobs|show (the )?(jobs|chores|rota))\??$/.test(lower)) return showJobs(kit, jobs, folk), true;
  if ((m = lower.match(/^(?:who did what|who has done what|who did how many|count|tally|the count)(?: (this|last) month| so far)?\??$/))) return await showCount(kit, here, folk, m[1] === "last"), true;
  if (/^(ideas|idea|suggest|suggestions|suggest jobs|what jobs)\??$/.test(lower)) return askIdeas(kit, here), true;

  // Settings, for the person who added the app.
  if ((m = lower.match(/^turns?(?: (stay|stays|move|moves|move on|moves on))?$/))) {
    if (!m[1]) return kit.send(copy.turnsNow({ turns: home.turns })), true;
    if (!sender.owner) return kit.send(copy.ownerOnly({ owner: ownerName(kit) })), true;
    const turns = m[1].startsWith("stay") ? "stay" : "move";
    if (turns !== home.turns) await saveHome(kit, here, { ...home, turns });
    return kit.send(copy.turnsChanged({ turns })), true;
  }
  if ((m = lower.match(/^(?:list at|send (?:it |the list )?at|ask at|time|hour)\s+(.+)$/))) {
    if (!sender.owner) return kit.send(copy.ownerOnly({ owner: ownerName(kit) })), true;
    const hour = readHour(m[1]);
    if (hour === null) return kit.send(copy.hourHow()), true;
    await saveHome(kit, here, { ...home, hour });
    return kit.send(copy.hourSet({ hour })), true;
  }
  if ((m = lower.match(/^weekly count (on|off)$/))) {
    if (!sender.owner) return kit.send(copy.ownerOnly({ owner: ownerName(kit) })), true;
    await saveHome(kit, here, { ...home, weekly: m[1] === "on" });
    if (m[1] === "on") kit.send(copy.weeklyOn());
    else kit.react(SAVED);
    return true;
  }
  if ((m = text.match(/^(.+?) is (not |no longer )?a (?:child|kid)$/i))) {
    const p = byName(folk, m[1]);
    if (p) {
      if (!sender.owner) return kit.send(copy.ownerOnly({ owner: ownerName(kit) })), true;
      p.p = { ...p.p, child: !m[2] };
      if (m[2]) delete p.p.child;
      await savePerson(kit, here, p.id, p.p);
      return kit.react(SAVED), true;
    }
  }

  // Away and back.
  if ((m = text.match(/^(?:(i|i'm|im|i am|i will be|i'll be|me)|(.+?))(?:\s+(?:is|am|are|will be))?\s+away(?:\s+(.*))?$/i))) {
    const who = m[1] ? await meet(kit, here, sender, folk) : byName(folk, m[2]);
    if (who) {
      const back = readBack(m[3] ?? "", kit.today);
      if (back === null) return kit.send(copy.awayWhen()), true;
      await setAway(kit, here, who, back);
      return kit.send(copy.away({ name: who.p.name, back: back === "open" ? null : back })), true;
    }
    if (m[2] && readNames(m[2])?.length === 1 && !home.shared) return kit.send(copy.noSuchPerson({ name: m[2] })), true;
  }
  if ((m = text.match(/^(?:(i'm|im|i am|i)|(.+?))(?:\s+(?:is|am|are))?\s+back$/i))) {
    const who = m[1] ? await meet(kit, here, sender, folk) : byName(folk, m[2]);
    if (who) {
      await setAway(kit, here, who, null);
      return kit.react(SAVED), true;
    }
  }

  // "I'm Ravi": which name in the rotas the sender is.
  if ((m = text.match(/^(?:i'm|im|i am|this is|call me)\s+(\p{L}[\p{L}'.-]{0,19})$/iu))) {
    const target = byName(folk, m[1]);
    if (target) {
      const r = await claim(kit, here, sender, target, folk, jobs);
      if (r === "taken") kit.send(copy.nameTaken({ name: target.p.name }));
      else if (home.asking?.sender === sender.id) await answered(kit, here, home, jobs, await folkOf(kit, here), copy.youAre({ name: target.p.name }));
      else kit.react(SAVED);
      return true;
    }
    if (/^call me/i.test(text)) {
      const me = await meet(kit, here, sender, folk);
      me.p = { ...me.p, name: m[1][0].toUpperCase() + m[1].slice(1) };
      await savePerson(kit, here, me.id, me.p);
      return kit.react(SAVED), true;
    }
  }

  // Swap: "swap bins with Asha" (mine with hers), "swap bins Ravi with Asha".
  if ((m = text.match(/^swap\s+(?:the\s+)?(.+?)\s+(\p{L}+)\s+(?:with|and)\s+(\p{L}+)$/iu))) {
    const f = findJob(jobs, m[1]);
    const a = byName(folk, m[2]);
    const b = byName(folk, m[3]);
    if (f && a && b) {
      const problem = await swap(kit, here, f, a, b);
      return kit.send(problem ?? copy.swapped({ job: f.job.name, a: a.p.name, b: b.p.name })), true;
    }
  }
  if ((m = text.match(/^swap\s+(?:the\s+)?(?:my\s+)?(.+?)\s+with\s+(\p{L}+)$/iu))) {
    const f = findJob(jobs, m[1].replace(/\s+turn$/i, ""));
    if (f) {
      const b = byName(folk, m[2]);
      if (!b) return kit.send(copy.noSuchPerson({ name: m[2] })), true;
      const a = await meet(kit, here, sender, folk);
      const problem = await swap(kit, here, f, a, b);
      return kit.send(problem ?? copy.swapped({ job: f.job.name, a: a.p.name, b: b.p.name })), true;
    }
  }

  // Whose turn.
  if ((m = lower.match(/^(?:whose turn (?:is it )?(?:is |for |to do |on |at )?|who(?:'s| is| has| does| did)? (?:on |doing |got |has |does )?|who's turn (?:is |for )?)(?:the )?(.+?)(?: today| next| this week)?\??$/))) {
    const f = findJob(jobs, m[1]);
    if (f) return showTurn(kit, home, f, folk), true;
  }
  if ((m = lower.match(/^(.+)\?$/))) {
    const f = findJob(jobs, m[1]);
    if (f) return showTurn(kit, home, f, folk), true;
  }

  // Taking a tick back, before "done": "bins not done".
  if ((m = lower.match(/^(?:undo|untick|not done)(?: the)? (.+)$/) ?? lower.match(/^(.+?) (?:is |was |are |were )?(?:not done|wasn'?t done|not ticked)$/))) {
    const f = findJob(jobs, m[1]);
    if (f) {
      if (await untick(kit, here, f, sender)) kit.react(SAVED);
      else kit.send(copy.notDue({ name: f.job.name, next: null, who: null }));
      return true;
    }
  }
  // Needed: a job with no fixed day joins the list.
  if ((m = lower.match(/^(.+?) (?:is |are |has |have )?(?:needed|due|running out|run out|ran out|low|empty|over|finished)$/) ?? lower.match(/^(?:need|we need|needs|book|get|buy|order)(?: the| a| to)? (.+)$/))) {
    const f = findJob(jobs, m[1]);
    if (f && f.job.rhythm.kind === "asked") {
      if (!f.job.open) {
        f.job = { ...f.job, open: kit.today };
        await saveJob(kit, here, f);
      }
      return kit.send(copy.needed({ name: f.job.name, who: nameOf(folk, turnOf(f.job, folk, kit.today).who) })), true;
    }
  }
  // Done.
  if ((m = lower.match(/^(?:done|did|finished|completed|ticked?)(?: with)?(?: the)? (.+)$/) ?? lower.match(/^(.+?) (?:is |are |all |was |were )?(?:done|finished|booked|paid|sorted|ticked|taken out|cleaned)$/))) {
    const f = findJob(jobs, m[1]);
    if (f) {
      await afterTick(kit, here, home, f, await tick(kit, here, home, f, sender, folk), jobs, folk, "words");
      return true;
    }
  }

  // Changing a job.
  if ((m = text.match(/^(?:remove|delete|drop|stop)(?:\s+the)?(?:\s+(?:job|chore))?\s+(.+)$/i))) {
    const f = findJob(jobs, m[1]);
    if (f) {
      await removeJob(kit, here, f);
      return kit.react(SAVED), true;
    }
    const p = byName(folk, m[1]);
    if (p) {
      await removePerson(kit, here, p.id, jobs);
      return kit.react(SAVED), true;
    }
  }
  if ((m = text.match(/^rename\s+(.+?)\s+(?:to|as)\s+(.+)$/i))) {
    const f = findJob(jobs, m[1]);
    const name = cleanName(m[2]);
    if (f && name) {
      f.job = { ...f.job, name };
      await saveJob(kit, here, f);
      return kit.react(SAVED), true;
    }
  }
  if ((m = text.match(/^(.+?)\s+(?:rota|turns)\s*[:,]?\s+(.+)$/i) ?? text.match(/^rota\s+(?:for\s+)?(.+?)\s*[:,]\s*(.+)$/i))) {
    const f = findJob(jobs, m[1]);
    const rota = f ? readRota(m[2]) : undefined;
    if (f && rota !== undefined) {
      const a = await keepJob(kit, here, home, { name: f.job.name, rhythm: f.job.rhythm, rota: rota ?? [] }, jobs, folk);
      return await sayKept(kit, here, home, a, jobs, folk, sender), true;
    }
  }
  // "bins every monday": a new rhythm for a job, or a new job.
  // People tagged with an @ stand for typed names: "bins rota @Ravi @Asha".
  if (c.tagged.length && (m = text.match(/^(.+?)\s+(?:rota|turns)\s*[:,]?$/i))) {
    const f = findJob(jobs, m[1]);
    if (f) {
      const a = await keepJob(kit, here, home, { name: f.job.name, rhythm: f.job.rhythm, rota: c.tagged.map((p) => p.p.name) }, jobs, folk);
      return await sayKept(kit, here, home, a, jobs, folk, sender), true;
    }
  }
  const read = readJob(text, kit.today);
  if (read) {
    if (c.tagged.length && read.rota === null) read.rota = c.tagged.map((p) => p.p.name);
    // Named like an existing job ("the bins every Monday"): that job changes.
    const known = findJob(jobs, read.name);
    const a = await keepJob(kit, here, home, known ? { ...read, name: known.job.name } : read, jobs, folk);
    return await sayKept(kit, here, home, a, jobs, folk, sender), true;
  }
  return false;
}

/** Does a message name a job, or the app? Then it was meant for me even in a group that talks. */
const meant = (jobs: Found[], lower: string): boolean => /\bchores?\b/.test(lower) || jobs.some((j) => ` ${norm(lower)} `.includes(` ${norm(j.job.name)} `));

// ── The page ──

interface PageDay {
  day: string;
  jobs: { id: string; name: string; who: string | null }[];
}

/** The days after today, with whose turn each job would be if every turn before it is taken. */
function ahead(home: Home, jobs: Found[], folk: Folk, today: string): PageDay[] {
  const sim = jobs.map((f) => ({ id: f.id, job: { ...f.job, over: { ...(f.job.over ?? {}) } } }));
  const out: PageDay[] = [];
  for (let i = 0; i < AHEAD; i++) {
    const day = shift(today, i);
    const rows: PageDay["jobs"] = [];
    for (const s of sim) {
      const due = i === 0 ? dueToday(s.job, home, today) : dueOn(s.job.rhythm, day);
      if (!due) continue;
      const t = turnOf(s.job, folk, day);
      rows.push({ id: s.id, name: s.job.name, who: nameOf(folk, t.who) });
      if (t.slot) {
        s.job.at = (s.job.rota.indexOf(t.slot) + 1) % s.job.rota.length;
        delete s.job.over[t.slot];
      }
    }
    if (i > 0) out.push({ day, jobs: rows });
  }
  return out;
}

async function pageHome(kit: Kit, here: Here, home: Home, month: string): Promise<Json> {
  const today = kit.today;
  const jobs = await jobsOf(kit, here);
  const folk = await folkOf(kit, here);
  const c = await countOf(kit, here, `${month}-01`, `${month}-31`, folk);
  const firstDone = (await kit.store.list<Done>("done", { prefix: `${hk(here)}:`, limit: 1 }))[0];
  return {
    key: here,
    name: home.name,
    hour: home.hour,
    turns: home.turns,
    weekly: home.weekly,
    today: dayRows(home, jobs, folk, today),
    week: ahead(home, jobs, folk, today),
    jobs: jobs.map(({ id, job }) => ({
      id,
      name: job.name,
      rhythm: job.rhythm,
      rota: job.rota.map((r) => ({ id: r, name: nameOf(folk, r) ?? "Someone" })),
      next: nameOf(folk, turnOf(job, folk, today).who),
      nextDay: dueToday(job, home, today) ? today : nextAfter(job.rhythm, today),
    })),
    people: folk.map(({ id, p }) => ({ id, name: p.name, linked: !!p.sender, back: p.back, away: isAway(p, today), child: p.child === true })),
    count: { month, rows: c.rows, total: c.total },
    since: typeof firstDone?.sort === "string" ? firstDone.sort.slice(0, 7) : null,
  } as unknown as Json;
}

async function page(kit: Kit, args: Record<string, Json>): Promise<Json> {
  const month = typeof args.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(args.month) ? args.month : kit.today.slice(0, 7);
  const stored = await kit.store.list<Home>("homes");
  const homes: Json[] = [];
  if (!stored.some((h) => h.key === MAIN)) homes.push(await pageHome(kit, null, freshHome(), month));
  for (const h of stored) if (!h.data.left) homes.push(await pageHome(kit, hereOf(h.key), h.data, month));
  // The app's own group first.
  homes.sort((a, b) => Number((a as { key: Here }).key !== null) - Number((b as { key: Here }).key !== null));
  return { today: kit.today, month, homes };
}

/** The home a page action is about, with what is in it. */
async function ctxOf(kit: Kit, home: Json | undefined): Promise<Ctx> {
  const here: Here = typeof home === "string" && home !== MAIN ? home : null;
  const stored = await kit.store.get<Home>("homes", hk(here));
  if (here && (!stored || stored.left)) throw new Error("That group isn't kept by Chores any more.");
  return { kit, here, home: stored ?? freshHome(), jobs: await jobsOf(kit, here), folk: await folkOf(kit, here), sender: ownerSender(kit), tagged: [] };
}
function jobOf(c: Ctx, id: Json | undefined): Found {
  const f = c.jobs.find((j) => j.id === id);
  if (!f) throw new Error("That job isn't kept any more.");
  return f;
}
function personOf(c: Ctx, id: Json | undefined): Folk[number] {
  const p = c.folk.find((f) => f.id === id);
  if (!p) throw new Error("That person isn't in this home any more.");
  return p;
}
/** A rota from the page: a list of names. */
function namesOf(v: Json | undefined): string[] {
  if (!Array.isArray(v) || v.some((n) => typeof n !== "string")) throw new Error("A rota is a list of names.");
  const names = readNames((v as string[]).map((n) => n.trim()).filter(Boolean).join(", "));
  if ((v as string[]).length && !names) throw new Error("A name is one or two words, letters only.");
  if ((names?.length ?? 0) > MAX_ROTA) throw new Error(`A rota takes ${MAX_ROTA} people at most.`);
  return names ?? [];
}

export default definePlugin({
  id: "chores",
  version: "1.0.0",
  sdk: "1",
  name: "Chores",
  icon: "🧹",
  tagline: "A home's jobs, taken in turns. The day's list arrives each morning.",
  description:
    "For flatmates, couples and families. Tell the home's WhatsApp group each job, how often it comes round and who takes turns, like \"bins every day, Ravi Asha Kiran\". Each morning the day's jobs arrive as one list to tick. Whoever ticks a job did it, and the turn moves on to the next person. Nobody else in the home installs anything.",
  groupName: copy.groupName(),
  price: 0,
  // Tier 1: a few jobs and people per home, and one list a day.
  tier: 1,
  // "members": everyone in the home ticks and takes turns. "groups": it takes the group the home already has.
  permissions: ["members", "groups"],
  // Still being tried out.
  unlisted: true,
  listing: {
    title: "Chore Chart and Rota for a Shared Home | Zelfred",
    description: "Tell me your home's jobs and who takes turns. Each morning I send the day's list to tick and say whose turn it is. Your flatmates install nothing.",
    h1: "A chore rota your flatmates don't have to install",
  },
  welcome: copy.welcome(),
  help: copy.help(),
  // Hourly, because each home picks its own hour for the list.
  schedules: [{ id: "day", hour: "hourly" }],

  understand: {
    intents: {
      add_job: "Add a household job with how often it comes round and who takes turns, or change one",
      done: "Say that a household job has been done",
      undo: "Take back that a job was done",
      whose_turn: "Ask whose turn a job is",
      today: "Ask what is due today",
      list_jobs: "See all the jobs and rotas",
      count: "Ask who did how many jobs",
      away: "Say that someone is away and should be skipped",
      back: "Say that someone is back",
      remove_job: "Remove a job",
    },
    async targets(kit) {
      return Object.fromEntries((await kit.store.list<Job>("jobs", { limit: 50 })).map((j) => [j.key, j.data.name]));
    },
  },

  async onGroup(event, kit) {
    const here = event.key;
    const known = await kit.store.get<Home>("homes", here);
    if (event.kind === "left") {
      // Zelfred has stopped listening there. What is kept stays, in case the group comes back; nothing is sent.
      if (known) await saveHome(kit, here, { ...known, left: 1, last: [] });
      return;
    }
    const home: Home = { ...(known ?? freshHome()), name: event.name.replace(/\s+/g, " ").trim().slice(0, 100), shared: 1 };
    delete home.left;
    await saveHome(kit, here, home);
    kit.send(copy.joinedGroup());
  },

  async onSchedule(event, kit) {
    if (event.id !== "day") return;
    const hour = kit.time.hour(kit.now);
    for (const h of await kit.store.list<Home>("homes")) {
      // At its hour, or later the same day when that hour was missed.
      if (h.data.left || h.data.sent === kit.today || hour < h.data.hour) continue;
      await morning(kit, hereOf(h.key), h.data);
    }
  },

  async onMessage(event, kit) {
    const text = event.text.replace(/\s+/g, " ").trim();
    if (!text) return;
    const lower = text.toLowerCase().replace(/[!.]+$/, "");
    const here: Here = event.group ?? null;
    const sender = senderOf(event, kit);
    const home = await homeOf(kit, here);
    if (!sender.owner && !home.shared) {
      home.shared = 1;
      await saveHome(kit, here, home);
    }
    const c: Ctx = { kit, here, home, jobs: await jobsOf(kit, here), folk: await folkOf(kit, here), sender, tagged: [] };
    // Someone tagged is someone in the group: known from now on, by the name they have there.
    for (const who of event.mentions ?? []) {
      const p = await meet(kit, here, who, c.folk);
      if (!c.tagged.some((t) => t.id === p.id)) c.tagged.push(p);
    }
    if (await command(c, text, lower)) return;
    // In a group where people also just talk, only a message that names a job or the app gets an answer.
    if (home.shared && !meant(c.jobs, lower)) return;
    kit.unsure(copy.unsure());
  },

  async onIntent(event, kit) {
    const here: Here = event.group ?? null;
    const sender = senderOf(event, kit);
    const home = await homeOf(kit, here);
    const jobs = await jobsOf(kit, here);
    const folk = await folkOf(kit, here);
    const lower = norm(event.text);
    const prefix = `${hk(here)}:`;
    const f = (event.target?.startsWith(prefix) ? jobs.find((j) => j.id === event.target!.slice(prefix.length)) : undefined) ?? jobs.find((j) => ` ${lower} `.includes(` ${norm(j.job.name)} `)) ?? null;
    const who = folk.find((p) => new RegExp(`\\b${p.p.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower));

    switch (event.intent) {
      case "today":
        return showToday(kit, home, jobs, folk);
      case "list_jobs":
        return showJobs(kit, jobs, folk);
      case "count":
        return showCount(kit, here, folk, /\blast month\b/.test(lower));
      case "whose_turn":
        return f ? showTurn(kit, home, f, folk) : kit.send(copy.whichJob());
      case "done":
        if (!f) return kit.send(copy.whichJob());
        return afterTick(kit, here, home, f, await tick(kit, here, home, f, sender, folk), jobs, folk, "words");
      case "undo":
        if (!f) return kit.send(copy.whichJob());
        return (await untick(kit, here, f, sender)) ? kit.react(SAVED) : kit.send(copy.notDue({ name: f.job.name, next: null, who: null }));
      case "remove_job":
        if (!f) return kit.send(copy.whichJob());
        await removeJob(kit, here, f);
        return kit.react(SAVED);
      case "away": {
        const p = who ?? (await meet(kit, here, sender, folk));
        const after = event.text.match(/\b(?:till|til|until|upto|up to|for|back on)\b.*$/i)?.[0] ?? "";
        const back = readBack(after, kit.today);
        if (back === null) return kit.send(copy.awayWhen());
        await setAway(kit, here, p, back);
        return kit.send(copy.away({ name: p.p.name, back: back === "open" ? null : back }));
      }
      case "back": {
        const p = who ?? (await meet(kit, here, sender, folk));
        await setAway(kit, here, p, null);
        return kit.react(SAVED);
      }
      case "add_job": {
        const line = event.text.replace(/^(?:can you |could you |i want to |we want to |we need to |let'?s |lets )?(?:add|start|set up|make|create|track)\s+/i, "");
        // A job that exists, with a new rhythm said loosely: that job changes.
        const rhythm = f ? readRhythm(event.text, kit.today) : null;
        if (f && rhythm) return sayKept(kit, here, home, await keepJob(kit, here, home, { name: f.job.name, rhythm, rota: null }, jobs, folk), jobs, folk, sender);
        const read = readJob(line, kit.today);
        if (read) return sayKept(kit, here, home, await keepJob(kit, here, home, read, jobs, folk), jobs, folk, sender);
        return kit.send(copy.addHow());
      }
    }
  },

  async onAnswer(event, kit) {
    const sender = senderOf(event, kit);
    if (isMeRef(event.ref)) {
      const here = hereOf(event.ref.home);
      const home = await homeOf(kit, here);
      // Only the person who was asked can say who they are.
      if (!home.asking || sender.id !== event.ref.sender) return;
      const jobs = await jobsOf(kit, here);
      const folk = await folkOf(kit, here);
      const target = folk.find((p) => p.id === home.asking!.ids[event.choice]);
      const mine = target ? await claim(kit, here, sender, target, folk, jobs) : null;
      if (!target) await meet(kit, here, sender, folk);
      return answered(kit, here, home, await jobsOf(kit, here), await folkOf(kit, here), target && mine === "ok" ? copy.youAre({ name: target.p.name }) : null);
    }
    if (isIdeasRef(event.ref)) {
      const offered = event.ref.ids ?? IDEA_JOBS.map((i) => i.id);
      const ideaAt = (i: number) => IDEA_JOBS.find((x) => x.id === offered[i]);
      const here = hereOf(event.ref.home);
      const home = await homeOf(kit, here);
      const jobs = await jobsOf(kit, here);
      const folk = await folkOf(kit, here);
      for (const i of event.added ?? []) {
        const idea = ideaAt(i);
        if (!idea || jobs.some((j) => norm(j.job.name) === norm(idea.name))) continue;
        const rhythm: Rhythm = idea.rhythm.kind === "every" ? { ...idea.rhythm, from: kit.today } : idea.rhythm;
        await keepJob(kit, here, home, { name: idea.name, rhythm, rota: null }, jobs, folk, idea.id);
      }
      for (const i of event.removed ?? []) {
        // A tick taken back takes the job back too, while nobody has touched it.
        const f = jobs.find((j) => j.job.idea !== undefined && j.job.idea === ideaAt(i)?.id);
        if (f && !f.job.last && !f.job.rota.length) await removeJob(kit, here, f);
      }
      return;
    }
    if (!isDayRef(event.ref)) return;
    const here = hereOf(event.ref.home);
    const home = await homeOf(kit, here);
    const jobs = await jobsOf(kit, here);
    const folk = await folkOf(kit, here);
    for (const i of event.added ?? []) {
      const f = jobs.find((j) => (event.ref as unknown as DayRef).ids[i] === j.id);
      // Ticked already by someone else, or gone: the first tick stands.
      if (f && f.job.open) await afterTick(kit, here, home, f, await tick(kit, here, home, f, sender, folk), jobs, folk, "poll");
    }
    for (const i of event.removed ?? []) {
      const f = jobs.find((j) => (event.ref as unknown as DayRef).ids[i] === j.id);
      if (f) await untick(kit, here, f, sender);
    }
  },

  /** A day with one job is a line to react to: 👍 or ✅ is "I did it", and taking it away takes it back. */
  async onReaction(event, kit) {
    if (!isOneRef(event.ref)) return;
    const here = hereOf(event.ref.home);
    const sender = senderOf(event, kit);
    const jobs = await jobsOf(kit, here);
    const f = jobs.find((j) => j.id === (event.ref as unknown as OneRef).job);
    if (!f) return;
    if (event.emoji === null) return void (await untick(kit, here, f, sender));
    if (!DONE_MARKS.has(bare(event.emoji)) || !f.job.open) return;
    const home = await homeOf(kit, here);
    const folk = await folkOf(kit, here);
    await afterTick(kit, here, home, f, await tick(kit, here, home, f, sender, folk), jobs, folk, "reaction");
  },

  web: {
    load: page,
    actions: {
      /** A new job, or a new rhythm and rota for the job with that name. `rota`: names, empty for anyone. */
      async addJob(kit, { home, name, rhythm, rota }) {
        const c = await ctxOf(kit, home);
        const clean = typeof name === "string" ? cleanName(name) : null;
        if (!clean) throw new Error("Give the job a short name.");
        const r = cleanRhythm(rhythm, kit.today);
        if (!r) throw new Error("Pick how often it comes round.");
        if (c.jobs.some((j) => norm(j.job.name) === norm(clean))) throw new Error("There is already a job with that name.");
        const a = await keepJob(kit, c.here, c.home, { name: clean, rhythm: r, rota: namesOf(rota) }, c.jobs, c.folk);
        if (a.status === "full") throw new Error(`A home keeps ${MAX_JOBS} jobs at most.`);
        if (a.status === "peopleFull") throw new Error(`A home keeps ${MAX_PEOPLE} people at most.`);
        return { id: a.f.id };
      },
      /** Change a job: any of its name, its rhythm and its rota (names, in order). */
      async setJob(kit, { home, id, name, rhythm, rota }) {
        const c = await ctxOf(kit, home);
        const f = jobOf(c, id);
        let job = { ...f.job };
        delete job.idea;
        if (name !== undefined) {
          const clean = typeof name === "string" ? cleanName(name) : null;
          if (!clean) throw new Error("Give the job a short name.");
          if (c.jobs.some((j) => j.id !== f.id && norm(j.job.name) === norm(clean))) throw new Error("There is already a job with that name.");
          job.name = clean;
        }
        if (rhythm !== undefined) {
          const r = cleanRhythm(rhythm, kit.today);
          if (!r) throw new Error("Pick how often it comes round.");
          job.rhythm = r;
        }
        if (rota !== undefined) {
          const ids: string[] = [];
          for (const n of namesOf(rota)) {
            const p = await named(kit, c.here, n, c.folk);
            if (!p) throw new Error(`A home keeps ${MAX_PEOPLE} people at most.`);
            if (!ids.includes(p.id)) ids.push(p.id);
          }
          // The same people in a new order keep the turn with the person whose it was.
          const whose = f.job.rota[f.job.at];
          job = { ...job, rota: ids, at: Math.max(0, ids.indexOf(whose)), over: Object.fromEntries(Object.entries(job.over ?? {}).filter(([a, b]) => ids.includes(a) && ids.includes(b))) };
        }
        f.job = job;
        await saveJob(kit, c.here, f);
      },
      /** Take a job away. What was ticked stays counted. The page asks first. */
      async removeJob(kit, { home, id }) {
        const c = await ctxOf(kit, home);
        await removeJob(kit, c.here, jobOf(c, id));
      },
      /** Tick a job as the person who added the app. */
      async tick(kit, { home, id }) {
        const c = await ctxOf(kit, home);
        const f = jobOf(c, id);
        const r = await tick(kit, c.here, c.home, f, c.sender, c.folk);
        if (r.status === "already") throw new Error("That one is already ticked.");
        if (r.status === "notDue") throw new Error("That job isn't on today's list.");
      },
      /** Take your own tick back. */
      async untick(kit, { home, id }) {
        const c = await ctxOf(kit, home);
        if (!(await untick(kit, c.here, jobOf(c, id), c.sender))) throw new Error("Only the person who ticked it can take it back.");
      },
      /** A job with no fixed day is needed: it joins the list. */
      async need(kit, { home, id }) {
        const c = await ctxOf(kit, home);
        const f = jobOf(c, id);
        if (f.job.open) return;
        f.job = { ...f.job, open: kit.today };
        await saveJob(kit, c.here, f);
      },
      async addPerson(kit, { home, name }) {
        const c = await ctxOf(kit, home);
        const names = typeof name === "string" ? readNames(name.replace(/[,;&/]/g, " ").trim()) : null;
        if (!names || names.length !== 1) throw new Error("A name is one word, letters only.");
        if (byName(c.folk, names[0])) throw new Error("That name is already in this home.");
        const p = await named(kit, c.here, names[0], c.folk);
        if (!p) throw new Error(`A home keeps ${MAX_PEOPLE} people at most.`);
        return { id: p.id };
      },
      /** Take a person out of the home and out of every rota. What they did stays counted. The page asks first. */
      async removePerson(kit, { home, id }) {
        const c = await ctxOf(kit, home);
        await removePerson(kit, c.here, personOf(c, id).id, c.jobs);
      },
      /** `back`: the day they are back, "open" for until they say, null for not away. */
      async setAway(kit, { home, id, back }) {
        const c = await ctxOf(kit, home);
        if (!(back === null || back === "open" || (isDay(back) && back > kit.today))) throw new Error("Pick a day after today.");
        await setAway(kit, c.here, personOf(c, id), back as string | null);
      },
      async setChild(kit, { home, id, child }) {
        const c = await ctxOf(kit, home);
        const p = personOf(c, id);
        p.p = { ...p.p, child: child === true };
        if (child !== true) delete p.p.child;
        await savePerson(kit, c.here, p.id, p.p);
      },
      async setHour(kit, { home, hour }) {
        const c = await ctxOf(kit, home);
        if (!(typeof hour === "number" && Number.isInteger(hour) && hour >= 0 && hour <= 23)) throw new Error("Pick an hour.");
        await saveHome(kit, c.here, { ...c.home, hour });
      },
      /** The rule for when someone else does your job. A change is said once in the group. */
      async setTurns(kit, { home, turns }) {
        const c = await ctxOf(kit, home);
        if (turns !== "move" && turns !== "stay") throw new Error("Pick one of the two rules.");
        if (turns === c.home.turns) return;
        await saveHome(kit, c.here, { ...c.home, turns });
        kit.send(copy.turnsChanged({ turns }), to(c.here));
      },
      async setWeekly(kit, { home, on }) {
        const c = await ctxOf(kit, home);
        await saveHome(kit, c.here, { ...c.home, weekly: on === true });
      },
    },
  },
});
