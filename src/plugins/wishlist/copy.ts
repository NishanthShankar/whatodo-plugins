/**
 * Everything Wishlist puts on WhatsApp: its welcome and help, every reply, every question,
 * every group name and every reaction. index.ts decides what to say; this file decides how.
 *
 * Each message is a list of wordings (see src/copy.ts). A message takes its data and returns
 * the whole text.
 */
import { fixed, msg } from "../../sdk";

// ── Words the parser in index.ts reads back, and the examples shown to people. ──

/** The platform's own word: it sends this plugin's help. */
export const HELP = fixed("help");
export const LIST = fixed("list");
export const LISTS = fixed("lists");
export const BOUGHT = fixed("bought");
export const UNDO = fixed("undo");
export const SHARE = fixed("share");
export const STOP_SHARING = fixed("stop sharing");
export const NEW_LIST = fixed("new list");
export const NEW_LIST_EXAMPLE = fixed("new list diwali");
export const NEW_GROUP_EXAMPLE = fixed("new group diwali");
export const LIST_NAME_EXAMPLE = fixed("diwali");
export const TYPED_EXAMPLE = fixed("running shoes 4000");
export const CURRENCY_EXAMPLE = fixed("currency usd");
/** Sent as a reply to something on a list. */
export const MOVE = fixed("move");
export const DELETE = fixed("delete");
export const READ_AGAIN = fixed("read again");

// ── Reactions ──

/** On a message whose things were added. */
export const SAVED = fixed("👍");
/** On a reply that changed something (a price, a note, a move, a delete). */
export const DONE = fixed("👍");

// ── Options that index.ts compares a chosen option's text with: one wording each. ──

/** The last option of "move to which list?": it stays where it is. */
export const STAY = fixed("Leave it here");
export const DELETE_YES = fixed("Delete it");
export const DELETE_NO = fixed("Keep it");

/** The list every wishlist starts with. */
export const FIRST_LIST = fixed("Wishlist");

/** Something on a list, as a message shows it. */
export interface Row {
  name: string;
  /** "₹24,990", already written out; null when it has no price. */
  price: string | null;
  /** Where it is from and its labels: "amazon.in · #audio". Null for no line. */
  detail: string | null;
  url: string | null;
  bought: boolean;
}

interface Listing {
  /** The list's name. */
  name: string;
  rows: Row[];
  /** How many more there are than `rows` shows. */
  more: number;
}

function line(row: Row, n?: number): string {
  const out = [`${n ? `${n}. ` : ""}${row.bought ? "✅ " : ""}*${row.name}*${row.price ? `  ${row.price}` : ""}`];
  if (row.detail) out.push(row.detail);
  if (row.url) out.push(row.url);
  return out.join("\n");
}

const things = (n: number) => `${n} thing${n === 1 ? "" : "s"}`;

function listing(title: string, { rows, more }: Listing): string {
  const tail = more > 0 ? `\n\n_${more} more on app.whatodo.today._` : "";
  return `${title}\n\n${rows.map((r, i) => line(r, rows.length > 1 ? i + 1 : undefined)).join("\n\n")}${tail}`;
}

