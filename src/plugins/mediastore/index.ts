import { definePlugin, type Json, type Kit, type Link } from "../../sdk";
import { rank, type Searchable } from "./search";

/**
 * MediaStore: forward a link (a YouTube video or short, an Instagram reel, anything) and it is
 * kept with its title, caption and who posted it, so it can be found later by what it's about.
 *
 * Storage
 *   links   key = id                   data = Item      sort = saved (ms)
 *   urls    key = hash of canonical    data = link id   (to spot a link sent twice)
 *   groups  key = group key            data = Category  sort = created (ms)
 *   state   key = "intro"              data = 1 once the first-save note was sent
 */

export interface Item {
  url: string;
  canonical: string;
  site: string;
  kind: Link["kind"];
  /** False when telcurio couldn't read the page: only the link itself is kept. */
  found: boolean;
  title: string | null;
  description: string | null;
  author: string | null;
  /** The picture's address, never the picture. */
  image: string | null;
  seconds: number | null;
  /** The person's own words about it. */
  note: string | null;
  /** The key of the group it was saved in or moved to; null for the main one. */
  group: string | null;
  at: number;
  liked?: boolean;
  important?: boolean;
  /** The mark their reaction on the message set, so taking the reaction off clears that one. */
  reacted?: "liked" | "important" | null;
}

interface Category {
  name: string;
  created: number;
  /** Its WhatsApp group was closed. Links saved in it keep the label. */
  closed?: boolean;
}

interface LinkRef {
  kind: "link";
  ids: string[];
}

function isRef(ref: unknown): ref is LinkRef {
  const r = ref as LinkRef;
  return !!r && typeof r === "object" && r.kind === "link" && Array.isArray(r.ids) && r.ids.every((i) => typeof i === "string");
}

/** Most links one person can keep. A search reads all of them, so this keeps it quick. */
export const MAX_LINKS = 3000;
const MAX_GROUPS = 20;
/** Longest caption kept: enough to search, small enough to keep thousands. */
const KEEP_CHARS = 1500;
const NOTE_CHARS = 500;
/** Results shown for a search or a list. */
const SHOW = 5;

const plainEmoji = (e: string) => e.replace(/[︎️]/g, "").replace(/[\u{1F3FB}-\u{1F3FF}]/gu, "");
const LIKE_EMOJI = new Set(["❤", "♥", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💖", "💗", "💕", "💓", "💘", "😍", "🥰", "😻"]);
const IMPORTANT_EMOJI = new Set(["⭐", "🌟", "📌", "📍", "❗", "‼", "🚩", "🔖"]);

const HELP = [
  "*MediaStore*",
  "",
  "Send or forward a link and I keep it with its title and caption. Add a few words of your own in the same message if you like.",
  "",
  "_find pasta_ looks through everything you've saved",
  "_recent_ shows your latest links",
  "_liked_ and _important_ show the ones you marked",
  "_undo_ removes the last link you saved",
  "",
  "On a link you sent: react ❤️ to like it or ⭐ to mark it important. Reply to it with words to add a note, or with _delete_ to remove it.",
  "",
  "_new group recipes_ makes a WhatsApp group just for one kind of link",
  "_groups_ lists them, _close group recipes_ stops one",
  "",
  "Everything is on app.whatodo.today too, with pictures and filters.",
].join("\n");

/** "My Recipes!" -> "my-recipes" */
export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/, "");
}

