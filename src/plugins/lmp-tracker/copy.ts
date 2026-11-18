/**
 * Everything Period Tracker puts on WhatsApp: its welcome and help, every reply, every
 * reminder and every reaction. index.ts decides what to say; this file decides how.
 *
 * Each message is a list with one wording today (see src/copy.ts). A message takes its data
 * and returns the whole text. Dates and lengths of time arrive already written ("Mon 9 Nov",
 * "4 weeks", "6 weeks 2 days": see `pretty`, `span` and `weeksLabel` in calc.ts).
 *
 * Messages are written with 🩸. For someone who chose 🌙, index.ts swaps every BLOOD_SIGN in a
 * message for MOON_SIGN just before it is sent.
 */
import { fixed, msg } from "../../sdk";

// ── The two signs ──

/** The sign the messages are written with, and the one index.ts looks for to swap. */
export const BLOOD_SIGN = fixed("🩸");
/** What it is swapped for. The group's name has it too, so the name gives nothing away. */
export const MOON_SIGN = fixed("🌙");

// ── Words the parser in index.ts reads back, and the examples shown to people. ──
// A message that names a command uses these, so a rewrite can't break one by accident.

/** The platform's own word: it sends this plugin's help. */
export const HELP = fixed("help");
export const PERIOD = fixed("period");
export const TODAY = fixed("today");
export const YESTERDAY = fixed("yesterday");
export const LMP = fixed("LMP");
/** A date as people can write one. dates.ts must be able to read each of these. */
export const DAY_EXAMPLE = fixed("9 nov");
export const PREGNANCY_DAY_EXAMPLE = fixed("3 oct");
export const LATE_DAY_EXAMPLE = fixed("20 nov");
export const LAST_PERIOD = fixed("last period");
export const HISTORY = fixed("history");
export const UNDO = fixed("undo");
export const DELETE_EXAMPLE = fixed("delete 12 nov");
export const PREGNANT = fixed("pregnant");
export const NOT_PREGNANT = fixed("not pregnant");
export const REMINDERS_OFF = fixed("reminders off");
export const REMINDER_TIME_EXAMPLE = fixed("reminder time 8am");
export const MOON = fixed("moon");
export const BLOOD = fixed("blood");
/** The answers the questions and reminders ask for. */
export const YES = fixed("yes");
export const NO = fixed("no");
export const SEE = fixed("1");
export const RECORD = fixed("2");

// ── Reactions ──

/** On a message that was understood and needs no words back. */
export const DONE = fixed("👍");

// ── Lines more than one message ends with ──

const NOTE = "_Estimates from your dates, not medical advice._";
const SEND_PERIOD = `Send _${PERIOD}_ when your period starts. If it started another day, send the date, like _${DAY_EXAMPLE}_.`;

/** When the next period is expected. */
export interface Next {
  /** The day, written out. */
  due: string;
  /** Whether that day is still ahead, is today, or has passed. */
  when: "ahead" | "today" | "past";
  /** Her usual cycle in days once her own dates have shown it; null while it is still the standard one. */
  usual: number | null;
  /** The cycle as a length of time: "4 weeks", "30 days". */
  gap: string;
}

/** How far along a pregnancy is. */
export interface Along {
  /** "6 weeks 2 days" */
  along: string;
  /** The due date, written out. */
  due: string;
}

