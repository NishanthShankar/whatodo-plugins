/**
 * Everything SafeButWhere puts on WhatsApp: its welcome and help, every reply and every
 * reaction. index.ts decides what to say; this file decides how.
 *
 * A message is a list of wordings (see src/copy.ts) and one is picked each time. A message
 * takes its data and returns the whole text.
 */
import { fixed, msg } from "../../sdk";

// ── Words the parser in index.ts reads back, and the examples shown to people. ──

/** The platform's own word: it sends this plugin's help. */
export const HELP = fixed("help");
export const WHERE_EXAMPLE = fixed("where is my passport");
export const KEEP_EXAMPLE = fixed("passport, blue file, top shelf");
export const TAG_EXAMPLE = fixed("#documents");
export const RECENT = fixed("recent");
export const TAGS = fixed("tags");
export const UNDO = fixed("undo");
export const COUNT = fixed("count");
export const GROUPS = fixed("groups");
/** An emoji used in the examples for groups. */
export const GROUP_EXAMPLE = fixed("🔑");
/** Sent as a reply to a thing. */
export const DELETE = fixed("delete");

// ── Reactions ──

/** On a message that was kept, and on a reply that changed or removed a thing. */
export const SAVED = fixed("👍");

/** A thing as an answer shows it. */
export interface Shown {
  /** Their own words about it; null when it is a photo with no words. */
  what: string | null;
  tags: string[];
  /** The emoji they reacted to it with: the group it is in. Null when it is in none. */
  reaction: string | null;
  /** "3 March". */
  day: string;
  /** The name of the position kept with it, and where to open it on a map. */
  placeName: string | null;
  mapUrl: string | null;
  /** How far it is from the position just shared, in metres. Only in a "near here" answer. */
  away?: number;
}

