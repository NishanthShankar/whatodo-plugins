/**
 * Everything Digits puts on WhatsApp: its welcome and help, every answer and every reaction.
 * index.ts decides what to say; this file decides how.
 *
 * A message is a list of wordings (see src/copy.ts) and one is picked each time. A message
 * takes its data and returns the whole text. Every line here is a first draft, waiting for
 * og-copy-bot's read and the owner's pick.
 */
import { fixed, msg } from "../../sdk";
import type { Secret } from "./read";

// ── Words the parser in index.ts reads back, and the examples shown to people. ──

/** The first example a new person sees: not about the body (the owner, 2026-11-26: "weight as second thing atleast"). */
export const EXAMPLE = fixed("Amma ring size 14");
export const EXAMPLE_WEIGHT = fixed("weight 72.4");
export const EXAMPLE_SEVERAL = fixed("waist 34 hips 39");
export const EXAMPLE_ASK = fixed("weight?");
export const LIST = fixed("list");
export const UNDO = fixed("undo");
export const HISTORY_EXAMPLE = fixed("history weight");
export const REMOVE_EXAMPLE = fixed("remove weight");
/** Where the page lives. The address is sent plain until a plugin can send a link that signs people in. */
export const PAGE = fixed("app.zelfred.com/plugins/digits-store");

/** Words that ask for everything. */
export const LIST_WORDS = [LIST, fixed("all"), fixed("everything"), fixed("numbers"), fixed("digits"), fixed("show all"), fixed("list all")];
/** Words that take a message's numbers out again, sent alone or as a reply to that message. */
export const UNDO_WORDS = [UNDO, fixed("remove"), fixed("delete"), fixed("wrong"), fixed("forget"), fixed("forget it"), fixed("remove it"), fixed("delete it"), fixed("remove this"), fixed("delete this")];
/** Words that ask for a label's whole history: "history weight", "weight history". */
export const HISTORY_WORDS = [fixed("history"), fixed("graph"), fixed("all of")];
/** Words that start taking a label out: "remove weight". */
export const REMOVE_WORDS = [fixed("remove"), fixed("delete"), fixed("forget"), fixed("clear")];

// ── Reactions ──

/** On a message whose numbers were kept, when nothing is said in words. */
export const SAVED = fixed("👍");
/** A reaction that takes a message's numbers out. */
export const REMOVE_REACTIONS = [fixed("❌"), fixed("✖️"), fixed("🗑️"), fixed("🗑")];

// ── The options of the one question, in order. index.ts matches a vote by its place. ──

export const REMOVE_OPTIONS = [fixed("Remove"), fixed("Keep it")];
export const SAME_OPTIONS = [fixed("Yes"), fixed("No")];

const SECRET: Record<Secret, string> = { pin: "a PIN", card: "a card number", aadhaar: "an Aadhaar number" };

/** "Weight", as a label is shown at the start of a line. */
export const shown = (name: string) => (name ? name[0].toUpperCase() + name.slice(1) : name);

/** One label's latest value, for an answer or the list. */
export interface Line {
  name: string;
  /** "72.4 kg" as typed. */
  value: string;
  /** "today", "yesterday", "on 3 November". */
  when: string;
  /** How many are kept under it. */
  count: number;
  /** The first ever, when there is more than one. */
  first: { value: string; when: string } | null;
}

const latest = (l: Line) => `*${shown(l.name)}*: ${l.value}, ${l.when}.`;