function ago(days: number): string {
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

/** "Next one is due around Mon 7 Dec (4 weeks)." */
function nextLine({ due, when, usual, gap }: Next): string {
  const why = usual !== null ? `your periods come about every ${usual} days` : gap;
  if (when === "ahead") return `Next one is due around *${due}* (${why}).`;
  if (when === "today") return `Next one is due around *today* (${why}).`;
  return `Next one was due around *${due}* (${why}).`;
}

/** "You're about 6 weeks 2 days along, due around Sat 10 Jul 2027." */
function alongLine({ along, due }: Along): string {
  return `You're about *${along}* along, due around *${due}*.`;
}

export const copy = {
  // ── What the plugin says about itself ──
  welcome: msg([
    `🩸 You've installed *Period Tracker*.\n\nWhen your period starts, just send _${PERIOD}_ or _${TODAY}_. For your last one, send its date, like _${DAY_EXAMPLE}_.\n\nI'll remind you when the next one is due, and you can ask _${LAST_PERIOD}_ any time. Send _${HELP}_ for more. ` +
      NOTE,
  ]),
  help: msg([
    [
      "*Period Tracker*",
      "",
      `When your period starts, send _${PERIOD}_ or _${TODAY}_. That's all. If it started another day, send the date: _${YESTERDAY}_, _${DAY_EXAMPLE}_. (_${LMP}_ works too.)`,
      "If the next one hasn't come when it usually does, I'll remind you.",
      "",
      `_${LAST_PERIOD}_ shows your last one and when the next is due`,
      `_${HISTORY}_ lists your past periods, _${UNDO}_ removes the last one`,
      `_${PREGNANT}_ stops the reminders, _${NOT_PREGNANT}_ brings them back`,
      `_${REMINDERS_OFF}_, _${REMINDER_TIME_EXAMPLE}_`,
      `_${MOON}_ swaps the 🩸 in my messages for 🌙, _${BLOOD}_ swaps it back`,
      "",
      NOTE,
    ].join("\n"),
  ]),
  /** The group's name. Written with the moon so it gives nothing away. */
  groupName: msg(["🌙 Period Tracker"]),
  /** The fallback when a message is nothing Period Tracker knows. */
  unsure: msg([`I didn't get that. When your period starts, send _${PERIOD}_. Send _${HELP}_ for more.`]),

  // ── Sending the day a period started ──
  /** The very first one. After it a clear date only gets DONE. */
  firstPeriod: msg<{ date: string }>([({ date }) => `🩸 Got it: your period started *${date}*. From next time you'll just get a 👍.`]),
  /** Asked once, right after the first period. No answer means yes. */
  symbolQuestion: msg([`Are you OK seeing 🩸 in my messages? Reply _${NO}_ and I'll use 🌙 instead. If you don't reply, I'll keep it.`]),
  inFuture: msg([`That's in the future. Send the day your period started, like _${YESTERDAY}_ or _${DAY_EXAMPLE}_.`]),
  badDate: msg([`I couldn't read that date. Try _${TODAY}_, _${YESTERDAY}_ or _${DAY_EXAMPLE}_.`]),
  /** A date older than the latest period: kept, but the latest stays the latest. */
  recordedOlder: msg<{ date: string; latest: string }>([({ date, latest }) => `🩸 Recorded *${date}*. Your latest period is still the one that started ${latest}.`]),
  /** The date moved a period that was already recorded. */
  changed: msg<{ date: string; was: string }>([({ date, was }) => `🩸 Changed: your last period started *${date}* (it was ${was}).`]),
  /** A new period while in pregnancy mode. */
  pregnancyOff: msg<{ date: string }>([
    ({ date }) =>
      `🩸 Got it: your period started *${date}*. I've turned pregnancy mode off and will remind you when the next one is due.\n\nIf that isn't right, send _${UNDO}_ and then _${PREGNANT}_.`,
  ]),
  noEndNeeded: msg(["No need to send the end. I only need the day your period starts."]),

  // ── Asking for the last period, and the history ──
  noPeriodYet: msg([`I don't have a period date from you yet. ${SEND_PERIOD}`]),
  /** `next` when she isn't pregnant, `along` when she is (null once the pregnancy is past its end). */
  lastPeriod: msg<{ started: string; daysAgo: number; next: Next | null; along: Along | null }>([
    ({ started, daysAgo, next, along }) => {
      const lines = [`🩸 Your last period started *${started}* (${ago(daysAgo)}).`];
      if (next) lines.push(nextLine(next));
      else if (along) lines.push(alongLine(along));
      return lines.join("\n");
    },
  ]),
  noHistory: msg([`No periods recorded yet. ${SEND_PERIOD}`]),
  /** `periods`: oldest first, each with the days to the one after it (null for the last). `usual`: as in Next. */
  history: msg<{ periods: { date: string; toNext: number | null }[]; usual: number | null }>([
    ({ periods, usual }) => {
      const lines = ["*Your periods* (most recent last)", ""];
      for (const { date, toNext } of periods) lines.push(`• ${date}${toNext !== null ? `  ·  ${toNext} days to the next` : ""}`);
      if (usual !== null) lines.push("", `Your periods usually come about every ${usual} days.`);
      return lines.join("\n");
    },
  ]),

  // ── Corrections ──
  nothingToUndo: msg(["Nothing to undo."]),
  badDeleteDate: msg([`I couldn't read that date. Try _${DELETE_EXAMPLE}_.`]),
  noPeriodOn: msg<{ date: string }>([({ date }) => `There's no period recorded on ${date}. Send _${HISTORY}_ to see them.`]),

  // ── Pregnancy mode ──
  noPeriodForPregnancy: msg([`I don't have a period date from you yet. Send the first day of your last period, like _${PREGNANCY_DAY_EXAMPLE}_, then tell me again.`]),
  periodTooOld: msg<{ date: string }>([
    ({ date }) => `The last period I have started ${date}, more than 42 weeks ago. Send your latest one, like _${PREGNANCY_DAY_EXAMPLE}_, then tell me again.`,
  ]),
  pregnancyOn: msg<{ started: string } & Along>([
    ({ started, ...along }) =>
      [
        "🩸 Noted. I've stopped the period reminders.",
        "",
        `Your last period started *${started}*. ${alongLine(along)}`,
        "",
        "When your periods are back, send the date one started and I'll carry on from there.",
        "",
        NOTE,
      ].join("\n"),
  ]),
  /** Asked in pregnancy mode when a bare word could mean either. */
  seeOrRecord: msg([
    `🩸 Do you want to see your last period, or record a new one?\n\nReply _${SEE}_ to see your last period\nReply _${RECORD}_ to record today as the start of a new one`,
  ]),

  // ── Reminders. `last`: the day her last period started. `since`: how long ago that was. ──
  dueReminder: msg<{ last: string; since: string }>([
    ({ last, since }) => `🩸 Your period is due around now. Your last one started *${last}*, ${since} ago.\n\nWhen it starts, send _${PERIOD}_ (or react ✅ to this message).`,
  ]),
  againReminder: msg<{ last: string; since: string }>([
    ({ last, since }) =>
      `🩸 Has your period come? It's been ${since} since your last one (*${last}*).\n\nSend the day it started, like _${LATE_DAY_EXAMPLE}_, or react ✅ if it started today.`,
  ]),
  testReminder: msg<{ last: string; since: string }>([
    ({ last, since }) =>
      `🩸 It's been ${since} since your last period (*${last}*). You might be pregnant.\n\nA home pregnancy test can tell you. If it's positive, reply _${YES}_. If your period has come, send the day it started.\n\n${NOTE}`,
  ]),
  /** After "no" or "not yet" to a reminder. */
  okSendPeriod: msg([`OK. ${SEND_PERIOD}`]),
  badTime: msg([`Give me a time like _${REMINDER_TIME_EXAMPLE}_.`]),
  /** `time`: "8am", "12pm". */
  reminderTime: msg<{ time: string }>([({ time }) => `Reminders will come at ${time}.`]),

  // ── 🩸 or 🌙 ──
  nowMoon: msg([`🩸 Done. I'll use 🌙 from now on. Send _${BLOOD}_ to switch back.`]),
  nowBlood: msg([`🩸 Done. I'll use 🩸 from now on. Send _${MOON}_ to switch back.`]),
};
