/**
 * Everything MediaStore puts on WhatsApp: its welcome and help, every reply, every question,
 * every group name and every reaction. index.ts decides what to say; this file decides how.
 *
 * Each message is a list with one wording today (see src/copy.ts). A message takes its data
 * and returns the whole text.
 */
import { fixed, msg } from "../../sdk";

// ── Words the parser in index.ts reads back, and the examples shown to people. ──
// A message that names a command uses these, so a rewrite can't break one by accident.

/** The platform's own word: it sends this plugin's help. */
export const HELP = fixed("help");
export const FIND = fixed("find");
export const FIND_EXAMPLE = fixed("find pasta");
export const RECENT = fixed("recent");
export const LIKED = fixed("liked");
export const IMPORTANT = fixed("important");
export const UNDO = fixed("undo");
export const GROUPS = fixed("groups");
export const NEW_GROUP = fixed("new group");
export const NEW_GROUP_EXAMPLE = fixed("new group recipes");
export const CLOSE_GROUP_EXAMPLE = fixed("close group recipes");
/** Sent as a reply to a link. */
export const MOVE = fixed("move");
export const DELETE = fixed("delete");

// ── Reactions ──

/** On a message whose links were kept. */
export const SAVED = fixed("👍");
/** On a reply to a link that changed it (a note, a mark, a move, a delete). */
export const DONE = fixed("👍");

// ── Options of the "move to which group?" question ──
// index.ts compares the chosen option's text with these two, so each has one wording.

/** The last option: the link stays where it is. */
export const STAY = fixed("Leave it here");
/** What the main group is called among the options. */
export const MAIN_NAME = fixed("MediaStore");

/** A saved link as a list shows it. */
export interface Row {
  /** Its title, or what stands in for one. */
  heading: string;
  author: string | null;
  /** "YouTube short", "example.com". */
  what: string;
  /** Their own words about it, when they get a line of their own; null for no line. */
  note: string | null;
  url: string;
  liked: boolean;
  important: boolean;
}

interface Listing {
  rows: Row[];
  /** How many more there are than `rows` shows. */
  more: number;
}

function line(row: Row, n?: number): string {
  const marks = `${row.important ? "⭐ " : ""}${row.liked ? "❤️ " : ""}`;
  const by = [row.author, row.what].filter(Boolean).join(" · ");
  const out = [`${n ? `${n}. ` : ""}${marks}*${row.heading}*`, by];
  if (row.note !== null) out.push(`_${row.note}_`);
  out.push(row.url);
  return out.join("\n");
}

/** A title, then the links (numbered when there is more than one), then how many were left out. */
function listing(title: string, { rows, more }: Listing): string {
  const tail = more > 0 ? `\n\n_${more} more on app.whatodo.today._` : "";
  return `${title}\n\n${rows.map((r, i) => line(r, rows.length > 1 ? i + 1 : undefined)).join("\n\n")}${tail}`;
}