/** A short, steady key for a link's address (addresses can be too long to be keys). */
export function hash(text: string): string {
  let a = 5381;
  let b = 52711;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = (a * 33) ^ c;
    b = (b * 33) ^ c;
  }
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}${text.length.toString(36)}`;
}

const clip = (s: string | null, n: number) => (s === null ? null : s.length > n ? `${s.slice(0, n - 1)}…` : s);

async function all(kit: Kit, group: string | null = null): Promise<{ id: string; item: Item }[]> {
  const rows = (await kit.store.list<Item>("links")).map((r) => ({ id: r.key, item: r.data }));
  return group ? rows.filter((r) => r.item.group === group) : rows;
}

async function save(kit: Kit, id: string, item: Item) {
  await kit.store.put("links", id, item as unknown as Json, item.at);
}

async function remove(kit: Kit, id: string) {
  const item = await kit.store.get<Item>("links", id);
  if (!item) return;
  const key = hash(item.canonical);
  if ((await kit.store.get<string>("urls", key)) === id) await kit.store.delete("urls", key);
  await kit.store.delete("links", id);
}

async function groupName(kit: Kit, key: string | null): Promise<string | null> {
  return key ? ((await kit.store.get<Category>("groups", key))?.name ?? key) : null;
}

/** What a link is, in a few words: "YouTube short", "Instagram reel", "example.com". */
function what(item: Item): string {
  return item.kind === "page" ? item.site : `${item.site} ${item.kind}`;
}

function heading(item: Item): string {
  const first = item.title ?? item.note ?? item.description;
  return first ? clip(first.replace(/\s+/g, " ").trim(), 80)! : item.url;
}

function line(item: Item, n?: number): string {
  const marks = `${item.important ? "⭐ " : ""}${item.liked ? "❤️ " : ""}`;
  const by = [item.author, what(item)].filter(Boolean).join(" · ");
  const out = [`${n ? `${n}. ` : ""}${marks}*${heading(item)}*`, by];
  if (item.note && item.title) out.push(`_${clip(item.note.replace(/\s+/g, " "), 120)}_`);
  out.push(item.url);
  return out.join("\n");
}

function show(kit: Kit, title: string, rows: { id: string; item: Item }[], total: number) {
  const shown = rows.slice(0, SHOW);
  const more = total > shown.length ? `\n\n_${total - shown.length} more on app.whatodo.today._` : "";
  const text = `${title}\n\n${shown.map((r, i) => line(r.item, shown.length > 1 ? i + 1 : undefined)).join("\n\n")}${more}`;
  // One result: reacting or replying to this message works like on the link itself.
  const ref: LinkRef | null = shown.length === 1 ? { kind: "link", ids: [shown[0].id] } : null;
  kit.send(text.slice(0, 3900), ref ? { ref: ref as unknown as Json } : undefined);
}

async function searchable(kit: Kit, rows: { id: string; item: Item }[]): Promise<({ id: string; item: Item } & Searchable)[]> {
  const names = new Map<string, string>();
  for (const g of await kit.store.list<Category>("groups")) names.set(g.key, g.data.name);
  return rows.map((r) => ({
    ...r,
    at: r.item.at,
    note: r.item.note,
    title: r.item.title,
    author: r.item.author,
    where: `${r.item.site} ${r.item.kind} ${r.item.group ? (names.get(r.item.group) ?? r.item.group) : ""}`,
    description: r.item.description,
  }));
}

async function search(kit: Kit, query: string, group: string | null) {
  const q = query.replace(/\s+/g, " ").trim();
  const rows = await all(kit, group);
  if (!rows.length) return kit.send("Nothing is saved yet. Send or forward a link and I'll keep it.");
  const found = rank(await searchable(kit, rows), q);
  if (!found.length) return kit.send(`Nothing saved matches "${clip(q, 60)}". Send _recent_ to see your latest links.`);
  show(kit, `🔎 *${clip(q, 60)}*: ${found.length} found`, found, found.length);
}

async function list(kit: Kit, group: string | null, which: "recent" | "liked" | "important") {
  let rows = (await all(kit, group)).reverse();
  if (which === "liked") rows = rows.filter((r) => r.item.liked);
  if (which === "important") rows = rows.filter((r) => r.item.important);
  if (!rows.length) {
    if (which === "liked") return kit.send("You haven't liked any yet. React ❤️ to a link you sent.");
    if (which === "important") return kit.send("Nothing is marked important yet. React ⭐ to a link you sent.");
    return kit.send("Nothing is saved yet. Send or forward a link and I'll keep it.");
  }
  const title = which === "liked" ? "❤️ *Liked*" : which === "important" ? "⭐ *Important*" : "🎬 *Latest*";
  show(kit, title, rows, rows.length);
}

async function createGroup(kit: Kit, name: string): Promise<{ key: string; name: string } | { error: string }> {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 20);
  const key = slug(clean);
  if (!key) return { error: "Give the group a name, like _new group recipes_." };
  const existing = await kit.store.get<Category>("groups", key);
  if (existing && !existing.closed) return { error: `You already have a group called *${existing.name}*.` };
  const open = (await kit.store.list<Category>("groups")).filter((g) => !g.data.closed);
  if (!existing && open.length >= MAX_GROUPS) return { error: `That's the most groups I can keep (${MAX_GROUPS}). Close one first.` };
  const category: Category = { name: existing?.name ?? clean, created: existing?.created ?? kit.now };
  await kit.groups.open(key, {
    name: `🎬 ${category.name}`.slice(0, 25),
    hello: `🎬 This group is for your *${category.name}* links. Send or forward a link here and I'll keep it under ${category.name}.\n\n_find_ and _recent_ here look only through this group's links.`,
  });
  await kit.store.put("groups", key, category as unknown as Json, category.created);
  return { key, name: category.name };
}

