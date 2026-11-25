/**
 * Everything Chores puts on WhatsApp: its welcome and help, every reply, every list and every
 * reaction. index.ts decides what to say; this file decides how.
 *
 * A message is a list of wordings (see src/copy.ts) and one is picked each time. A message
 * takes its data and returns the whole text.
 */
import { fixed, msg } from "../../sdk";
import { weekday, type Rhythm } from "./when";

// ── Words the parser in index.ts reads back, and the examples shown to people. ──

/** The platform's own word: it sends this plugin's help. */
export const HELP = fixed("help");
export const EXAMPLE = fixed("bins every day, Ravi Asha Kiran");
export const EXAMPLE_TURNS = fixed("bathroom every Sunday, take turns");
export const EXAMPLE_ASKED = fixed("gas when needed");
export const EXAMPLE_MONTHLY = fixed("society bill monthly on the 5th");
export const TODAY = fixed("today");
export const JOBS = fixed("jobs");
export const IDEAS = fixed("ideas");
export const COUNT = fixed("who did what");
export const DONE_EXAMPLE = fixed("bins done");
export const NEEDED_EXAMPLE = fixed("gas needed");
export const TURN_EXAMPLE = fixed("whose turn is bins");
export const AWAY_EXAMPLE = fixed("Ravi away till the 12th");
export const BACK_EXAMPLE = fixed("Ravi back");
export const SWAP_EXAMPLE = fixed("swap bins with Asha");
export const ROTA_EXAMPLE = fixed("bins rota Ravi Asha Kiran");
export const REMOVE_EXAMPLE = fixed("remove bins");
export const ME_EXAMPLE = fixed("I'm Ravi");
export const HOUR_EXAMPLE = fixed("list at 7am");
export const TURNS_STAY = fixed("turns stay");
export const TURNS_MOVE = fixed("turns move on");
export const WEEKLY_ON = fixed("weekly count on");
export const WEEKLY_OFF = fixed("weekly count off");

// ── Reactions ──

/** On a change that was kept. */
export const SAVED = fixed("👍");
/** On a job that was done. */
export const DONE = fixed("✅");