const tagLine = (tags: string[]) => tags.map((t) => `#${t.replace(/ /g, "-")}`).join(" ");
const far = (m: number) => (m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m away` : `${(m / 1000).toFixed(1)} km away`);

/** One thing, in full: the answer to "where is it". With a photo this is the photo's caption. */
function thing(t: Shown): string {
  const lines = [`${t.reaction ? `${t.reaction} ` : ""}${t.what ?? "_A photo with no words._"}`];
  if (t.tags.length) lines.push(tagLine(t.tags));
  if (t.placeName || t.mapUrl) lines.push(["📍", t.placeName, t.mapUrl].filter(Boolean).join(" "));
  lines.push(`_Kept on ${t.day}${t.away !== undefined ? `, ${far(t.away)}` : ""}._`);
  return lines.join("\n");
}

/** One thing as a line in a list. */
const row = (t: Shown, n: number) => `${n}. ${t.reaction ? `${t.reaction} ` : ""}${t.what ?? "A photo with no words"}${t.tags.length ? ` ${tagLine(t.tags)}` : ""} · ${t.day}`;

export const copy = {
  // ── What the plugin says about itself ──
  welcome: msg([
    `📍 You've added *SafeButWhere*.\n\nWhen you put something away, send me a photo of the spot, a line like _${KEEP_EXAMPLE}_, or both. When you can't find it, ask: _${WHERE_EXAMPLE}_.\n\nSend _${HELP}_ for more.`,
  ]),
  help: msg([
    [
      "*SafeButWhere*",
      "",
      `Send a photo of where you put something, a line like _${KEEP_EXAMPLE}_, or both. I keep it.`,
      "",
      "Words sent right after a photo are kept with it. Send several photos and then the words, and every photo gets them.",
      `_${TAG_EXAMPLE}_ in your words is a tag.`,
      "Share your location right after, and the position is kept too.",
      "",
      `_${WHERE_EXAMPLE}_ brings it back, photo and all`,
      `_${RECENT}_ shows the last things you kept`,
      `_${TAGS}_ shows your tags`,
      `React to a photo or a line with any emoji, like ${GROUP_EXAMPLE}, and it joins that group. Send the emoji on its own to see the group. _${GROUPS}_ shows them all.`,
      `_${UNDO}_ removes the last thing you kept`,
      "Share your location on its own to see what you kept near there.",
      "",
      `Reply to a photo, a line of yours or an answer of mine with new words to change it, a _#tag_ to add one, or _${DELETE}_ to remove it.`,
      "",
      "Everything is on app.whatodo.today too.",
    ].join("\n"),
  ]),
  groupName: msg(["📍 SafeButWhere"]),
  /** The fallback when a message is nothing SafeButWhere knows. */
  unsure: msg([`I didn't get that. To keep something, say what and where: _${KEEP_EXAMPLE}_. To find it: _${WHERE_EXAMPLE}_.`]),

  // ── Keeping ──
  /** Sent once, after the very first thing is kept. `photo`: it was a photo. `worded`: it came with words. */
  firstKept: msg<{ photo: boolean; worded: boolean }>([
    ({ photo, worded }) =>
      [
        "Kept. From now on a 👍 says the same.",
        "",
        photo && !worded
          ? "Send a few words now and they go with the photo. Send several photos first, and they all get the words."
          : "A photo works too. Words sent right after one go with it, and several photos sent together all get them.",
        `_${TAG_EXAMPLE}_ in your words is a tag. Share your location now, and I keep the position as well.`,
        `React to it with any emoji, like ${GROUP_EXAMPLE}, to put it in a group.`,
        "",
        `When you can't find it, ask: _${WHERE_EXAMPLE}_.`,
      ].join("\n"),
  ]),
  /** The app holds as many things as it may. */
  full: msg<{ max: number }>([
    ({ max }) => `I'm holding ${max} things here, which is as many as I keep. Remove a few, then send this again.`,
    ({ max }) => `${max} things is my limit here, and you're at it. Remove some and send this again.`,
  ]),

  // ── Finding ──
  /** One thing, as the answer or as a photo's caption. */
  thing: msg<Shown>([thing]),
  /** After the things shown, when more matched. */
  more: msg<{ more: number }>([
    ({ more }) => `${more} more ${more === 1 ? "matches" : "match"}. Add a word and I'll narrow it down.`,
    ({ more }) => `And ${more} more. Another word will narrow it down.`,
  ]),
  nothing: msg<{ query: string }>([
    ({ query }) => `I have nothing on "${query}".`,
    ({ query }) => `Nothing kept under "${query}".`,
  ]),
  /** A few plain words that match nothing: they may have meant to keep it. */
  nothingOrKeep: msg<{ query: string }>([
    ({ query }) => `I have nothing on "${query}". To keep it, say where it is too: _${query}, top shelf_.`,
  ]),
  nothingYet: msg([`Nothing kept yet. Send a photo of where you put something, or a line like _${KEEP_EXAMPLE}_.`]),
  /** A search with no words left to look for ("where is it"). */
  findWhat: msg([`Find what? Try _${WHERE_EXAMPLE}_.`]),
  recent: msg<{ rows: Shown[]; total: number }>([
    ({ rows, total }) => `*The last ${rows.length === 1 ? "thing" : `${rows.length} things`} you kept*${total > rows.length ? ` (of ${total})` : ""}\n\n${rows.map((r, i) => row(r, i + 1)).join("\n")}`,
  ]),
  tags: msg<{ tags: { tag: string; count: number }[] }>([({ tags }) => `*Your tags*\n\n${tags.map((t) => `#${t.tag.replace(/ /g, "-")} · ${t.count}`).join("\n")}`]),
  noTags: msg([`No tags yet. Put one in your words, like _${TAG_EXAMPLE}_, or reply to a thing with one.`]),
  count: msg<{ total: number; photos: number }>([
    ({ total, photos }) => `${total} ${total === 1 ? "thing" : "things"} kept, ${photos} with a photo.`,
  ]),
  // ── Groups: the emoji they reacted with ──
  /** A group too long to send in full: its things as a list. */
  group: msg<{ emoji: string; rows: Shown[]; total: number }>([
    ({ emoji, rows, total }) => `*${emoji} · ${total} ${total === 1 ? "thing" : "things"}*\n\n${rows.map((r, i) => row({ ...r, reaction: null }, i + 1)).join("\n")}${total > rows.length ? `\n\n_${total - rows.length} more on app.whatodo.today._` : ""}`,
  ]),
  groups: msg<{ groups: { emoji: string; count: number }[] }>([({ groups }) => `*Your groups*\n\n${groups.map((g) => `${g.emoji} · ${g.count}`).join("\n")}\n\nSend an emoji on its own to see its group.`]),
  noGroups: msg([`No groups yet. React to a photo or a line of yours with any emoji, like ${GROUP_EXAMPLE}, and it joins that group.`]),
  emptyGroup: msg<{ emoji: string }>([({ emoji }) => `Nothing is in ${emoji} yet. React to a photo or a line of yours with ${emoji} and it joins.`]),
  /** Their location, shared with nothing to attach it to: what was kept near there. */
  nothingNear: msg(["Nothing kept near there.", "I have nothing kept around there."]),

  // ── Changing ──
  undone: msg<{ what: string | null }>([({ what }) => (what ? `Removed: ${what}` : "Removed the last photo.")]),
  nothingToUndo: msg(["There's nothing to remove."]),
  /** A reply to something that is no longer kept. */
  gone: msg(["That one isn't kept any more."]),
};