async function closeGroup(kit: Kit, key: string): Promise<Category | null> {
  const category = await kit.store.get<Category>("groups", key);
  if (!category || category.closed) return null;
  await kit.groups.close(key);
  await kit.store.put("groups", key, { ...category, closed: true } as unknown as Json, category.created);
  return category;
}

async function groupsText(kit: Kit): Promise<string> {
  const groups = (await kit.store.list<Category>("groups")).filter((g) => !g.data.closed);
  if (!groups.length) return "No groups yet. Send _new group recipes_ to make one for one kind of link.";
  const rows = await all(kit);
  const lines = ["*Your groups*", ""];
  for (const g of groups) {
    const n = rows.filter((r) => r.item.group === g.key).length;
    lines.push(`*${g.data.name}*: ${n} link${n === 1 ? "" : "s"}`);
  }
  return lines.join("\n");
}

/** Keep the links of one message. Returns the ids, in order. */
async function keep(kit: Kit, links: Link[], note: string | null, group: string | null): Promise<string[] | "full"> {
  const ids: string[] = [];
  let count = -1;
  for (const l of links) {
    const key = hash(l.canonical);
    const oldId = await kit.store.get<string>("urls", key);
    const old = oldId ? await kit.store.get<Item>("links", oldId) : null;
    if (oldId && old && old.canonical === l.canonical) {
      // Sent again: one copy stays. A new note replaces the old, and fresh details replace stale ones.
      const fresh = l.found
        ? { found: true, title: l.title, description: clip(l.description, KEEP_CHARS), author: l.author, image: l.image, seconds: l.seconds, site: l.site, kind: l.kind }
        : {};
      await save(kit, oldId, { ...old, ...fresh, note: note ?? old.note, group: group ?? old.group });
      if (!ids.includes(oldId)) ids.push(oldId);
      continue;
    }
    if (count < 0) count = (await kit.store.list("links")).length;
    if (count >= MAX_LINKS) return "full";
    const id = `${kit.now.toString(36)}${kit.id().slice(0, 4)}`;
    const item: Item = {
      url: l.url,
      canonical: l.canonical,
      site: l.site,
      kind: l.kind,
      found: l.found,
      title: l.title,
      description: clip(l.description, KEEP_CHARS),
      author: l.author,
      image: l.image,
      seconds: l.seconds,
      note,
      group,
      at: kit.now + ids.length,
    };
    await save(kit, id, item);
    await kit.store.put("urls", key, id);
    ids.push(id);
    count++;
  }
  return ids;
}

/** What they wrote besides the links. */
function ownWords(text: string): string | null {
  const rest = text
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return rest.length > 1 ? rest.slice(0, NOTE_CHARS) : null;
}