// ── Saying days, hours and rhythms ──

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "12 Dec". */
export const sayDay = (day: string): string => `${Number(day.slice(8))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
/** "Fri 12 Dec". */
export const sayWeekday = (day: string): string => `${DAYS[weekday(day)]} ${sayDay(day)}`;
/** "November", from "2026-11" or a day. */
export const sayMonth = (month: string): string => MONTHS_LONG[Number(month.slice(5, 7)) - 1];
/** "8am", "12pm", "7pm". */
export const sayHour = (h: number): string => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
const ordinal = (n: number): string => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
const and = (items: string[]): string => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

/** "every day", "every Sunday", "every Mon, Wed and Fri", "every 3 days", "monthly on the 5th", "when needed". */
export function sayRhythm(r: Rhythm): string {
  if (r.kind === "daily") return "every day";
  if (r.kind === "asked") return "when needed";
  if (r.kind === "monthly") return `monthly on the ${ordinal(r.date)}`;
  if (r.kind === "every") return r.n === 2 ? "every other day" : r.n % 7 === 0 ? (r.n === 7 ? "every week" : `every ${r.n / 7} weeks`) : `every ${r.n} days`;
  const k = r.days.join(",");
  if (k === "1,2,3,4,5") return "on weekdays";
  if (k === "0,6") return "at weekends";
  return r.days.length === 1 ? `every ${DAYS_LONG[r.days[0]]}` : `every ${and(r.days.map((d) => DAYS[d]))}`;
}

/** Who a job is with, as a list shows it. */
const who = (name: string | null): string => name ?? "anyone";

/** One job of a day, as an answer shows it. */
export interface DayRow {
  name: string;
  /** Whose turn it is. Null: anyone. */
  who: string | null;
  /** Set once it is ticked: who did it. Null inside: nobody is named. */
  done?: { by: string | null } | null;
}

/** One job as `jobs` shows it. */
export interface JobRow {
  name: string;
  rhythm: Rhythm;
  /** The rota's names, in order. Empty: anyone. */
  rota: string[];
  /** Whose turn is next. Null: anyone. */
  next: string | null;
}

/** One line of the count. */
export interface CountRow {
  name: string;
  n: number;
}

const counted = (rows: CountRow[]): string => rows.map((r) => `${r.name} ${r.n}`).join("\n");
const jobsWord = (n: number): string => `${n} ${n === 1 ? "job" : "jobs"}`;

/** The jobs offered when someone asks for ideas, each with the rhythm it is added with. */
export const IDEA_JOBS: { id: string; name: string; rhythm: Rhythm }[] = [
  { id: "bins", name: "Bins", rhythm: { kind: "daily" } },
  { id: "dishes", name: "Dishes", rhythm: { kind: "daily" } },
  { id: "bathroom", name: "Bathroom", rhythm: { kind: "weekdays", days: [0] } },
  { id: "sweeping", name: "Sweeping", rhythm: { kind: "weekdays", days: [0] } },
  { id: "water-can", name: "Water can", rhythm: { kind: "asked" } },
  { id: "gas", name: "Book the gas", rhythm: { kind: "asked" } },
  { id: "help", name: "Pay the help", rhythm: { kind: "monthly", date: 1 } },
  { id: "society", name: "Society bill", rhythm: { kind: "monthly", date: 5 } },
  { id: "filter", name: "Water filter", rhythm: { kind: "every", n: 90, from: "" } },
];
/** An idea as its option on the poll reads. Matched on a tick by its place, not its text. */
export const ideaOption = (i: { name: string; rhythm: Rhythm }): string => `${i.name}, ${sayRhythm(i.rhythm)}`;

export const copy = {
  // ── What the plugin says about itself ──
  /** Asks for nothing: one thing to send, and the rest is shown as it happens. */
  welcome: msg([
    `🧹 *Chores*. Your home's jobs, taken in turns. I keep count, so nobody has to.\n\nStart with one job. Tell me what it is, how often it comes round and who takes turns, like:\n\n_${EXAMPLE}_\n\nUse the first names of the people you live with. I'll show you the rest as we go.`,
  ]),
  help: msg([
    [
      "*Chores*",
      "",
      "Tell me a job in your own words: what it is, how often, and who takes turns.",
      `_${EXAMPLE}_`,
      `_${EXAMPLE_TURNS}_`,
      `_${EXAMPLE_MONTHLY}_`,
      "Tagging people with an @ works in place of typing their names.",
      `_${EXAMPLE_ASKED}_ has no fixed day. Say _${NEEDED_EXAMPLE}_ and it joins the list.`,
      "",
      "Each morning I send the day's jobs as a list. Tick what you did. Whoever ticks a job did it.",
      "",
      `_${TODAY}_ shows what is due today`,
      `_${JOBS}_ shows every job and whose turn is next`,
      `_${TURN_EXAMPLE}_`,
      `_${DONE_EXAMPLE}_ ticks a job without the list`,
      `_${COUNT}_ shows who did how many this month`,
      `_${AWAY_EXAMPLE}_ skips Ravi until then. _${BACK_EXAMPLE}_ ends it early`,
      `_${SWAP_EXAMPLE}_ swaps your next turn with hers, once`,
      `_${ROTA_EXAMPLE}_ changes who takes turns`,
      `_${REMOVE_EXAMPLE}_ takes a job away`,
      `_${ME_EXAMPLE}_ tells me which name in a rota is you`,
      `_${IDEAS}_ offers jobs to pick from`,
      "",
      `The person who added me can also send _${HOUR_EXAMPLE}_, _${TURNS_STAY}_ or _${TURNS_MOVE}_, and _${WEEKLY_ON}_.`,
    ].join("\n"),
  ]),
  groupName: msg(["🧹 Chores"]),

  /** Said once in a group the home already had, when it becomes this app's. */
  joinedGroup: msg([
    `🧹 I keep this home's jobs now, and whose turn each one is.\n\nStart with one job. Tell me what it is, how often it comes round and who takes turns, like:\n\n_${EXAMPLE}_\n\nI'll show you the rest as we go. Nobody here installs anything.`,
  ]),

  // ── Jobs ──
  /** A job was added or changed: what I understood. */
  jobSaid: msg<{ name: string; rhythm: Rhythm; rota: string[]; next: string | null }>([
    ({ name, rhythm, rota, next }) => `*${name}*, ${sayRhythm(rhythm)}. ${rota.length > 1 ? `${and(rota)} take turns, ${next ?? rota[0]} first.` : rota.length === 1 ? `It is ${rota[0]}'s each time.` : "Anyone can do it."}`,
  ]),

  // ── The first time: one step at a time, each said once in a home ──
  /** After the first job, when I can't tell which name in its rota is the person who sent it. */
  whichIsYou: msg(["Which of these is you?"]),
  /** The last option of that question. Matched by its place, not its text. */
  noneOfThem: msg(["None of them"]),
  youAre: msg<{ name: string }>([({ name }) => `Noted: you are ${name} in the rotas.`]),
  /** The first job is due today: learn the tick by doing it. Sent on a message that takes the reaction. */
  tryNow: msg(["It is due today, so try it now. React 👍 to this message when it's done."]),
  /** The first job comes up on a later day. */
  firstLater: msg<{ day: string; hour: number }>([({ day, hour }) => `It first comes up on ${sayWeekday(day)}. That morning at ${sayHour(hour)} I send it here to tick. Whoever ticks a job did it, and the turn moves on.`]),
  /** The first job has no fixed day. */
  firstAsked: msg<{ name: string }>([({ name }) => `It has no fixed day. Say _${name.toLowerCase()} needed_ when it is, and it joins the day's list.`]),
  /** The first tick in a home, by a reaction or by words: what just happened, and what comes every morning. */
  firstDone: msg<{ name: string; by: string | null; next: string | null; hour: number }>([
    ({ name, by, next, hour }) =>
      `*${name}*: done${by ? ` by ${by}` : ""}.${next ? ` Next time it is ${next}'s.` : ""}\n\nThat is all there is to it. Each morning at ${sayHour(hour)} I send the day's jobs here as one list. Whoever ticks a job did it, and the turn moves on.\n\nFrom now on a ${DONE} means done.`,
  ]),
  /** People named in a rota who haven't been seen in the app's own group. Said once. */
  addThem: msg<{ names: string[] }>([({ names }) => `${and(names)} ${names.length === 1 ? "needs" : "need"} to be in this group to tick ${names.length === 1 ? "a job" : "their jobs"}. Add them here if they aren't yet. They install nothing.`]),
  /** The first time someone does a job that was another person's turn. */
  firstCover: msg<{ name: string; by: string; turn: string; next: string | null; turns: "move" | "stay"; owner: string | null }>([
    ({ name, by, turn, next, turns, owner }) =>
      turns === "move"
        ? `${by} did *${name}*, which was ${turn}'s turn. The credit is ${by}'s, and the turn moves on${next ? ` to ${next}` : ""} all the same. ${owner ?? "The person who added me"} can change that with _${TURNS_STAY}_.`
        : `${by} did *${name}*, which was ${turn}'s turn. The credit is ${by}'s, and it is still ${turn}'s turn next time.`,
  ]),
  /** The usual jobs, offered once, unasked, after the first job. The poll's own question: nothing is sent before it. */
  ideasOffer: msg(["What else does your home do? Tick any of these and I add each one, for anyone to do."]),

  /** "take turns" was said and fewer than two people are known here. */
  whoTakesTurns: msg<{ name: string; known: string[] }>([
    ({ name, known }) => `*${name}* is kept, for anyone to do. ${known.length ? `I only know ${and(known)} here so far.` : "I don't know who lives here yet."} Tell me who takes turns, like _${name.toLowerCase()} rota Ravi Asha Kiran_.`,
  ]),
  jobs: msg<{ jobs: JobRow[] }>([
    ({ jobs }) => `*Jobs*\n\n${jobs.map((j, i) => `${i + 1}. ${j.name} · ${sayRhythm(j.rhythm)} · ${j.rota.length ? `${who(j.next)} next (${j.rota.join(", ")})` : "anyone"}`).join("\n")}`,
  ]),
  noJobs: msg([`No jobs yet. Tell me one, how often and who takes turns, like _${EXAMPLE}_. Or send _${IDEAS}_ to pick from a list.`]),
  noSuchJob: msg<{ name: string }>([({ name }) => `I don't have a job called "${name}". Send _${JOBS}_ to see them.`]),
  whichJob: msg([`Which job? Send _${JOBS}_ to see them.`]),
  jobsFull: msg<{ max: number }>([({ max }) => `This home has ${max} jobs, which is as many as I keep. Remove one first, like _${REMOVE_EXAMPLE}_.`]),
  peopleFull: msg<{ max: number }>([({ max }) => `I keep up to ${max} people for a home, and this one has that many.`]),
  /** A job line I could read, with a rota I couldn't. */
  addHow: msg([`Tell me the job, how often and who takes turns, like _${EXAMPLE}_ or _${EXAMPLE_ASKED}_.`]),

  // ── The day ──
  /** The question on the morning's tick list. */
  todayQuestion: msg<{ part: number; parts: number }>([({ part, parts }) => (parts > 1 ? `Today's jobs, ${part} of ${parts}. Tick what you did.` : "Today's jobs. Tick what you did.")]),
  /** A job as its option on the tick list reads. */
  todayOption: msg<{ name: string; who: string | null }>([({ name, who: w }) => `${name.slice(0, 60)} (${who(w).slice(0, 30)})`]),
  /** Said once in a home, with its first list, when ticking wasn't learnt already. */
  teachList: msg(["Here is today's list. Whoever ticks a job did it, and the turn moves on to the next person."]),
  /** Jobs from an earlier day that nobody ticked. */
  missed: msg<{ names: string[] }>([({ names }) => `Not ticked yesterday: ${and(names)}. ${names.length === 1 ? "It stays" : "They stay"} with the same person and ${names.length === 1 ? "is" : "are"} on today's list.`]),
  /** A day with one job: no list, a line to react to. */
  todayOne: msg<{ name: string; who: string | null; missed: boolean; teach: boolean }>([
    ({ name, who: w, missed, teach }) =>
      `${missed ? `*${name}* (${who(w)}) wasn't ticked yesterday, so it is today's job again.` : `Today: *${name}* (${who(w)}).`} React 👍 when it's done.${teach ? " Whoever reacts did it, and the turn moves on to the next person." : ""}`,
  ]),
  today: msg<{ rows: DayRow[] }>([
    ({ rows }) => `*Today*\n\n${rows.map((r) => (r.done ? `${DONE} ${r.name}${r.done.by ? ` · ${r.done.by}` : ""}` : `☐ ${r.name} (${who(r.who)})`)).join("\n")}`,
  ]),
  nothingToday: msg(["Nothing is due today."]),
  alreadyDone: msg<{ name: string; by: string | null }>([({ name, by }) => `*${name}* is already ticked${by ? `, by ${by}` : ""}.`]),
  notDue: msg<{ name: string; next: string | null; who: string | null }>([
    ({ name, next, who: w }) => `*${name}* isn't on today's list.${next ? ` It is next due on ${sayWeekday(next)}${w ? `, with ${w}` : ""}.` : ""}`,
  ]),
  /** A job with no fixed day was said to be needed. */
  needed: msg<{ name: string; who: string | null }>([({ name, who: w }) => `*${name}* is on the list${w ? `, with ${w}` : ""}. Say _${name.toLowerCase()} done_ when it is.`]),
  turn: msg<{ name: string; who: string | null; when: "today" | "asked" | string | null }>([
    ({ name, who: w, when }) => `*${name}*: ${who(w)}${when === "today" ? ", today" : when === "asked" ? ", when it's needed" : when ? `, next on ${sayWeekday(when)}` : ""}.`,
  ]),

  // ── The count ──
  count: msg<{ title: string; rows: CountRow[]; total: number }>([({ title, rows, total }) => `*Who did what, ${title}*\n\n${rows.length ? `${counted(rows)}\n\n` : ""}${jobsWord(total)} in all.`]),
  /** `when`: "in November", "last week". */
  noCount: msg<{ when: string }>([({ when }) => `Nothing was ticked ${when}.`]),

  // ── People ──
  away: msg<{ name: string; back: string | null }>([
    ({ name, back }) => (back ? `${name} is away until ${sayWeekday(back)}. I skip ${name} in every rota till then.` : `${name} is away. I skip ${name} in every rota until someone says _${name} back_.`),
  ]),
  awayWhen: msg([`I couldn't read when. Say it like _${AWAY_EXAMPLE}_, or _Ravi away for 3 days_.`]),
  noSuchPerson: msg<{ name: string }>([({ name }) => `I don't know ${name} in this home. A name joins when it is put in a rota, like _${ROTA_EXAMPLE}_.`]),
  /** "I'm Ravi", and Ravi is already someone else in the group. */
  nameTaken: msg<{ name: string }>([({ name }) => `${name} is already someone else in this group.`]),
  swapped: msg<{ job: string; a: string; b: string }>([({ job, a, b }) => `Swapped, once: ${b} takes ${a}'s next turn at ${job}, and ${a} takes ${b}'s.`]),
  notInRota: msg<{ name: string; job: string }>([({ name, job }) => `${name} isn't in the rota for ${job}.`]),
  swapHow: msg([`Say which job and who with, like _${SWAP_EXAMPLE}_.`]),

  // ── Settings ──
  ownerOnly: msg<{ owner: string | null }>([({ owner }) => `Only ${owner ?? "the person who added me"} can change that here.`]),
  hourSet: msg<{ hour: number }>([({ hour }) => `I'll send the day's list at ${sayHour(hour)}.`]),
  hourHow: msg([`Give me an hour, like _${HOUR_EXAMPLE}_.`]),
  /** Said in the group whenever the rule changes, so nobody is surprised. */
  turnsChanged: msg<{ turns: "move" | "stay" }>([
    ({ turns }) => (turns === "move" ? "From now on, when someone else does your job, the turn moves on all the same." : "From now on, when someone else does your job, they get the credit and the turn stays with you until you do it."),
  ]),
  turnsNow: msg<{ turns: "move" | "stay" }>([
    ({ turns }) => (turns === "move" ? `When someone else does your job, the turn moves on. _${TURNS_STAY}_ changes that.` : `When someone else does your job, the turn stays with you. _${TURNS_MOVE}_ changes that.`),
  ]),
  weeklyOn: msg(["Each Monday I'll send who did how many the week before."]),
  weeklyTitle: msg(["last week"]),

  // ── Ideas ──
  ideasIntro: msg([`Each one you tick is added for anyone to do. Then tell me who takes turns, like _${ROTA_EXAMPLE}_.`]),
  ideasQuestion: msg(["Tick the jobs your home has."]),

  /** A message I couldn't read. */
  unsure: msg([`I didn't get that. Tell me a job, how often and who takes turns, like _${EXAMPLE}_, or send _${HELP}_.`]),
};
