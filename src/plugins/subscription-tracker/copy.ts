/**
 * Everything SubscriptionTracker puts on WhatsApp: its welcome and help, every notice, every
 * question and every reaction. index.ts decides what to say; this file decides how.
 *
 * A message is a list of wordings (see src/copy.ts) and one is picked each time. A message
 * takes its data and returns the whole text.
 */
import { fixed, msg } from "../../sdk";

// ── Words the parser in index.ts reads back, and the examples shown to people. ──

/** The platform's own word: it sends this plugin's help. */
export const HELP = fixed("help");
export const EXAMPLE = fixed("Netflix 649 monthly on the 5th");
export const EXAMPLE_EXPIRES = fixed("car insurance 14 Feb");
export const EXAMPLE_TRIAL = fixed("Spotify trial ends 5 Dec 119");
export const LIST = fixed("list");
export const WEEK = fixed("this week");
export const REMOVE_EXAMPLE = fixed("remove netflix");
export const DONE_EXAMPLE = fixed("done car insurance");
export const DONT_ASK_EXAMPLE = fixed("don't ask netflix");
export const KIND_EXAMPLE = fixed("kind netflix");
export const CURRENCY_EXAMPLE = fixed("currency usd");
/** Sent as a reply to one of the app's messages about a thing. */
export const REMOVE = fixed("remove");
export const DONE = fixed("done");
export const NOT_RENEWED = fixed("not renewed again");

// ── Reactions ──

/** On a message that added or changed something, when nothing is said in words. */
export const SAVED = fixed("👍");

// ── The options of each question, in the order they are asked. index.ts matches a vote by its place. ──

export const USED_OPTIONS = [fixed("A lot"), fixed("A little"), fixed("Not at all")];
export const KIND_OPTION = {
  use: fixed("I'd drop it if I stopped using it"),
  keeps: fixed("It keeps things running"),
  trial: fixed("It's a free trial"),
  expires: fixed("It runs out unless I renew it"),
};
export const THUMB_OPTIONS = [fixed("Done"), fixed("Just okay")];
export const NEXT_OPTIONS = [fixed("Yes"), fixed("Another date"), fixed("It's not renewed again")];

/** What "how often" is called after an amount: "₹649 a month". */
const A: Record<string, string> = { weekly: "a week", monthly: "a month", quarterly: "a quarter", yearly: "a year", once: "" };
/** The stretch a usage question is about: "this month". */
const THIS: Record<string, string> = { weekly: "this week", monthly: "this month", quarterly: "these three months", yearly: "this year", once: "" };
const SPANS: Record<string, [string, string]> = { weekly: ["week", "weeks"], monthly: ["month", "months"], quarterly: ["quarter", "quarters"], yearly: ["year", "years"], once: ["time", "times"] };
const COUNT = ["No", "One", "Two", "Three", "Four", "Five", "Six"];

/** One thing as the list and the receipts show it. */
export interface Line {
  name: string;
  /** "₹649", or null when no amount is kept. */
  amount: string | null;
  every: string;
  /** "on 5 December", "tomorrow", "Friday". */
  when: string;
  /** It ends unless someone acts. */
  expires: boolean;
  trial: boolean;
}