export const copy = {
  // ── What the plugin says about itself ──
  welcome: msg([
    `🎬 You've added *MediaStore*.\n\nSend or forward a link here: a YouTube video, a short, an Instagram reel. I'll keep it so you can find it later.\n\nSend _${HELP}_ for more.`,
  ]),
  help: msg([
    [
      "*MediaStore*",
      "",
      "Send or forward a link and I keep it with its title and caption. Add a few words of your own in the same message if you like.",
      "",
      `_${FIND_EXAMPLE}_ looks through everything you've saved`,
      `_${RECENT}_ shows your latest links`,
      `_${LIKED}_ and _${IMPORTANT}_ show the ones you marked`,
      `_${UNDO}_ removes the last link you saved`,
      "",
      `On a link you sent: react ❤️ to like it or ⭐ to mark it important. Reply to it with words to add a note, with _${MOVE}_ to put it in another group, or with _${DELETE}_ to remove it.`,
      "",
      `_${NEW_GROUP_EXAMPLE}_ makes a WhatsApp group just for one kind of link`,
      `_${GROUPS}_ lists them, _${CLOSE_GROUP_EXAMPLE}_ stops one`,
      "",
      "Everything is on app.whatodo.today too, with pictures and filters.",
    ].join("\n"),
  ]),
  /** The main group's name. */
  groupName: msg(["🎬 MediaStore"]),
  /** The fallback when a message is nothing MediaStore knows. */
  unsure: msg([`I didn't get that. Send a link to save it, or _${FIND}_ and a few words to look for one. Send _${HELP}_ for more.`]),

  // ── Saving ──
  /** Sent once, after the very first save. `read`: Zelfred could read the link's page. */
  firstSave: msg<{ read: boolean }>([
    ({ read }) =>
      [
        read
          ? `🎬 Saved. I've kept its title and caption too, so next time it's easier to find: send _${FIND}_ and a few words about it.`
          : `🎬 Saved. I couldn't read this one's title or caption, so add a few words of your own by replying to your link. For most links I keep the title and caption, and you can find them with _${FIND}_ and a few words.`,
        "",
        "On your link: react ❤️ to like it or ⭐ to mark it important, or reply to it with a note of your own.",
        "From now on you'll just get a 👍.",
      ].join("\n"),
  ]),
  tooManyLinks: msg<{ max: number }>([({ max }) => `That's the most links I can keep (${max}). Delete some on app.whatodo.today first.`]),

  // ── Finding and listing ──
  nothingSavedYet: msg(["Nothing is saved yet. Send or forward a link and I'll keep it."]),
  nothingSaved: msg(["Nothing is saved yet."]),
  noMatch: msg<{ query: string }>([({ query }) => `Nothing saved matches "${query}". Send _${RECENT}_ to see your latest links.`]),
  found: msg<Listing & { query: string; count: number }>([({ query, count, ...list }) => listing(`🔎 *${query}*: ${count} found`, list)]),
  noneLiked: msg(["You haven't liked any yet. React ❤️ to a link you sent."]),
  noneImportant: msg(["Nothing is marked important yet. React ⭐ to a link you sent."]),
  liked: msg<Listing>([(list) => listing("❤️ *Liked*", list)]),
  important: msg<Listing>([(list) => listing("⭐ *Important*", list)]),
  latest: msg<Listing>([(list) => listing("🎬 *Latest*", list)]),
  /** `sites`: how many links from each site, most first. */
  count: msg<{ total: number; sites: { site: string; n: number }[] }>([
    ({ total, sites }) => `You have ${total} link${total === 1 ? "" : "s"} saved: ${sites.map(({ site, n }) => `${n} ${site}`).join(", ")}.`,
  ]),
  removed: msg<{ heading: string }>([({ heading }) => `Removed *${heading}*.`]),

  // ── Replying to a link ──
  linkGone: msg(["That link isn't saved any more."]),
  noGroupToMoveTo: msg<{ name: string }>([({ name }) => `I don't have a group called "${name}". Send _${NEW_GROUP} ${name}_ to make it.`]),
  noGroupsInCommon: msg(["No groups in common. You can move it on app.whatodo.today, or forward it to your own group."]),
  /** The poll's question. index.ts takes every * out of it: a poll shows them as they are. */
  moveQuestion: msg<{ title: string }>([({ title }) => `Move *${title}* to which group?`]),
  moved: msg<{ name: string }>([({ name }) => `Moved to *${name}*.`]),
  groupGone: msg(["That group isn't there any more."]),
  howToMove: msg([`Reply to the link you want to move and send _${MOVE}_. I'll show you the groups it can go to.`]),

  // ── Groups ──
  /** Also shown on the web page when making a group there fails (without the _ and *). */
  groupNeedsName: msg([`Give the group a name, like _${NEW_GROUP_EXAMPLE}_.`]),
  /** Also shown on the web page (without the _ and *). */
  groupExists: msg<{ name: string }>([({ name }) => `You already have a group called *${name}*.`]),
  /** Also shown on the web page (without the _ and *). */
  tooManyGroups: msg<{ max: number }>([({ max }) => `That's the most groups I can keep (${max}). Close one first.`]),
  nameTheGroup: msg([`What should it be called? Send _${NEW_GROUP_EXAMPLE}_.`]),
  makingGroup: msg<{ name: string }>([({ name }) => `🎬 I'm making a WhatsApp group for *${name}*. Send its links there once it appears.`]),
  /** The WhatsApp group's name. index.ts cuts it to the 25 characters a group name can have. */
  groupTitle: msg<{ name: string }>([({ name }) => `🎬 ${name}`]),
  /** The first message in a group MediaStore made. */
  groupHello: msg<{ name: string }>([
    ({ name }) =>
      `🎬 This group is for your *${name}* links. Send or forward a link here and I'll keep it under ${name}.\n\n_${FIND}_ and _${RECENT}_ here look only through this group's links.`,
  ]),
  /** Said in a group the person already had, when it becomes a MediaStore group. */
  joinedGroup: msg<{ name: string }>([
    ({ name }) =>
      `🎬 I'm saving the links sent in this group now. Send or forward a YouTube video, a short or an Instagram reel here and I'll keep it under *${name}*.\n\n_${FIND}_ and a few words looks through this group's links.`,
  ]),
  noGroups: msg([`No groups yet. Send _${NEW_GROUP_EXAMPLE}_ to make one for one kind of link.`]),
  groups: msg<{ groups: { name: string; count: number }[] }>([
    ({ groups }) => ["*Your groups*", "", ...groups.map(({ name, count }) => `*${name}*: ${count} link${count === 1 ? "" : "s"}`)].join("\n"),
  ]),
  groupClosed: msg<{ name: string }>([({ name }) => `*${name}* is closed. Its links are still saved.`]),
  noSuchGroup: msg<{ name: string }>([({ name }) => `I don't have a group called "${name}". Send _${GROUPS}_ to see yours.`]),
};