export const copy = {
  groupName: msg(["🔢 Digits"]),

  // A welcome that asks for nothing (docs/plugin-onboarding.md), and names one thing to send.
  welcome: msg([`Numbers live here. Send one with a word for what it is, like _${EXAMPLE}_, and ask for it back whenever you like.`]),

  help: msg([
    [
      "*Digits*",
      "",
      "Send a number with a word for what it is, in your own words. A few ready-made ones:",
      "",
      `• _${EXAMPLE}_: kept`,
      `• _${EXAMPLE_WEIGHT}_: kept, with the ones before it`,
      `• _${EXAMPLE_SEVERAL}_: two kept at once`,
      `• _${EXAMPLE_ASK}_: the latest, with the first`,
      `• _${HISTORY_EXAMPLE}_: every one, newest first`,
      `• _${LIST}_: everything I keep`,
      `• _${UNDO}_: takes the last one out`,
      `• _${REMOVE_EXAMPLE}_: takes weight out, with all of it`,
      "",
      "A photo sent with its number is kept with it. To change one, reply to your message with the right number, or react ❌ to take it out.",
      "",
      `Every number has a page with its graph: ${PAGE}`,
    ].join("\n"),
  ]),

  /** The first thing ever kept: said in words once, then the 👍 (docs/plugin-ui-styleguide.md, section 10). */
  firstKept: msg<{ name: string; value: string }>([({ name, value }) => `Kept: ${name}, ${value}. Ask me "${name}?" whenever you want it back, with the ones before it. From now on a 👍 means kept.`]),

  /** A number kept with no word for it, and nothing to guess from. The next words name it. */
  whatIsIt: msg<{ value: string }>([({ value }) => `What is ${value}?`]),

  /** A new number far from the last one under the same label: kept, and both said, with no verdict. */
  jump: msg<{ name: string; value: string; before: string }>([({ name, value, before }) => `Kept: ${name}, ${value}. The one before was ${before}.`]),

  /** Kept, and it looks like something people keep out of chats. Never refused (the owner, 2026-11-26). */
  secret: msg<{ what: Secret }>([({ what }) => `Kept. That looks like ${SECRET[what]}, and it now sits in this chat. If you'd rather it didn't, delete your message for everyone and I'll forget it too.`]),

  /** Kept and locked: a card number or a PIN is shown by its last four, or not at all (the owner, 2026-11-26). */
  locked: msg<{ what: Secret }>([
    ({ what }) =>
      `Kept, and hidden: I'll only ever show it ${what === "card" ? "by its last four" : "as dots"}, here and on the page. It still sits in your message above, so you may want to delete that one for everyone.`,
  ]),

  /** A date, said back in words so 12/03 is never read the wrong way round, and when it will be reminded. */
  keptDate: msg<{ name: string; date: string; remind: "yearly" | "once" | null }>([
    ({ name, date, remind }) => `Kept: ${name}, ${date}.${remind === "yearly" ? " I'll say so on the day, every year." : remind === "once" ? " I'll say so a week before, and on the day." : ""}`,
  ]),
  /** The same promise, after the first keep's own line. */
  remindLine: msg<{ kind: "yearly" | "once" }>([({ kind }) => (kind === "yearly" ? "I'll say so on the day, every year." : "I'll say so a week before, and on the day.")]),

  /** The morning a date is due, or a week before one that comes once. */
  reminder: msg<{ name: string; date: string; due: "today" | "soon"; kind: "yearly" | "once" }>([
    ({ name, date, due }) => (due === "today" ? `Today: *${shown(name)}*, ${date}.` : `A week from today: *${shown(name)}*, ${date}.`),
  ]),

  /** Asked once, when one name was asked for in place of another (the owner: "ask once and remember when in doubt"). The owner picked the plainest (2026-11-26): a question is always simple and never puzzling; any quirk goes in a line of its own. */
  samePerson: msg<{ asked: string; kept: string }>([({ asked, kept }) => `Are ${shown(asked)} and ${shown(kept)} the same person?`]),
  sameKept: msg<{ asked: string; kept: string }>([({ asked, kept }) => `Noted. ${shown(asked)} and ${shown(kept)} are one and the same. I shan't ask again.`]),
  sameNot: msg([`Noted. Two, then. I'll keep them apart.`]),

  /** A label was added to one at a time, so it counts up from now on. Said once per label, in place of the 👍. */
  nowCounting: msg<{ name: string }>([({ name }) => `Kept. ${shown(name)} goes up one at a time, so from now on just send "${name}" and I'll add one.`]),
  /** A counting label's name alone: one added, and the new count said. */
  counted: msg<{ name: string; count: number }>([({ name, count }) => `*${shown(name)}*: ${count}.`]),

  /** A later day, a second value under a label: kept, and the page named once, in place of the 👍. */
  keptWithPage: msg<{ name: string; count: number }>([({ name, count }) => `Kept. That's ${count} for ${name}, and they make a graph now: ${PAGE}`]),

  // ── Answers ──

  /** One label: the latest, and the first when there are more. */
  recall: msg<{ line: Line }>([
    ({ line }) => (line.first ? `${latest(line)} The first was ${line.first.value}, ${line.first.when}. ${line.count} kept.` : latest(line)),
  ]),

  /** Several labels matched the words asked: each one's latest. */
  recallMany: msg<{ lines: Line[] }>([({ lines }) => lines.map(latest).join("\n")]),

  list: msg<{ lines: Line[]; more: number }>([
    ({ lines, more }) => ["What I keep for you:", "", ...lines.map(latest), ...(more ? ["", `And ${more} more on the page: ${PAGE}`] : [])].join("\n"),
  ]),

  history: msg<{ name: string; rows: { value: string; when: string }[]; more: number }>([
    ({ name, rows, more }) => [`*${shown(name)}*, newest first:`, "", ...rows.map((r) => `${r.value}, ${r.when}`), ...(more ? ["", `And ${more} older on the page: ${PAGE}`] : [])].join("\n"),
  ]),

  /** Asked for something nothing is kept under. */
  notFound: msg<{ words: string }>([({ words }) => `Nothing kept as "${words}". Send _${LIST}_ to see what I keep.`]),

  /** Words, and nothing kept yet to look them up in. */
  nothingYet: msg([`Nothing kept yet. Send a number with a word for what it is, like _${EXAMPLE}_.`]),

  /** Once, the first time the person comes back on a later day: the page, after the first real day. */
  page: msg([`Every number has a page too, with a graph of how it has moved: ${PAGE}`]),

  // ── Taking out ──

  /** A message's numbers taken out, by undo, a reply or ❌. */
  takenOut: msg<{ what: string }>([({ what }) => `Taken out: ${what}.`]),
  nothingToUndo: msg(["Nothing to take out."]),
  askRemove: msg<{ name: string; count: number }>([({ name, count }) => (count === 1 ? `Remove ${name}?` : `Remove ${name}, all ${count} kept?`)]),
  removedLabel: msg<{ name: string }>([({ name }) => `${shown(name)} is gone, with everything kept under it.`]),
  keptLabel: msg<{ name: string }>([({ name }) => `No problem. ${shown(name)} stays.`]),

  // ── Photos ──

  /** A photo with no number and nothing kept just now to go with. */
  photoAlone: msg(["I keep a photo with its number. Send it again with the number written under it."]),
  photosFull: msg(["That one already has four photos, so I left this one out."]),

  /** The most labels an install keeps. */
  full: msg<{ max: number }>([({ max }) => `I already keep ${max} different things here, which is as many as I keep. Remove one to make room.`]),
};