/** Run one of the plain commands. Returns false when `lower` isn't one. */
async function command(kit: Kit, text: string, lower: string, here: string | null): Promise<boolean> {
  let m = text.match(/^(?:find|search|look\s*up|look for|show me)\s+(.+)$/i);
  if (m) {
    await search(kit, m[1], here);
    return true;
  }
  if (/^(recent|latest|list|links|my links|all|last)$/.test(lower)) {
    await list(kit, here, "recent");
    return true;
  }
  if (/^(liked?s?|loved|favou?rites?|hearts?)$/.test(lower)) {
    await list(kit, here, "liked");
    return true;
  }
  if (/^(important|starred|stars?|pinned)$/.test(lower)) {
    await list(kit, here, "important");
    return true;
  }
  if (/^(groups|my groups|categories|folders)$/.test(lower)) {
    kit.send(await groupsText(kit));
    return true;
  }
  m = text.match(/^(?:new|add|create|make)\s+(?:a\s+)?(?:group|category|folder)\s+(?:(?:for|called|named)\s+)?(.+)$/i);
  if (m) {
    const made = await createGroup(kit, m[1]);
    kit.send("error" in made ? made.error : `🎬 I'm making a WhatsApp group for *${made.name}*. Send its links there once it appears.`);
    return true;
  }
  m = lower.match(/^(?:close|remove|delete|stop)\s+(?:the\s+)?(?:group|category|folder)(?:\s+(.+))?$/);
  if (m && (m[1] || here)) {
    const key = m[1] ? slug(m[1]) : here!;
    const closed = await closeGroup(kit, key);
    kit.send(closed ? `*${closed.name}* is closed. Its links are still saved.` : `I don't have a group called "${m[1] ?? key}". Send _groups_ to see yours.`);
    return true;
  }
  if (/^(undo|delete last|remove last|oops)$/.test(lower)) {
    const last = (await all(kit, here)).at(-1);
    if (!last) kit.send("Nothing is saved yet.");
    else {
      await remove(kit, last.id);
      kit.send(`Removed *${heading(last.item)}*.`);
    }
    return true;
  }
  if (/^(count|stats|how many)$/.test(lower)) {
    const rows = await all(kit, here);
    const by = new Map<string, number>();
    for (const r of rows) by.set(r.item.site, (by.get(r.item.site) ?? 0) + 1);
    const parts = [...by].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([site, n]) => `${n} ${site}`);
    kit.send(rows.length ? `You have ${rows.length} link${rows.length === 1 ? "" : "s"} saved: ${parts.join(", ")}.` : "Nothing is saved yet.");
    return true;
  }
  return false;
}

/** A reply to a saved link: a word that changes it, or a note about it. */
async function onReply(kit: Kit, ids: string[], text: string, lower: string) {
  const rows: { id: string; item: Item }[] = [];
  for (const id of ids) {
    const item = await kit.store.get<Item>("links", id);
    if (item) rows.push({ id, item });
  }
  if (!rows.length) return kit.send("That link isn't saved any more.");
  const each = async (change: (item: Item) => Item) => {
    for (const r of rows) await save(kit, r.id, change(r.item));
    kit.react("👍");
  };
  if (/^(delete|remove|forget)(\s+(it|this|that))?$/.test(lower)) {
    for (const r of rows) await remove(kit, r.id);
    return kit.react("👍");
  }
  if (/^(like|love|fav|favou?rite|heart)$/.test(lower)) return each((i) => ({ ...i, liked: true }));
  if (/^(unlike|not liked|unfavou?rite)$/.test(lower)) return each((i) => ({ ...i, liked: false, reacted: i.reacted === "liked" ? null : i.reacted }));
  if (/^(important|star|pin|mark important)$/.test(lower)) return each((i) => ({ ...i, important: true }));
  if (/^(not important|unimportant|unstar|unpin)$/.test(lower)) return each((i) => ({ ...i, important: false, reacted: i.reacted === "important" ? null : i.reacted }));
  if (/^(no note|remove note|clear note)$/.test(lower)) return each((i) => ({ ...i, note: null }));
  const move = lower.match(/^(?:move|put)(?:\s+(?:it|this))?\s+(?:to|in|into|under)\s+(.+)$/);
  if (move) {
    const main = /^(main|none|no group|mediastore)$/.test(move[1]);
    const key = main ? null : slug(move[1]);
    const category = key ? await kit.store.get<Category>("groups", key) : null;
    if (key && !category) return kit.send(`I don't have a group called "${move[1]}". Send _new group ${move[1]}_ to make it.`);
    return each((i) => ({ ...i, group: key }));
  }
  // Anything else is their own note about it.
  return each((i) => ({ ...i, note: text.slice(0, NOTE_CHARS) }));
}

