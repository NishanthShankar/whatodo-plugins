/**
 * Everything TripExpenses puts on WhatsApp: its welcome and help, every reply and
 * every reaction. index.ts decides what to say; this file decides how.
 *
 * A message is a list of wordings (see src/copy.ts) and one is picked each time. A message
 * takes its data and returns the whole text.
 */
import { fixed, msg } from "../../sdk";

// ── Words the parser in index.ts reads back, and the examples shown to people. ──

/** The platform's own word: it sends this plugin's help. */
export const HELP = fixed("help");
export const EXAMPLE = fixed("lunch 450");
export const EXAMPLE_2 = fixed("cab 300");
/** The amount first: it reads the same. */
export const EXAMPLE_FIRST = fixed("450 lunch");
export const EXAMPLE_OTHER = fixed("dinner 20 usd");
export const TOTAL = fixed("total");
export const END = fixed("end trip");
export const TRIPS = fixed("trips");
export const UNDO = fixed("undo");
export const CURRENCY = fixed("currency");
export const CURRENCY_EXAMPLE = fixed("currency usd");
export const TYPED_EXAMPLE = fixed("sgd");
export const NAME_EXAMPLE = fixed("name goa");
/** Sent as a reply to an expense. */
export const DELETE = fixed("delete");
/** Sent as a reply to an expense: its bill comes back. */
export const BILL = fixed("bill");
export const TAG_EXAMPLE = fixed("lunch 450 #food");
export const TAG_REPLY = fixed("#food");
/** Who owes whom, when everyone shares the trip equally. */
export const SPLIT = fixed("split");
/** Who pays next, to even things out. */
export const NEXT = fixed("next");
/** Stops the split sent by itself at the end of a day, and starts it again. */
export const SPLIT_OFF = fixed("split off");
export const SPLIT_ON = fixed("split on");
/** The trip's own clock. */
export const ZONE_EXAMPLE = fixed("time zone tokyo");
export const TIME_EXAMPLE = fixed("it's 9pm here");
/** Sent as a reply to an expense: the person who says it spent it. */
export const MINE_EXAMPLE = fixed("mine");
/** Every way of saying that, as the parser reads it: lower case, with no full stop at the end. */
export const MINE = /^(me|mine|i|my|by me|i paid|i did|i spent|i spent (it|this|that)|i paid (it|this|that)|paid by me|(it'?s|that'?s|this is|it is|that is|this one'?s|this one is|that was|it was|this was) (mine|me)|mine too|me too)$/;

// ── Reactions ──

/** On an expense that was kept, and on a reply that changed or removed one. */
export const SAVED = fixed("👍");

/** One expense as a list shows it. */
export interface Row {
  what: string;
  /** "₹450". */
  amount: string;
  /** Who sent it. Null when one person sent everything, or the name isn't known. */
  who: string | null;
  /** Its labels, without the "#". */
  tags?: string[];
  /** A photo of its bill is kept. */
  bill?: boolean;
  /** The emoji someone reacted to it with: its group. */
  mark?: string | null;
}

/** Who owes whom when a trip's cost is shared equally by everyone on it. */
export interface Owes {
  /** How many people share it. */
  n: number;
  /** One person's share, each currency on its own: "₹400 + $10". */
  each: string;
  /** The payments that settle it, as few as it takes. Empty when everyone has paid their share. */
  pays: { from: string; to: string; amount: string }[];
  /** Who pays next to even things out: whoever is furthest under their share, and by how much. Null when everyone is even. */
  next?: { who: string; short: string } | null;
}

/** A trip as an answer shows it. */
export interface Shown {
  /** "Goa" or "Trip 2". */
  title: string;
  /** "3 Nov" or "3 to 7 Nov". */
  days: string;
  count: number;
  /** "₹24,990 + $20". */
  total: string;
  /** The rows shown: the newest ones when the trip is long. */
  rows: Row[];
  /** The number of the first row shown. */
  from: number;
  /** What each person sent, when more than one did: "Asha ₹450". */
  people: string[];
  /** What each label adds up to, when any expense has one: "food ₹450". */
  labels?: string[];
  /** What each emoji's group adds up to, when any expense has one: "🍕 ₹450". */
  marks?: string[];
  /** Who owes whom, when more than one person is on the trip. */
  owes?: Owes | null;
}

const owing = (o: Owes) => (o.pays.length ? o.pays.map((p) => `${p.from} pays ${p.to} ${p.amount}`).join("\n") : "Everyone has paid their share.");
/** For a trip still open: who picks up the next bill. */
const nextUp = (o: Owes) => (o.next ? `\n\n${o.next.who} should pay next, to even things out.` : "");
const HOW_TO_STOP = `I send this at 9pm on a day when something was spent. _${SPLIT_OFF}_ stops it.`;

const row = (r: Row, n: number) => `${n}. ${r.what} ${r.amount}${r.tags?.length ? ` ${r.tags.map((t) => `#${t}`).join(" ")}` : ""}${r.mark ? ` ${r.mark}` : ""}${r.bill ? " 📎" : ""}${r.who ? ` · ${r.who}` : ""}`;
const expenses = (n: number) => `${n} ${n === 1 ? "expense" : "expenses"}`;

function list(t: Shown): string {
  const lines: string[] = [];
  if (t.from > 1) lines.push(`_${expenses(t.from - 1)} before these._`);
  lines.push(...t.rows.map((r, i) => row(r, t.from + i)));
  lines.push("", `*Total: ${t.total}* · ${expenses(t.count)}`);
  if (t.people.length) lines.push(t.people.join(" · "));
  if (t.labels?.length) lines.push(t.labels.map((l) => `#${l}`).join(" · "));
  if (t.marks?.length) lines.push(t.marks.join(" · "));
  return lines.join("\n");
}

export const copy = {
  // ── What the plugin says about itself ──
  welcome: msg([
    `🧾 You've added *TripExpenses*.\n\nSend me each expense as what it was and the amount, like _${EXAMPLE}_ or _${EXAMPLE_FIRST}_. I add them up. Add your friends to this group and they can send theirs too.\n\nSay _${END}_ when it's over. To start a new trip, change this group's description to the trip's name.\n\nSend _${HELP}_ for more.`,
  ]),
  help: msg([
    [
      "*TripExpenses*",
      "",
      `Send an expense as what it was and the amount, in either order: _${EXAMPLE}_ or _${EXAMPLE_FIRST}_. I keep it and add it up. Several lines in one message are several expenses.`,
      `Put a currency with the amount to keep it in that one: _${EXAMPLE_OTHER}_.`,
      "",
      `_${TOTAL}_ shows the list and the sum so far`,
      `_${END}_ closes the list. The next expense starts a new trip`,
      "A new description for this group starts a new trip too, called what you wrote",
      `_${SPLIT}_ shows who owes whom, with the trip shared equally by everyone here`,
      `_${NEXT}_ (or _who?_) says who should pay next to even things out`,
      `With more than two of you I send the split at 9pm on a day something was spent. _${SPLIT_OFF}_ stops it, _${SPLIT_ON}_ starts it`,
      `Abroad? _${ZONE_EXAMPLE}_ or _${TIME_EXAMPLE}_ puts this trip on the time where you are`,
      `_${TRIPS}_ shows the trips you have ended`,
      `_${NAME_EXAMPLE}_ names this trip`,
      `_${CURRENCY_EXAMPLE}_ changes what I count plain amounts in for this trip`,
      `_${UNDO}_ removes the last expense you sent`,
      "",
      `Add a label with a #: _${TAG_EXAMPLE}_. The list adds up each label.`,
      "React to an expense with an emoji, like 🍕, and it joins that emoji's group. The list adds up each group.",
      "Send a photo of the bill with the expense as its caption, and I keep the two together.",
      "",
      `The person who sends an expense spent it. If someone else did, reply to it and tag them, or they reply _${MINE_EXAMPLE}_.`,
      `Reply to an expense with the right amount to correct it, with _${DELETE}_ (or a ❌ reaction) to remove it, with a photo to keep its bill, with _${TAG_REPLY}_ to label it, or with _${BILL}_ to see its bill.`,
    ].join("\n"),
  ]),
  groupName: msg(["🧾 TripExpenses"]),

  // ── Keeping ──
  /**
   * Sent once in a group, after the very first expense is kept: what happens here from now on.
   * `currency`: the sign of the one the trip is counted in, when the message said. Null: the
   * question about it follows.
   */
  firstKept: msg<{ kept: string[]; currency: string | null }>([
    ({ kept, currency }) =>
      [
        `Kept: ${kept.join("; ")}.`,
        "",
        `I add up every expense sent here. What it was and the amount, in either order, like _${EXAMPLE_2}_. Anyone in this group can send one.`,
        `_${TOTAL}_ shows the sum so far. _${END}_ closes the list. For a new trip, change this group's description to its name.`,
        ...(currency ? [`I'm counting this trip in ${currency}. An amount with another currency, like _${EXAMPLE_OTHER}_, is kept in that one.`] : []),
        "",
        "From now on a 👍 means kept.",
      ].join("\n"),
  ]),
  /** The question about a trip's currency. `first`: it is the very first trip here. */
  whichCurrency: msg<{ first: boolean }>([
    ({ first }) => `${first ? "Which currency do I count in?" : "A new trip. Which currency do I count this one in?"} Pick one, or type another, like ${TYPED_EXAMPLE}.`,
  ]),
  /** The record once the currency is settled, by an answer or by `currency usd`. */
  counting: msg<{ currency: string; place?: string | null }>([
    ({ currency, place }) => `Counting in ${currency}.${place ? ` I'll keep this trip on ${place} time. _${ZONE_EXAMPLE}_ changes that.` : ""}`,
    ({ currency, place }) => `${currency} it is.${place ? ` I'll keep this trip on ${place} time. _${ZONE_EXAMPLE}_ changes that.` : ""}`,
  ]),
  /** The trip's clock was set. `time`: what it is there now, "9:05pm". */
  zoneSet: msg<{ place: string; time: string }>([({ place, time }) => `This trip is on ${place} time now. It's ${time} there.`]),
  /** `time zone` on its own. */
  zoneNow: msg<{ place: string; time: string }>([({ place, time }) => `This trip is on ${place} time: ${time} now. To change it: _${ZONE_EXAMPLE}_, or tell me the time, like _${TIME_EXAMPLE}_.`]),
  /**
   * Asked once a trip, when expenses keep arriving between 3am and 5am by the trip's clock: they have probably travelled.
   * `time`: what my clock says, "3:40am". The owner asked for a dry butler here, who offends nobody, and for no lesson in
   * how to answer: they say it their own way and the intent model reads it. The joke is on my clock, and staying up is
   * treated as a talent.
   */
  whatTime: msg<{ time: string }>([
    ({ time }) => `My clock says ${time}. Either you've travelled, or you keep hours I can only admire. Which is it?`,
    ({ time }) => `It is ${time} by my clock, and the bills are still coming in. Impressive, or you're somewhere else entirely. Which?`,
  ]),
  /** They have travelled (or I couldn't tell): the one thing I need. */
  timeExactly: msg(["What time is it there, exactly?"]),
  /** They said the time or the place. `time`: what it is there now, "9:05pm". */
  timeNoted: msg<{ time: string }>([({ time }) => `${time} it is. I'll update the reminder times.`]),
  zoneUnknown: msg([`I don't know that place. Try a big city near you, like _${ZONE_EXAMPLE}_, or tell me the time: _${TIME_EXAMPLE}_.`]),
  /** `currency` on its own. */
  countingNow: msg<{ currency: string }>([({ currency }) => `I'm counting this trip in ${currency}. To change it: _${CURRENCY_EXAMPLE}_.`]),
  currencyUnknown: msg([`I don't know that currency. Send its three letters, like _${CURRENCY_EXAMPLE}_.`]),
  /** A message with no amount: how to send one. */
  format: msg([
    `I need what it was and the amount, like _${EXAMPLE}_ or _${EXAMPLE_FIRST}_. Add a currency if it isn't the usual one: _${EXAMPLE_OTHER}_.`,
    `That has no amount I can add. Send what it was and the amount, in either order: _${EXAMPLE}_.`,
  ]),
  /** Some lines of a message were kept and some had no amount. */
  someNotKept: msg<{ kept: number; lines: string[] }>([
    ({ kept, lines }) => `Kept ${kept}. ${lines.length === 1 ? "This line has" : "These lines have"} no amount, so I left ${lines.length === 1 ? "it" : "them"} out:\n${lines.map((l) => `- ${l}`).join("\n")}`,
  ]),
  full: msg<{ max: number }>([({ max }) => `This trip has ${max} expenses, which is as many as one list holds. Say _${END}_ and carry on in a new one.`]),

  /** Said once in a group the person already had, when they make it this app's. */
  joinedGroup: msg([
    `🧾 I add up expenses in this group now. Send what it was and the amount, like _${EXAMPLE}_ or _${EXAMPLE_FIRST}_. Anyone here can.\n\n_${TOTAL}_ shows the sum so far, and _${END}_ closes the list. For a new trip, change this group's description to its name.`,
  ]),
  /**
   * The group got a new description or name, so a new trip starts. `closed`: the trip that was
   * open, when it had anything in it.
   */
  newTrip: msg<{ title: string; closed: Shown | null }>([
    ({ title, closed }) => `${closed ? `*${closed.title}* · ${closed.days}\n\n${list(closed)}\n\nThis list is closed. ` : ""}A new trip starts: *${title}*. Send its first expense.`,
  ]),

  /** Said once in a group, the first time a bill's photo is kept: how bills work here. */
  firstBill: msg<{ what: string }>([
    ({ what }) => `Kept the bill with ${what}.\n\nSend a bill's photo with the expense as its caption, like _${EXAMPLE}_, or reply to an expense with the photo. Reply _${BILL}_ to an expense to see its bill. A 📎 in the list marks one that has it.\n\nFrom now on a 👍 means kept.`,
  ]),
  /** The bill of an expense, sent back as the caption of its photo. */
  billOf: msg<{ what: string; amount: string }>([({ what, amount }) => `${what} ${amount}`]),
  noBill: msg(["No bill is kept for that one. Reply to it with a photo of the bill and I keep it."]),
  /** A photo sent as a reply to a message that held several expenses. */
  billWhich: msg(["That message holds several expenses, so I can't tell whose bill this is. Send the photo with the expense as its caption."]),

  /** Said once in a group, the first time an expense is given to someone: how that works here. `who`: null when their name isn't known. */
  firstWho: msg<{ what: string; who: string | null }>([
    ({ what, who }) => `${what} is ${who ? `${who}'s` : "theirs"} now.\n\nWhoever sends an expense spent it. When someone else did, reply to it and tag them, or they reply _${MINE_EXAMPLE}_. From now on a 👍 means done.`,
  ]),
  /** A reply to an expense that tags more than one person. */
  whoOne: msg(["One expense, one person. Reply to it again and tag only who spent it."]),

  // ── Showing ──
  total: msg<Shown>([(t) => `*${t.title}, so far*\n\n${list(t)}`]),
  ended: msg<Shown>([(t) => `*${t.title}* · ${t.days}\n\n${list(t)}${t.owes ? `\n\nShared equally by ${t.owes.n}, that is ${t.owes.each} each:\n${owing(t.owes)}` : ""}\n\nThis list is closed. The next expense starts a new trip.`]),
  /** `split`: who owes whom on the open trip. */
  split: msg<{ title: string; owes: Owes; daily?: boolean }>([
    ({ title, owes, daily }) => `*${title}, shared equally by ${owes.n}*\n${owes.each} each.\n\n${owing(owes)}${nextUp(owes)}${daily ? `\n\nFrom now on ${HOW_TO_STOP.replace(/^I send/, "I'll send")}` : ""}`,
  ]),
  /** The split sent by itself at the end of a day. `first`: the group has not been told how to stop it. */
  dailySplit: msg<{ title: string; owes: Owes; first: boolean }>([
    ({ title, owes, first }) => `*${title} tonight, shared equally by ${owes.n}*\n${owes.each} each.\n\n${owing(owes)}${nextUp(owes)}${first ? `\n\n${HOW_TO_STOP}` : ""}`,
  ]),
  dailyOff: msg([`I won't send the split by myself any more. Ask for it any time with _${SPLIT}_. _${SPLIT_ON}_ brings it back.`]),
  dailyOn: msg([`I'll send the split at 9pm on each day something is spent. _${SPLIT_OFF}_ stops it.`]),
  /** `next`: who pays next. */
  next: msg<{ who: string; short: string }>([({ who, short }) => `${who} pays next. ${short} short of an equal share.`, ({ who, short }) => `${who}. ${short} short of an equal share so far.`]),
  nextEven: msg(["You're all even. Anyone can pay next."]),
  nextAlone: msg(["You're the only one on this trip so far, so it's you. I count a friend in once they write here or are tagged on an expense."]),
  /** `split` with one person on the trip. */
  splitAlone: msg(["You're the only one on this trip so far, so there is nothing to share out. I count a friend in once they write here or are tagged on an expense."]),
  nothingYet: msg([`Nothing to add up yet. Send an expense like _${EXAMPLE}_.`]),
  nothingToEnd: msg([`There's nothing to end. Send an expense like _${EXAMPLE}_ and a trip starts.`]),
  trips: msg<{ trips: { title: string; days: string; count: number; total: string; open: boolean }[] }>([
    ({ trips }) => `*Your trips*\n\n${trips.map((t) => `${t.title} · ${t.days} · ${expenses(t.count)} · ${t.total}${t.open ? " · open" : ""}`).join("\n")}`,
  ]),
  noTrips: msg([`No trips yet. Send an expense like _${EXAMPLE}_ and the first one starts.`]),

  // ── Changing ──
  removed: msg<{ what: string; amount: string }>([({ what, amount }) => `Removed: ${what} ${amount}.`]),
  nothingToUndo: msg(["There's nothing of yours to remove in this trip."]),
  /** A reply to an expense that is no longer kept. */
  gone: msg(["That one isn't kept any more."]),
  /** A reply to an expense of a trip that has ended. */
  closed: msg(["That trip is closed, so I've left it as it is."]),
  /** A correction sent as a reply to a message that held several expenses. */
  several: msg([`That message holds several expenses. Reply _${DELETE}_ to remove them, then send the right ones.`]),
  replyHow: msg([`To correct it, reply with the right amount, or the whole line like _${EXAMPLE}_. To remove it, reply _${DELETE}_. To label it, reply _${TAG_REPLY}_.`]),
};
