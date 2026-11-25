/**
 * Everything Habits puts on WhatsApp: its welcome and help, every reply, every poll and every
 * reaction, for the person's own Habits group (index.ts) and for the groups they keep with
 * other people (pact.ts). The logic decides what to say; how it is said is here.
 *
 * Each message is a list of wordings (see src/copy.ts). Text that code compares against, or
 * that the parser reads back, is written with `fixed` and has one wording.
 */
import { fixed, msg } from "../../sdk";
import type { Batch, Cell, Days } from "./streaks";

// ── Words the parser reads ──

/**
 * Commands as people are shown them. The parsers read these words back (onMessage in
 * index.ts, habitCommands, pactMessage and privatePact in pact.ts, parseDays in streaks.ts),
 * so each has one wording: change one only together with the regex that reads it.
 */
export const SAY = {
  help: fixed("help"),
  habits: fixed("habits"),
  groups: fixed("groups"),
  addMeditate: fixed("add meditate"),
  addGym: fixed("add gym"),
  addReadAt: fixed("add stretch in the morning"),
  addGymOn: fixed("add gym on mon wed fri"),
  doneMeditate: fixed("done meditate"),
  undoMeditate: fixed("undo meditate"),
  stopMeditate: fixed("stop meditate"),
  timeEvening: fixed("time evening"),
  timeMorning: fixed("time morning"),
  timeOff: fixed("time off"),
  timeMeditate: fixed("time meditate morning"),
  timeMeditateDefault: fixed("time meditate default"),
  daysGym: fixed("days gym mon wed fri"),
  daysGymTueThu: fixed("days gym tue thu"),
  daysGymEveryDay: fixed("days gym every day"),
  simpleOn: fixed("simple on"),
  simpleOff: fixed("simple off"),
  deletePollsOn: fixed("delete polls on"),
  deletePollsOff: fixed("delete polls off"),
  newGroup: fixed("new group gym buddies"),
  closeGroup: fixed("close group gym buddies"),
};

/** The same commands for a habit the person has, by its name. Read back by the same parsers. */
const sayTime = (habit: string) => `time ${habit.toLowerCase()} morning`;
const sayDays = (habit: string) => `days ${habit.toLowerCase()} mon wed fri`;

// ── Poll choices ──

const YES = fixed("Yes");
const NO = fixed("No");
const NOT_NOW = fixed("Not now");

/**
 * The check-in poll's choices, in this order: 0 did it, 1 didn't. The logic reads the
 * position of the answer, so the order must stay and each label has one wording.
 */
export const CHECKIN_OPTIONS = [YES, NO];

/**
 * The profile offer's choices, in this order: 0 yes, 1 not now. The logic reads the position
 * of the answer, so the order must stay and each label has one wording.
 */
export const OFFER_OPTIONS = [YES, NOT_NOW];

/** Where Zelfred puts the chosen option in a poll's confirm line. Not wording: never change it. */
const OPTION = fixed("{{option}}");

// ── Reactions ──

/** Taken in: a change was saved, or an answer landed. */
export const SAVED = fixed("👍");
/** A habit was logged as done. */
export const LOGGED = fixed("✅");

// ── Pieces the messages share ──

/** Someone on a habit: their name as it should show (null: not known) and their streak. */
export interface Streaker {
  name: string | null;
  streak: number;
}

/** A habit in a group: one in a group kept with others, or one a friend added to the main group. */
export interface GroupHabit {
  name: string;
  /** The hour kept with it (0-23), which says morning or evening; null: the default one. */
  hour: number | null;
  days: Days;
  together: number;
  people: Streaker[];
}