export default definePlugin({
  id: "mediastore",
  version: "1.0.0",
  sdk: "1",
  name: "MediaStore",
  icon: "🎬",
  tagline: "Forward reels and videos. Find them again by what they're about.",
  description:
    "Forward a YouTube video, a short or an Instagram reel to its WhatsApp group and it is kept with its title, caption and who posted it. Later, send a few words and get the link back. Like a link with ❤️, mark it important with ⭐, and add notes of your own.",
  groupName: "🎬 MediaStore",
  price: 0,
  tier: 2,
  unlisted: true,
  permissions: ["links", "groups"],
  listing: {
    title: "Save Reels and Videos on WhatsApp, Find Later | telcurio",
    description: "Forward Instagram reels and YouTube videos to a WhatsApp chat. Their titles and captions are kept, so you can find any of them later with a few words.",
    h1: "Save reels and videos on WhatsApp",
  },
  welcome:
    "🎬 You've added *MediaStore*.\n\nSend or forward a link here: a YouTube video, a short, an Instagram reel. I'll keep it so you can find it later.\n\nSend _help_ for more.",
  help: HELP,

  async onMessage(event, kit) {
    const text = event.text.trim().replace(/\s+/g, " ");
    const lower = text.toLowerCase().replace(/[!.?]+$/, "");
    const here = event.group ?? null;

    // A message with links: keep them. Anything else they wrote in it is their note.
    if (event.links?.length) {
      const ids = await keep(kit, event.links, ownWords(event.text), here);
      if (ids === "full") return kit.send(`That's the most links I can keep (${MAX_LINKS}). Delete some on app.whatodo.today first.`);
      const ref: LinkRef = { kind: "link", ids };
      kit.mark(ref as unknown as Json);
      kit.react("👍");
      if (!(await kit.store.get("state", "intro"))) {
        await kit.store.put("state", "intro", 1);
        const read = event.links.some((l) => l.found);
        kit.send(
          [
            read
              ? "🎬 Saved. I've kept its title and caption too, so next time it's easier to find: send _find_ and a few words about it."
              : "🎬 Saved. I couldn't read this one's title or caption, so add a few words of your own by replying to your link. For most links I keep the title and caption, and you can find them with _find_ and a few words.",
            "",
            "On your link: react ❤️ to like it or ⭐ to mark it important, or reply to it with a note of your own.",
            "From now on you'll just get a 👍.",
          ].join("\n"),
        );
      }
      return;
    }

    if (isRef(event.quotedRef) && text) return onReply(kit, event.quotedRef.ids, text, lower);

    if (await command(kit, text, lower, here)) return;
    kit.unsure("I didn't get that. Send a link to save it, or _find_ and a few words to look for one. Send _help_ for more.");
  },

  async onReaction(event, kit) {
    if (!isRef(event.ref)) return;
    const emoji = event.emoji ? plainEmoji(event.emoji) : null;
    // Their reaction on a link is its mark: ❤️ liked, ⭐ important. Changing or removing the
    // reaction takes back the mark it set (a mark set in words or on the page stays).
    const now = emoji && LIKE_EMOJI.has(emoji) ? "liked" : emoji && IMPORTANT_EMOJI.has(emoji) ? "important" : null;
    for (const id of event.ref.ids) {
      const item = await kit.store.get<Item>("links", id);
      if (!item) continue;
      const next: Item = { ...item };
      if (item.reacted && item.reacted !== now) next[item.reacted] = false;
      if (now) next[now] = true;
      next.reacted = now;
      await save(kit, id, next);
    }
  },

  understand: {
    intents: {
      search: "Find a link they saved earlier, by what it was about, who posted it or where it was from",
      recent: "See the latest links they saved",
      liked: "See the links they liked",
      important: "See the links they marked important",
      groups: "See the groups they made for different kinds of links",
      new_group: "Make a new group for one kind of link, like recipes or workouts",
      undo: "Remove the last link they saved",
      help: "Ask how this works or what they can say",
    },
  },

  async onIntent(event, kit) {
    switch (event.intent) {
      case "search":
        return search(kit, event.text, null);
      case "recent":
      case "liked":
      case "important":
        return list(kit, null, event.intent);
      case "groups":
        return kit.send(await groupsText(kit));
      case "new_group": {
        const m = event.text.match(/(?:group|category|folder)\s+(?:(?:for|called|named)\s+)?(?:my\s+)?(.+)$/i);
        if (!m) return kit.send("What should it be called? Send _new group recipes_.");
        const made = await createGroup(kit, m[1].replace(/[.!?]+$/, ""));
        return kit.send("error" in made ? made.error : `🎬 I'm making a WhatsApp group for *${made.name}*. Send its links there once it appears.`);
      }
      case "undo": {
        await command(kit, "undo", "undo", null);
        return;
      }
      default:
        return kit.send(HELP);
    }
  },

  web: {
    lockable: true,
    async load(kit, args) {
      const limit = Math.min(Math.max(Number(args.limit ?? 600) || 600, 1), 1000);
      const rows = (await all(kit)).reverse();
      const groups = await kit.store.list<Category>("groups");
      return {
        total: rows.length,
        max: MAX_LINKS,
        links: rows.slice(0, limit).map((r) => ({
          id: r.id,
          url: r.item.url,
          site: r.item.site,
          kind: r.item.kind,
          found: r.item.found,
          title: r.item.title,
          description: clip(r.item.description, 400),
          author: r.item.author,
          image: r.item.image,
          seconds: r.item.seconds,
          note: r.item.note,
          group: r.item.group,
          at: r.item.at,
          liked: !!r.item.liked,
          important: !!r.item.important,
        })),
        groups: groups.map((g) => ({ key: g.key, name: g.data.name, closed: !!g.data.closed, count: rows.filter((r) => r.item.group === g.key).length })),
      } as unknown as Json;
    },
    actions: {
      async setLiked(kit, { id, on }) {
        const item = await kit.store.get<Item>("links", String(id));
        if (item) await save(kit, String(id), { ...item, liked: !!on, reacted: !on && item.reacted === "liked" ? null : (item.reacted ?? null) });
      },
      async setImportant(kit, { id, on }) {
        const item = await kit.store.get<Item>("links", String(id));
        if (item) await save(kit, String(id), { ...item, important: !!on, reacted: !on && item.reacted === "important" ? null : (item.reacted ?? null) });
      },
      async setNote(kit, { id, note }) {
        const item = await kit.store.get<Item>("links", String(id));
        const clean = String(note ?? "").trim().slice(0, NOTE_CHARS);
        if (item) await save(kit, String(id), { ...item, note: clean || null });
      },
      /** Put a link under a group, or back in the main one (`group: null`). */
      async move(kit, { id, group }) {
        const item = await kit.store.get<Item>("links", String(id));
        if (!item) return;
        const key = group === null || group === undefined || group === "" ? null : String(group);
        if (key && !(await kit.store.get<Category>("groups", key))) throw new Error("That group doesn't exist.");
        await save(kit, String(id), { ...item, group: key });
      },
      async remove(kit, { id }) {
        await remove(kit, String(id));
      },
      async createGroup(kit, { name }) {
        const made = await createGroup(kit, String(name ?? ""));
        if ("error" in made) throw new Error(made.error.replace(/[_*]/g, ""));
        return made;
      },
      async closeGroup(kit, { key }) {
        await closeGroup(kit, String(key));
      },
    },
  },
});