export const copy = {
  // ── What the plugin says about itself ──
  welcome: msg([
    `🎁 You've added *Wishlist*.\n\nSend a link to something you want, or type it with its price: _${TYPED_EXAMPLE}_. I'll keep the list and the total.\n\nSend _${HELP}_ for more.`,
  ]),
  help: msg([
    [
      "*Wishlist*",
      "",
      `Send a link to something you want and I keep it with its name, picture and price. Or type it: _${TYPED_EXAMPLE}_.`,
      "",
      `_${LIST}_ shows what's left to buy, with the total`,
      `_${BOUGHT}_ shows what you already got`,
      `_${UNDO}_ removes the last thing you added`,
      "",
      `On something you added: react ✅ once you've bought it. Reply to it with a price, a note, a _#label_, _${MOVE}_ or _${DELETE}_. Reply _${READ_AGAIN}_ and I read its link once more.`,
      "",
      `_${NEW_LIST_EXAMPLE}_ starts another list in this chat. After that, _${LIST_NAME_EXAMPLE}_ before a link puts it there, and a link on its own goes to the list you used last.`,
      `_${NEW_GROUP_EXAMPLE}_ gives a list a WhatsApp group of its own`,
      `_${LISTS}_ shows every list you have`,
      "",
      `_${SHARE}_ gives you a link to this list that anyone can open. _${STOP_SHARING}_ closes it.`,
      "",
      "Everything is on app.whatodo.today too, with pictures.",
    ].join("\n"),
  ]),
  /** The main group's name. */
  groupName: msg(["🎁 Wishlist"]),
  /** The fallback when a message is nothing Wishlist knows. */
  unsure: msg([`I didn't get that. Send a link to something you want, or type it with its price, like _${TYPED_EXAMPLE}_. Send _${HELP}_ for more.`]),

  // ── Adding ──
  /** Sent once, after the very first thing is added. `priced`: it has a price already. */
  firstSave: msg<{ priced: boolean }>([
    ({ priced }) =>
      [
        priced ? "🎁 Added, with its price." : "🎁 Added. I couldn't find a price for this one, so reply to it with the price if you want it in the total.",
        "",
        `React ✅ on it once you've bought it. Send _${LIST}_ to see what's left and what it adds up to.`,
        "From now on you'll just get a 👍.",
      ].join("\n"),
  ]),
  /** A link on its own went to a list that isn't the chat's first one: say which. */
  addedTo: msg<{ name: string }>([({ name }) => `In *${name}*.`]),
  listFull: msg<{ name: string; max: number }>([({ name, max }) => `*${name}* is full (${max} things). Remove some first, or start another list with _${NEW_LIST}_ and a name.`]),
  tooMany: msg<{ max: number }>([({ max }) => `That's the most I can keep (${max} things). Remove some on app.whatodo.today first.`]),

  // ── Showing ──
  nothingYet: msg([`Nothing on the list yet. Send a link to something you want, or type it: _${TYPED_EXAMPLE}_.`]),
  nothingLeft: msg<{ name: string }>([({ name }) => `Nothing left to buy on *${name}*.`]),
  nothingBought: msg<{ name: string }>([({ name }) => `Nothing on *${name}* is bought yet. React ✅ on something once you have it.`]),
  /** What is still to buy. `sum`: what it adds up to, null when nothing has a price. */
  left: msg<Listing & { count: number; sum: string | null }>([({ count, sum, ...list }) => listing(`🎁 *${list.name}*: ${things(count)} to buy${sum ? `, ${sum}` : ""}`, list)]),
  boughtList: msg<Listing & { count: number; sum: string | null }>([({ count, sum, ...list }) => listing(`✅ *${list.name}*: ${things(count)} bought${sum ? `, ${sum}` : ""}`, list)]),
  /** Every list. `where`: the chat it lives in, when that isn't the one this is sent in ("own": a group made for it, "main": the first group). */
  lists: msg<{ lists: { name: string; left: number; sum: string | null; where: string | null; shared: boolean }[] }>([
    ({ lists }) =>
      [
        "*Your lists*",
        "",
        ...lists.map(({ name, left, sum, where, shared }) => `*${name}*: ${left ? `${things(left)} to buy${sum ? `, ${sum}` : ""}` : "nothing to buy"}${where === "own" ? " · in its own group" : where === "main" ? " · in the main group" : where ? ` · in ${where}` : ""}${shared ? " · shared" : ""}`),
      ].join("\n"),
  ]),
  removed: msg<{ name: string }>([({ name }) => `Removed *${name}*.`]),

  // ── Replying to something on a list ──
  itemGone: msg(["That isn't on a list any more."]),
  /** Asked to read a thing's link again, and it has none. */
  noLink: msg(["That one has no link for me to read. Reply to it with the price to set it."]),
  /** The poll's question. index.ts takes every * out of it: a poll shows them as they are. */
  moveQuestion: msg<{ name: string }>([({ name }) => `Move *${name}* to which list?`]),
  moved: msg<{ name: string }>([({ name }) => `Moved to *${name}*.`]),
  noOtherList: msg([`There is no other list to move it to. Send _${NEW_LIST_EXAMPLE}_ to start one.`]),
  noSuchList: msg<{ name: string }>([({ name }) => `I don't have a list called "${name}". Send _${LISTS}_ to see yours.`]),
  listGone: msg(["That list isn't there any more."]),

  // ── Lists ──
  /** Also shown on the web page when making a list there fails (without the _ and *). */
  listNeedsName: msg([`Give the list a name, like _${NEW_LIST_EXAMPLE}_.`]),
  /** Also shown on the web page (without the _ and *). */
  listExists: msg<{ name: string }>([({ name }) => `You already have a list called *${name}*.`]),
  /** Also shown on the web page (without the _ and *). */
  tooManyLists: msg<{ max: number }>([({ max }) => `That's the most lists I can keep (${max}). Delete one first.`]),
  /** A list started in the chat it was asked for in. */
  listMade: msg<{ name: string; example: string }>([({ name, example }) => `🎁 *${name}* is ready. Links you send here go to it now. To put one on another list, write the list's name first: _${example}_ and then the link.`]),
  makingGroup: msg<{ name: string }>([({ name }) => `🎁 I'm making a WhatsApp group for *${name}*. Send what you want for it there once it appears.`]),
  /** The WhatsApp group's name. index.ts cuts it to the 25 characters a group name can have. */
  groupTitle: msg<{ name: string }>([({ name }) => `🎁 ${name}`]),
  /** The first message in a group Wishlist made. */
  groupHello: msg<{ name: string }>([({ name }) => `🎁 This group is for *${name}*. Send a link to something you want here, or type it with its price, and it goes on that list.\n\n_${LIST}_ here shows what's left to buy.`]),
  /** Said in a group the person already had, when it becomes a Wishlist group. */
  joinedGroup: msg<{ name: string }>([
    ({ name }) => `🎁 I'm keeping a wishlist for this group now, called *${name}*. Anyone here can send a link to something wanted, or type it with its price.\n\n_${LIST}_ shows what's left to buy. React ✅ on something once it's bought.`,
  ]),
  using: msg<{ name: string }>([({ name }) => `Links you send here go to *${name}* now.`]),
  renamed: msg<{ name: string }>([({ name }) => `It's called *${name}* now.`]),
  /** The poll's question before a list is deleted. */
  deleteQuestion: msg<{ name: string; count: number }>([({ name, count }) => (count ? `Delete ${name} and the ${things(count)} on it?` : `Delete ${name}?`)]),
  listDeleted: msg<{ name: string }>([({ name }) => `*${name}* is deleted.`]),
  listKept: msg<{ name: string }>([({ name }) => `No problem. *${name}* stays.`]),
  currencySet: msg<{ currency: string; example: string }>([({ currency, example }) => `Prices you type are in ${currency} now, like ${example}.`]),
  /** Someone other than the person who added Wishlist asked to delete, rename or share a list. */
  ownerOnly: msg(["Only the person who added Wishlist here can do that. You can add things, tick them off and ask for the _list_."]),
  currencyUnknown: msg([`I don't know that currency. Send its three letters, like _${CURRENCY_EXAMPLE}_.`]),

  // ── Sharing ──
  /**
   * The message with the link, written to be forwarded as it is. So it is in the person's own
   * voice, not Zelfred's: they are the one who will send it on.
   */
  shareText: msg<{ name: string; url: string; first: boolean }>([
    ({ name, url, first }) => (first ? `My wishlist, in case you ever wonder what to get me:\n${url}` : `My ${name} list, in case you ever wonder what to get me:\n${url}`),
    ({ name, url, first }) => (first ? `For anyone who has asked what I want. It's all here:\n${url}` : `For anyone who has asked what I want. ${name}, all here:\n${url}`),
    ({ name, url, first }) => (first ? `No more guessing. Here is my wishlist:\n${url}` : `No more guessing. Here is my ${name} list:\n${url}`),
  ]),
  /** Said once, the first time anything is shared, right after the message with the link. */
  shareHow: msg([`Forward that message to anyone you like. The page shows the list and its prices, never your name or number, and it changes as the list does. _${STOP_SHARING}_ closes it.`]),
  sharingStopped: msg<{ name: string }>([({ name }) => `*${name}* isn't shared any more. The old link is closed for good.`]),
  notShared: msg<{ name: string }>([({ name }) => `*${name}* isn't shared.`]),

  // ── The shared page (not WhatsApp: what a visitor reads, so no "I") ──
  pageIntro: msg<{ want: number; got: number }>([
    ({ want, got }) => (want ? `${things(want)} wanted${got ? `, ${got} already bought` : ""}.` : got ? "Everything on this list is bought." : "Nothing on this list yet."),
  ]),
  pageBoughtHeading: msg(["Already bought"]),
  pageBought: msg(["Bought"]),
};