/** One of the person's own habits. */
export interface OwnHabit {
  name: string;
  streak: number;
  /** The hour kept with it (0-23), which says morning or evening; null: the default one. */
  hour: number | null;
  days: Days;
  /** The last days, oldest first. */
  cells: Cell[];
  /** Friends taking part in it (the person themself left out); null when there are none. */
  friends: { together: number; people: Streaker[] } | null;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "every day", "weekdays", "weekends" or "Mon, Wed, Fri". */
function daysLabel(days: Days): string {
  if (!days || !days.length || days.length === 7) return "every day";
  const k = days.join(",");
  if (k === "1,2,3,4,5") return "weekdays";
  if (k === "0,6") return "weekends";
  return days.map((d) => DAY_NAMES[d]).join(", ");
}

/** 🟩 done, ⬜ due and not done, ▫️ not due. */
const squares = (cells: Cell[]) => cells.map((c) => (c === "done" ? "🟩" : c === "due" ? "⬜" : "▫️")).join("");

const someone = (name: string | null) => name ?? "Someone";
/** The mark of a habit that was put in the morning or the evening check-in by hand. */
const MARK: Record<Batch, string> = { morning: "🌅", evening: "🌙" };
const clock = (hour: number | null) => (hour === null ? "" : `  ${hour < 12 ? MARK.morning : MARK.evening}`);
/** When the two check-ins go out, as shown to people. */
const AT: Record<Batch, string> = { morning: fixed("6am"), evening: fixed("8pm") };
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;
const calendar = (days: Days) => (days?.length ? `  📅 ${daysLabel(days)}` : "");
const streakLine = (p: Streaker) => `${someone(p.name)}  🔥 ${p.streak}`;

/** A group habit in a summary: its numbered line, then everyone's streak. */
const groupHabitLines = (n: number, h: GroupHabit): string[] => [
  "",
  `${n}. *${h.name}*${h.people.length > 1 ? `  Together 🔥 ${h.together}` : ""}${clock(h.hour)}${calendar(h.days)}`,
  ...(h.people.length ? [] : ["_Nobody has answered yet._"]),
  ...h.people.map(streakLine),
];

const didYou = (habit: string) => `🌱 Did you ${habit} today?`;

/** The standings added to a check-in's question, for as many people as fit in `limit` characters. */
function withStandings(question: string, s: { together: number; people: Streaker[] }, limit: number): string {
  const bits = [...(s.people.length > 1 ? [`Together 🔥 ${s.together}`] : []), ...s.people.map((x) => `${someone(x.name)} 🔥 ${x.streak}`)];
  let out = question;
  for (const [i, bit] of bits.entries()) {
    const next = `${out}${i ? " · " : "  "}${bit}`;
    if (next.length > limit) break;
    out = next;
  }
  return out;
}

/** A check-in shared with friends: the habit, everyone's standing, and the most characters a poll's question allows. */
interface SharedCheckin {
  habit: string;
  together: number;
  /** Named by their first name. */
  people: Streaker[];
  limit: number;
}

const notYours = (habit: string, owner: string | null, what: string) =>
  `*${habit}* was added by someone else, so only they or ${owner ?? "the person whose group this is"} can ${what}.`;

// ── The messages ──

export const copy = {
  // The listing
  groupName: msg(["🌱 Habits"]),
  welcome: msg([
    `🌱 You've installed *Habits*.\n\nTell me a habit you want to build, in your own words, or send _${SAY.addMeditate}_. Every day I'll send a poll with your habits, in the evening (${AT.evening}): tick the ones you did.\n\nSend _${SAY.help}_ any time.`,
  ]),
  help: msg([
    [
      "*Habits*",
      "",
      `_${SAY.addMeditate}_ starts a habit`,
      `_${SAY.habits}_ shows your streaks`,
      `_${SAY.doneMeditate}_ logs it for today, _${SAY.undoMeditate}_ takes it back`,
      `_${SAY.stopMeditate}_ stops tracking it`,
      `_${SAY.timeMeditate}_ moves a habit to the morning poll (${AT.morning}), _${SAY.timeMeditateDefault}_ puts it back`,
      `_${SAY.addReadAt}_ adds a habit to the morning poll`,
      `_${SAY.timeMorning}_ asks about every habit in the morning unless it is marked otherwise, _${SAY.timeEvening}_ in the evening, _${SAY.timeOff}_ stops the polls`,
      `_${SAY.addGymOn}_ adds a habit for some days only`,
      `_${SAY.daysGymTueThu}_ changes its days, _${SAY.daysGymEveryDay}_ puts it back`,
      `_${SAY.simpleOn}_ makes my check-in just the habit's name and streak, and lets you send just the name to log it. _${SAY.simpleOff}_ turns it off`,
      `_${SAY.deletePollsOn}_ deletes a one-habit poll once you answer it. _${SAY.deletePollsOff}_ keeps it`,
      "",
      `*More groups:* _${SAY.newGroup}_ makes another Habits group, for a different set of habits or of people`,
      `_${SAY.groups}_ lists yours, _${SAY.closeGroup}_ ends one`,
      "",
      `*With other people:* add anyone to any Habits group. They can answer a habit's poll to do it with you, or add habits of their own. Everyone sees who did what on the poll, and _${SAY.habits}_ shows everyone's streaks`,
      "",
      `Twice a day I send one poll with the habits that are due: morning habits at ${AT.morning}, evening ones at ${AT.evening}. Once I see when you usually answer, I send it around then. Tick what you did. You can tick more, or take a tick back, until the next day's poll. When only one habit is due I ask about it with ${YES} or ${NO}.`,
    ].join("\n"),
  ]),

  // Not understood
  unsure: msg([`I didn't get that. Send _${SAY.help}_ to see what I can do.`]),
  unsureFriend: msg([`I didn't get that. Tell me a habit to add, answer a poll to take part in one, or send _${SAY.habits}_ to see how it's going.`]),
  unsureInGroup: msg([`I didn't get that. Tell me a habit to add here, or send _${SAY.habits}_ to see how it's going.`]),

  // The person's own habits
  noHabits: msg([`No habits yet. Add one: _${SAY.addMeditate}_`]),
  summary: msg<{ days: number; habits: OwnHabit[]; extra: GroupHabit[]; checkinHour: number | null; at: Record<Batch, number> }>([
    ({ days, habits, extra, checkinHour, at }) => {
      const lines = [habits.length ? `*Your habits* (last ${days} days)` : "*Habits*"];
      for (const [i, h] of habits.entries()) {
        lines.push("", `${i + 1}. *${h.name}*${h.streak ? `  🔥 ${h.streak}` : ""}${clock(h.hour)}${calendar(h.days)}`, squares(h.cells));
        if (h.friends) lines.push(`Together 🔥 ${h.friends.together}`, ...h.friends.people.map(streakLine));
      }
      // Habits friends added in this group come after the person's own.
      for (const [i, h] of extra.entries()) lines.push(...groupHabitLines(habits.length + i + 1, h));
      lines.push(
        "",
        checkinHour !== null
          ? `_I ask at ${hourLabel(at.morning)} about morning habits (${MARK.morning}) and at ${hourLabel(at.evening)} about evening ones (${MARK.evening}). A habit without a mark is asked about in the ${checkinHour < 12 ? "morning" : "evening"}._`
          : `_Polls are off for habits without a mark (${MARK.morning} morning, ${MARK.evening} evening). Send ${SAY.timeEvening} to turn them on._`,
      );
      return lines.join("\n");
    },
  ]),
  cantFind: msg<{ which: string }>([({ which }) => `I can't find "${which}". Send _${SAY.habits}_ to see them.`]),
  nameTheHabit: msg([`Name the habit, like _${SAY.addMeditate}_.`]),
  whatToCallIt: msg([`What should I call it? Like _${SAY.addGymOn}_.`]),
  whichHabit: msg([`Which habit? Send _${SAY.habits}_ to see them.`]),
  noHabitsToPick: msg([`You don't have any habits yet. Start with _${SAY.addMeditate}_.`]),
  giveHabitTime: msg([`Say morning or evening, like _${SAY.timeMeditate}_.`]),
  giveHabitTimeFor: msg<{ habit: string }>([({ habit }) => `Say morning or evening, like _${sayTime(habit)}_.`]),
  giveDefaultTime: msg([`Say _${SAY.timeMorning}_ or _${SAY.timeEvening}_.`]),
  whatTimeFor: msg<{ habit: string }>([({ habit }) => `Morning or evening? Like _${sayTime(habit)}_.`]),
  whatDefaultTime: msg([`Morning or evening? Like _${SAY.timeEvening}_, or _${SAY.timeOff}_.`]),
  tellDays: msg([`Tell me the habit and the days, like _${SAY.daysGym}_ or _${SAY.daysGymEveryDay}_.`]),
  whichDaysFor: msg<{ habit: string }>([({ habit }) => `Which days? Like _${sayDays(habit)}_.`]),

  // The daily check-in
  checkin: msg<{ habit: string; streak: number }>([({ habit, streak }) => `${didYou(habit)}  🔥 ${streak}`]),
  checkinSimple: msg<{ habit: string; streak: number }>([({ habit, streak }) => `${habit}  🔥 ${streak}`]),
  checkinTogether: msg<SharedCheckin>([({ habit, limit, ...s }) => withStandings(didYou(habit), s, limit)]),
  checkinTogetherSimple: msg<SharedCheckin>([({ habit, limit, ...s }) => withStandings(habit, s, limit)]),
  checkinConfirm: msg<{ habit: string }>([({ habit }) => `*${habit}*: ${OPTION}`]),
  /** The question of a check-in with more than one habit: a poll where each habit done is ticked. */
  checkinBatch: msg<{ batch: Batch; simple: boolean; part: number; parts: number }>([
    ({ batch, simple, part, parts }) => {
      const title = batch === "morning" ? "Morning habits" : "Evening habits";
      const ask = simple ? title : batch === "morning" ? `🌱 ${title}. Tick each one you do today.` : `🌱 ${title}. Tick the ones you did today.`;
      return parts > 1 ? `${ask} (${part} of ${parts})` : ask;
    },
  ]),
  /** One habit as a line to tick. `streak`: the person's own; `together`: the shared one, when others do it too. Never longer than a poll's option. */
  checkinOption: msg<{ habit: string; streak: number | null; together: number | null }>([
    ({ habit, streak, together }) => {
      const tail = together !== null ? `  Together 🔥 ${together}` : streak !== null ? `  🔥 ${streak}` : "";
      return `${habit.slice(0, 100 - tail.length)}${tail}`;
    },
  ]),

  // Habits in a group, from anyone in it
  cantFindHere: msg<{ which: string }>([({ which }) => `I can't find "${which}" here. Send _${SAY.habits}_ to see them.`]),
  nameTheHabitHere: msg([`Name the habit, like _${SAY.addGym}_.`]),
  tellDaysHere: msg([`Tell me the habit and the days, like _${SAY.daysGym}_.`]),
  noHabitsHere: msg([`There are no habits here yet. Add one, like _${SAY.addGym}_.`]),
  groupIsFull: msg<{ max: number }>([({ max }) => `That's the most habits one group can hold (${max}). Stop one first.`]),
  notYoursTime: msg<{ habit: string; owner: string | null }>([({ habit, owner }) => notYours(habit, owner, "change its time")]),
  notYoursDays: msg<{ habit: string; owner: string | null }>([({ habit, owner }) => notYours(habit, owner, "change its days")]),
  ownersHabit: msg<{ habit: string; owner: string | null }>([
    ({ habit, owner }) => `*${habit}* is ${owner ? `${owner}'s` : "someone else's"} habit, so only they can change when it's asked.`,
  ]),
  ownGroup: msg(["To have a group of your own, log in at app.zelfred.com and add Habits there. It takes a minute, and then I'll make it for you."]),
  groupNoHabits: msg<{ group: string }>([({ group }) => `🌱 *${group}* has no habits yet. Add one here, like _${SAY.addGym}_.`]),
  groupSummary: msg<{ group: string; habits: GroupHabit[] }>([
    ({ group, habits }) => [`🌱 *${group}*`, ...habits.flatMap((h, i) => groupHabitLines(i + 1, h))].join("\n"),
  ]),

  // A profile for someone a friend brought in
  offer: msg<{ name: string | null }>([
    ({ name }) => `Good start${name ? ` ${name}` : ""}. Let me create an account for you, so you can join the streak race too. Just vote ${YES} and I'll set it all up.`,
  ]),
  setUp: msg<{ name: string | null }>([({ name }) => `${name ? `${name}, you're` : "You're"} set up. I'm keeping your streak from here on.`]),
  notNow: msg<{ name: string | null }>([({ name }) => `No problem${name ? `, ${name}` : ""}. Just ask me to set it up for you later if you change your mind.`]),
  needsConsent: msg<{ name: string | null }>([
    ({ name }) => (name ? `I need consent from ${name} for this, so only ${name}'s vote counts here.` : "I need consent from the person I asked, so only their vote counts here."),
  ]),

  // Habit groups: making, listing, closing
  newGroupName: msg<{ name: string }>([({ name }) => `🌱 ${name}`]),
  newGroupHello: msg<{ name: string }>([
    ({ name }) =>
      `🌱 This is your habit group *${name}*.\n\nTell me a habit here, like _${SAY.addGym}_, and every day I'll ask about it with a poll. It works on your own, and with other people: add anyone you like to this group and they can take part or add habits of their own.\n\nSend _${SAY.habits}_ here any time to see how it's going.`,
  ]),
  makingGroup: msg<{ name: string }>([
    ({ name }) => `🌱 I'm making a WhatsApp group called *${name}*. Once it appears, tell me a habit there. Add other people to it if you want company.`,
  ]),
  existingGroupHello: msg([
    `🌱 I'm keeping habits in this group now.\n\nTell me a habit here, like _${SAY.addGym}_, and every day I'll ask about it with a poll. Anyone here can take part or add habits of their own.\n\nSend _${SAY.habits}_ here any time to see how it's going.`,
  ]),
  /** What a group the person already had is called when its own name is blank. It is stored, and shows on the web page too. */
  groupWithoutName: msg(["Habits"]),
  // These three are also what the web page shows when making a group fails there (index.ts strips the _ and *).
  nameTheGroup: msg([`Give the group a name, like _${SAY.newGroup}_.`]),
  groupExists: msg<{ name: string }>([({ name }) => `You already have a group called *${name}*.`]),
  tooManyGroups: msg<{ max: number }>([({ max }) => `That's the most habit groups I can keep (${max}). Close one first.`]),
  onlyThisGroup: msg([`You have one Habits group, this one. Send _${SAY.newGroup}_ to make another, for a different set of habits or of people.`]),
  groupList: msg<{ groups: { name: string; habits: number }[] }>([
    ({ groups }) => ["*Your habit groups*", "", "🌱 *Habits* (this one)", ...groups.map((g) => `🌱 *${g.name}*: ${g.habits} habit${g.habits === 1 ? "" : "s"}`)].join("\n"),
  ]),
  groupClosed: msg<{ name: string }>([({ name }) => `*${name}* is closed. What everyone logged is kept.`]),
  noSuchGroup: msg<{ name: string }>([({ name }) => `I don't have a group called "${name}". Send _${SAY.groups}_ to see yours.`]),
};