/** "Netflix, ₹649 a month, next on 5 December" or "Car insurance, expires on 14 February". */
export const line = (l: Line) => {
  if (l.expires) return `${l.name}, expires ${l.when}${l.amount ? `, ${l.amount}` : ""}`;
  if (l.trial) return `${l.name}, free trial ends ${l.when}${l.amount ? `, then ${l.amount}${A[l.every] ? ` ${A[l.every]}` : ""}` : ""}`;
  return `${l.name}${l.amount ? `, ${l.amount}${A[l.every] ? ` ${A[l.every]}` : ""}` : ""}, next ${l.when}`;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Where something is stopped, by how it is paid. Stopping the payment doesn't end the account. */
const where = (via: string, name: string) =>
  via === "upi"
    ? `It's paid by UPI AutoPay: stop it in your UPI app, and cancel on ${name} too.`
    : via === "card"
      ? `It's paid by card: stop it on your bank's page for standing instructions, and cancel on ${name} too.`
      : via === "store"
        ? "It's billed through the app store: cancel it on the store's subscriptions screen."
        : `Cancel it on ${name}, and stop the payment where it is paid from too.`;

export const copy = {
  // ── What the plugin says about itself ──
  welcome: msg([
    `🔁 You've added *SubscriptionTracker*.\n\nTell me what you pay for again and again, like _${EXAMPLE}_, or forward the message your bank sent about it. Tell me what runs out too, like _${EXAMPLE_EXPIRES}_.\n\nI'll say what renews each week, and again the day before. Your own words work.\n\nSend _${HELP}_ for more.`,
  ]),
  help: msg([
    [
      "*SubscriptionTracker*",
      "",
      `Tell me what you pay for: _${EXAMPLE}_. Or forward the message your bank sent, and I read the name, the amount and the date from it.`,
      `Tell me what runs out: _${EXAMPLE_EXPIRES}_. A free trial: _${EXAMPLE_TRIAL}_.`,
      "",
      `_${LIST}_ shows everything I keep, and what it adds up to`,
      `_${WEEK}_ shows what renews or runs out in the next 7 days`,
      `_${DONE_EXAMPLE}_ when something that ran out is renewed`,
      `_${REMOVE_EXAMPLE}_ takes one off the list`,
      `_${DONT_ASK_EXAMPLE}_ stops me asking whether you used it`,
      `_${KIND_EXAMPLE}_ changes how I treat one`,
      `_${CURRENCY_EXAMPLE}_ changes what I count plain amounts in`,
      "",
      "Reply to any message of mine about one thing with a new amount or a new date to correct it.",
    ].join("\n"),
  ]),
  groupName: msg(["🔁 Subscriptions"]),

  // ── Keeping ──
  /**
   * The receipt in words, when a 👍 would not be enough: the first thing ever kept here (what
   * happens from now on), a date that was guessed, or a date already too near.
   * `guessed`: the date was not given. `near`: how near it is, when the time the thing takes
   * has already gone. `first`: nothing was kept in this group before.
   */
  kept: msg<{ line: string; guessed: boolean; near: string | null; first: boolean; weekly: string }>([
    ({ line, guessed, near, first, weekly }) =>
      [
        `Kept: ${line}.${guessed ? " You gave no date, so I took that one. Reply to this with the date if it's another." : ""}${near ? ` That's ${near}, and it can take longer than that to renew.` : ""}`,
        ...(first ? ["", `I'll list what renews each week, on ${weekly}, and say it again the day before each one. _${LIST}_ shows everything I keep.`, "", "From now on a 👍 means kept."] : []),
      ].join("\n"),
  ]),
  /** A forwarded bank message was read. Always said in words: how often and the next date are guesses. */
  bankKept: msg<{ name: string; amount: string; paid: string | null; next: string; first: boolean; weekly: string }>([
    ({ name, amount, paid, next, first, weekly }) =>
      [
        `Kept: ${name}, ${amount}${paid ? `, ${paid}` : ""}. I've taken it as monthly, next ${next}. Reply to this to correct it.`,
        ...(first ? ["", `I'll list what renews each week, on ${weekly}, and say it again the day before each one.`, "", "From now on a 👍 means kept."] : []),
      ].join("\n"),
  ]),
  /** A bank message with an amount and no name that could be read. */
  bankWho: msg<{ amount: string; when: string | null }>([({ amount, when }) => `I read ${amount}${when ? ` ${when}` : ""}. What is it for? Reply to this with its name.`]),
  /** Something that runs out, sent with no date. */
  needDate: msg<{ name: string }>([({ name }) => `When does ${name} run out? Send it with the date, like _${EXAMPLE_EXPIRES}_.`]),
  pastDate: msg<{ when: string }>([({ when }) => `That date, ${when}, has passed. Send it with the next one.`]),
  full: msg<{ max: number }>([({ max }) => `I keep ${max} things here, and that's the most. _${REMOVE_EXAMPLE}_ takes one off.`]),
  /** How one thing is treated, asked once when the app can't tell. */
  whichKind: msg<{ name: string }>([({ name }) => `How do I treat ${name}?`]),
  kindSet: msg<{ name: string; kind: string }>([
    ({ name, kind }) =>
      kind === "use"
        ? `${name}: I'll ask before each renewal whether you used it.`
        : kind === "keeps"
          ? `${name}: I'll say the date and the amount, and leave it at that.`
          : kind === "trial"
            ? `${name}: I'll say so two days before the trial ends.`
            : `${name}: I'll say so in good time before it runs out.`,
  ]),
  whichCurrency: msg([`Which currency do I count plain amounts in? Pick one, or send another like _${CURRENCY_EXAMPLE}_.`]),
  counting: msg<{ currency: string }>([({ currency }) => `Counting in ${currency}.`]),
  countingNow: msg<{ currency: string }>([({ currency }) => `I count plain amounts in ${currency}. To change it: _${CURRENCY_EXAMPLE}_.`]),
  currencyUnknown: msg([`I don't know that currency. Send its three letters, like _${CURRENCY_EXAMPLE}_.`]),

  // ── What is sent on a schedule ──
  /** Once a week, only when something renews or runs out in the week ahead. */
  weekly: msg<{ items: { name: string; day: string; amount: string | null; expires: boolean; trial: boolean }[] }>([
    ({ items }) => `This week:\n${items.map((i) => `• ${i.name}${i.expires ? " expires" : i.trial ? ", trial ends" : ","} ${i.day}${i.amount ? `, ${i.amount}` : ""}`).join("\n")}`,
  ]),
  nothingThisWeek: msg(["Nothing renews or runs out in the next 7 days."]),
  /** The usage question, some days before a renewal. */
  used: msg<{ name: string; when: string; amount: string | null; every: string }>([
    ({ name, when, amount, every }) => `${name} renews ${when}${amount ? `, ${amount}${every === "yearly" ? " for the year" : ""}` : ""}. Did you use it ${THIS[every] || "lately"}?`,
  ]),
  /** A week's notice of a yearly renewal that has no usage question. */
  yearly: msg<{ name: string; when: string; amount: string | null }>([({ name, when, amount }) => `${name} renews ${when}${amount ? `, ${amount} for the year` : ""}.`]),
  trialEnds: msg<{ name: string; when: string; amount: string | null }>([({ name, when, amount }) => `${name}'s free trial ends ${when}.${amount ? ` It charges ${amount} after that.` : " It starts charging after that."}`]),
  /**
   * The day before a renewal (or on the day, when that is when it could be said).
   * `unused`: nobody who answered had used it. `run`: how many times in a row that is.
   */
  renews: msg<{ name: string; when: string; amount: string | null; unused: boolean; run: number; spent: string | null; every: string; via: string }>([
    ({ name, when, amount, unused, run, spent, every, via }) => {
      const first = `${name} renews ${when}${amount ? `, ${amount}` : ""}.`;
      if (!unused) return first;
      if (run < 2) return `${first} You said you didn't use it ${THIS[every] || "lately"}.`;
      return `${first}\n\n${COUNT[run] ?? run} ${SPANS[every]?.[1] ?? "times"} without ${name}.${spent ? ` That's ${spent}.` : ""} ${where(via, name)}`;
    },
  ]),
  /** An early word about something that runs out: the date, and how near it is. */
  early: msg<{ name: string; date: string; near: string }>([({ name, date, near }) => `${name} expires on ${date}. That's ${near}.`]),
  expires: msg<{ name: string; when: string }>([({ name, when }) => `${name} expires ${when}.`]),
  expired: msg<{ name: string; ago: string }>([({ name, ago }) => `${name} expired ${ago}.`]),

  // ── Done, and what a 👍 means ──
  thumbQuestion: msg<{ name: string }>([({ name }) => `Is ${name} done, or did you mean okay?`]),
  learnt: msg<{ done: boolean }>([
    ({ done }) => (done ? "Got it. From now on, a 👍 from you on one of these means done." : `Got it. From now on, a 👍 from you on one of these means okay. Say _${DONE}_ in a reply when one is renewed.`),
  ]),
  /** After done: the likely next date, offered. */
  until: msg<{ date: string }>([({ date }) => `Until ${date}?`]),
  /** After done, with no date to offer, or after "Another date". */
  nextDate: msg<{ name: string }>([({ name }) => `When does ${name} run out next? Reply to this with the date, or with _${NOT_RENEWED}_.`]),
  nextSet: msg<{ name: string; date: string }>([({ name, date }) => `${name}: until ${date}.`]),
  ended: msg<{ name: string }>([({ name }) => `${name} is off the list.`]),

  // ── Showing ──
  list: msg<{ paying: string[]; running: string[]; month: string | null; year: string | null }>([
    ({ paying, running, month, year }) =>
      [
        ...(paying.length ? ["*What you pay for*", ...paying.map((l, i) => `${i + 1}. ${l}`), ...(month ? ["", `*${month} a month*, ${year} a year`] : [])] : []),
        ...(paying.length && running.length ? [""] : []),
        ...(running.length ? ["*Expires*", ...running.map((l, i) => `${paying.length + i + 1}. ${l}`)] : []),
      ].join("\n"),
  ]),
  nothingYet: msg([`I keep nothing here yet. Tell me what you pay for, like _${EXAMPLE}_, or what runs out, like _${EXAMPLE_EXPIRES}_.`]),

  // ── When it can't do what was asked ──
  notFound: msg<{ name: string }>([({ name }) => `I keep nothing called "${name}". Send _${LIST}_ to see what I keep.`]),
  several: msg<{ names: string[] }>([({ names }) => `Which one: ${names.join(", ")}? Send it again with the full name.`]),
  notExpiring: msg<{ name: string }>([({ name }) => `${cap(name)} renews by itself, so there is nothing to mark done. _${REMOVE_EXAMPLE}_ takes one off the list.`]),
  gone: msg(["That one is off the list."]),
  replyHow: msg([`To correct it, reply with the amount or the date. To take it off, reply _${REMOVE}_.`]),
  /** A message that is neither a ready-made one nor something to keep. */
  format: msg([
    `I need a name with an amount or a date, like _${EXAMPLE}_ or _${EXAMPLE_EXPIRES}_. Send _${HELP}_ for more.`,
    `I couldn't read that. Tell me what it is with its amount or its date: _${EXAMPLE}_. _${HELP}_ shows the rest.`,
  ]),
  /** A message understood as wanting one thing, without saying which. */
  whichOne: msg<{ example: string }>([({ example }) => `Which one? Send it with the name, like _${example}_.`]),
};
