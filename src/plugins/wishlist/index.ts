import { definePlugin, type Json, type Kit, type Link, type Sender, type SharedItem, type SharedPage } from "../../sdk";
import { copy, DELETE_NO, DELETE_YES, DONE, FIRST_LIST, SAVED, STAY, TICK, type Row } from "./copy";
import { currencyOf, guessCurrency, money, readPrice, readTags, slug, total } from "./money";

/**
 * Wishlist: send a link to something you want (or type it with its price) and it is kept on a
 * list with its name, picture and price. Lists add up, things get ticked off once bought, and
 * a list can be shared as a page anyone with the link can open.
 *
 * A list is a list. Each one lives in a WhatsApp group: the main one, a group made for it, or a
 * group the person already had. One group can hold several lists; a link sent there goes to the
 * list named in the message, else to the list used last in that group.
 *
 * Storage
 *   lists   key = list id               data = List   sort = created (ms)
 *   items   key = item id               data = Item   sort = added (ms)
 *   groups  key = group key             data = Home   sort = created (ms)
 *   state   key = "last:<group>"        data = the id of the list used last there ("" is the main group)
 *           key = "intro" | "shared"    data = 1 once that one-time note was sent
 */

export interface List {
  name: string;
  /** The key of the group it lives in; null for the main one. */
  home: string | null;
  created: number;
  /** Show each thing's note on the shared page. Off unless the person turns it on. */
  notes?: boolean;
}

/** A WhatsApp group besides the main one that holds lists. */
interface Home {
  name: string;
  created: number;
  /** Wishlist made the group (for a list). False: the person already had it and handed it over. */
  made: boolean;
}

export interface Item {
  list: string;
  /** What the person called it. Null: the link's own title stands in. */
  name: string | null;
  url: string | null;
  canonical: string | null;
  site: string | null;
  /** The page's title, when Zelfred could read it. */
  title: string | null;
  /** The picture's address, never the picture. */
  image: string | null;
  price: number | null;
  /** Null: the person's own currency. */
  currency: string | null;
  /** The person gave the price themselves, so a price read from the page never replaces it. */
  typed?: boolean;
  bought: boolean;
  boughtAt?: number | null;
  /** Their ✅ on the message set `bought`, so taking the reaction off clears it. */
  reacted?: boolean;
  /** The things that came in the same WhatsApp message, this one included. Unset: it came alone. Since 1.3.0. */
  msg?: string[];
  /**
   * The reaction the person who added Wishlist last left on it, other than a "bought" one: ❤️,
   * ⭐, 🔥, whatever they use. Theirs to give meaning to; the page can group by it.
   */
  mark?: string | null;
  note: string | null;
  tags: string[];
  at: number;
  /** Who added it. */
  by?: { id: string; name: string | null; owner: boolean };
  /** Added on the page with a link Zelfred is still reading. */
  reading?: boolean;
}

interface ItemRef {
  kind: "item";
  ids: string[];
}
const isItemRef = (ref: unknown): ref is ItemRef => {
  const r = ref as ItemRef;
  return !!r && typeof r === "object" && r.kind === "item" && Array.isArray(r.ids) && r.ids.every((i) => typeof i === "string");
};

interface MoveRef {
  move: string[];
  /** Only the person who asked decides. */
  by: string;
}
const isMoveRef = (r: unknown): r is MoveRef => !!r && typeof r === "object" && Array.isArray((r as MoveRef).move) && typeof (r as MoveRef).by === "string";

interface DeleteRef {
  del: string;
  by: string;
}
const isDeleteRef = (r: unknown): r is DeleteRef => !!r && typeof r === "object" && typeof (r as DeleteRef).del === "string" && typeof (r as DeleteRef).by === "string";

/** Most things one person can keep, and most on one list. A page load reads all of them. */
export const MAX_ITEMS = 2000;
export const MAX_LIST_ITEMS = 500;
export const MAX_LISTS = 50;
const NAME_CHARS = 200;
const NOTE_CHARS = 500;
const LIST_NAME_CHARS = 30;
/** Things shown in one message. */
const SHOW = 10;
/** The id of the list every wishlist starts with. */
const FIRST_ID = "main";

const plainEmoji = (e: string) => e.replace(/[︎️]/g, "");
/** A 👍 counts like a ✅ since 1.3.0. Skin tones are taken off before the lookup. */
const BOUGHT_EMOJI = new Set(["✅", "☑", "✔", "👍", "🛒", "🛍"]);
const bareEmoji = (e: string) => plainEmoji(e).replace(/[\u{1F3FB}-\u{1F3FF}]/gu, "");

type ListRow = { id: string; list: List };
type ItemRow = { id: string; item: Item };

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const tidy = (s: string) => s.trim().replace(/\s+/g, " ");
const strip = (s: string) => s.replace(/[_*]/g, "");

/** The currency the person counts in: the one they set, else a guess from their clock. */
const own = (kit: Kit) => (typeof kit.settings.currency === "string" && kit.settings.currency ? kit.settings.currency : guessCurrency(kit.person.timezone));

/** Every list, oldest first. Before anything is stored there is still the first list. */
async function allLists(kit: Kit): Promise<ListRow[]> {
  const rows = (await kit.store.list<List>("lists")).map((r) => ({ id: r.key, list: r.data }));
  return rows.length ? rows : [{ id: FIRST_ID, list: { name: FIRST_LIST, home: null, created: 0 } }];
}

/** Store the first list, if nothing is stored yet. Called before anything is written. */
async function ensure(kit: Kit) {
  if (!(await kit.store.list("lists", { limit: 1 })).length) await kit.store.put("lists", FIRST_ID, { name: FIRST_LIST, home: null, created: 0 }, 0);
}

const putList = (kit: Kit, row: ListRow) => kit.store.put("lists", row.id, row.list as unknown as Json, row.list.created);
const putItem = (kit: Kit, id: string, item: Item) => kit.store.put("items", id, item as unknown as Json, item.at);

async function allItems(kit: Kit, list?: string): Promise<ItemRow[]> {
  const rows = (await kit.store.list<Item>("items")).map((r) => ({ id: r.key, item: r.data }));
  return list ? rows.filter((r) => r.item.list === list) : rows;
}

/** The lists that live in one group, oldest first. */
const livingIn = (lists: ListRow[], here: string | null) => lists.filter((l) => (l.list.home ?? null) === here);
/** The list a group started with. A group that holds none falls back to the very first list. */
const firstOf = (lists: ListRow[], here: string | null) => livingIn(lists, here)[0] ?? lists[0];

/** The list a link on its own goes to in this group: the one used last there, else the group's first. */
async function current(kit: Kit, lists: ListRow[], here: string | null): Promise<ListRow> {
  const last = await kit.store.get<string>("state", `last:${here ?? ""}`);
  return lists.find((l) => l.id === last) ?? firstOf(lists, here);
}

const use = (kit: Kit, here: string | null, id: string) => kit.store.put("state", `last:${here ?? ""}`, id);

/** A list by what the person called it. One in this group wins over one of the same name elsewhere. */
function findList(lists: ListRow[], said: string, here: string | null): ListRow | null {
  const s = slug(said.replace(/\s+list$/i, ""));
  if (!s) return null;
  const same = lists.filter((l) => slug(l.list.name) === s);
  return same.find((l) => (l.list.home ?? null) === here) ?? same[0] ?? null;
}

/**
 * Which list a message is for, from its words. "diwali" before the rest (or "diwali:"), or
 * "in diwali" / "for diwali" after it, names a list. `typed`: the words are the thing itself,
 * so a leading name only counts with a colon ("gifts: scarf 800"), since "gifts for mom" may
 * well be what they want.
 */
function named(lists: ListRow[], words: string, here: string | null, typed: boolean): { row: ListRow; rest: string } | null {
  const lower = words.toLowerCase();
  // Longest names first, so "diwali gifts" isn't taken for "diwali". This group's lists first.
  const order = [...lists].sort((a, b) => Number((b.list.home ?? null) === here) - Number((a.list.home ?? null) === here) || b.list.name.length - a.list.name.length);
  for (const row of order) {
    const n = row.list.name.toLowerCase();
    if (lower.startsWith(`${n}:`)) return { row, rest: words.slice(n.length + 1).trim() };
    if (!typed && (lower === n || lower.startsWith(`${n} `))) return { row, rest: words.slice(n.length).trim() };
  }
  // "... in diwali", "... for the diwali list": every in/to/on/for is tried, since the words before it may hold one too.
  for (const m of words.matchAll(/(?:^|\s)(?:in|to|on|for)\s+(?:my\s+|the\s+)?/gi)) {
    const row = findList(lists, words.slice(m.index + m[0].length), here);
    if (row) return { row, rest: words.slice(0, m.index).trim() };
  }
  return null;
}

/** What a thing is called: their name for it, else the page's title, else its address. */
const label = (item: Item) => clip(tidy(item.name ?? item.title ?? item.url ?? "Something"), 80);
const priceOf = (kit: Kit, item: Item) => (item.price === null ? null : money(item.price, item.currency ?? own(kit)));

function row(kit: Kit, item: Item): Row {
  const detail = [item.site, ...item.tags.map((t) => `#${t}`)].filter(Boolean).join(" · ");
  return { name: label(item), price: priceOf(kit, item), detail: detail || null, url: item.url, bought: item.bought, mark: item.mark ?? null };
}

/** A group's key from a name: plain letters and digits, and never one that is taken. */
async function groupKey(kit: Kit, name: string): Promise<string> {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/, "") || "list";
  let key = base;
  for (let n = 2; await kit.store.get("groups", key); n++) key = `${base.slice(0, 27)}-${n}`;
  return key;
}

/** Start a list: in the group it was asked for in, or (`group`) with a WhatsApp group of its own. */
async function createList(kit: Kit, said: string, here: string | null, group: boolean): Promise<ListRow | { error: string }> {
  await ensure(kit);
  const name = tidy(said).replace(/[*_~`]/g, "").slice(0, LIST_NAME_CHARS).trim();
  if (!slug(name)) return { error: copy.listNeedsName() };
  const lists = await allLists(kit);
  const taken = lists.find((l) => slug(l.list.name) === slug(name));
  if (taken) return { error: copy.listExists({ name: taken.list.name }) };
  if (lists.length >= MAX_LISTS) return { error: copy.tooManyLists({ max: MAX_LISTS }) };
  let home = here;
  if (group) {
    home = await groupKey(kit, name);
    await kit.groups.open(home, { name: copy.groupTitle({ name }).slice(0, 25), hello: copy.groupHello({ name }) });
    await kit.store.put("groups", home, { name, created: kit.now, made: true } satisfies Home as unknown as Json, kit.now);
  }
  const made: ListRow = { id: kit.id().toLowerCase().slice(0, 10), list: { name, home, created: kit.now } };
  await putList(kit, made);
  await use(kit, home, made.id);
  return made;
}

/** Delete a list and everything on it. Its share link closes, and a group made for it closes when nothing else lives there. */
async function deleteList(kit: Kit, id: string): Promise<{ list: List; closed: string | null } | null> {
  const list = await kit.store.get<List>("lists", id);
  if (!list) return null;
  for (const r of await allItems(kit, id)) await kit.store.delete("items", r.id);
  await kit.share.remove(id);
  await kit.store.delete("lists", id);
  const home = list.home ?? null;
  let closed: string | null = null;
  if (home && !livingIn(await allLists(kit), home).length && (await kit.store.get<Home>("groups", home))) {
    // Made by Wishlist: the chat is closed. Handed over by the person: I only stop listening there.
    await kit.groups.close(home);
    await kit.store.delete("groups", home);
    closed = home;
  }
  return { list, closed };
}

/** What they wrote besides the links. */
function ownWords(text: string): string {
  return tidy(text.replace(/https?:\/\/\S+/gi, " "));
}

interface Details {
  row: ListRow;
  /** The list was named in the message. */
  wasNamed: boolean;
  words: string;
  price: number | null;
  currency: string | null;
  tags: string[];
}

/** Everything a message's words say: which list, the price, the labels, and what is left. */
async function read(kit: Kit, lists: ListRow[], text: string, here: string | null, typed: boolean): Promise<Details> {
  const { tags, rest } = readTags(text);
  let words = rest;
  let pick = named(lists, words, here, typed);
  if (pick) words = pick.rest;
  // With a link, a number on its own is its price. Typed, a number on its own names nothing.
  const priced = (typed ? null : readPrice(words, true)) ?? readPrice(words);
  if (priced) {
    words = priced.rest;
    // "socks for diwali 300": the list's name only shows once the price is out of the way.
    if (!pick) {
      pick = named(lists, words, here, typed);
      if (pick) words = pick.rest;
    }
  }
  return { row: pick?.row ?? (await current(kit, lists, here)), wasNamed: !!pick, words: tidy(words), price: priced?.price ?? null, currency: priced?.currency ?? null, tags };
}

const byOf = (sender: Sender | undefined) => (sender ? { by: { id: sender.id, name: sender.name, owner: sender.owner } } : {});

/** Room for `n` more on this list? Says why not when there isn't. */
async function room(kit: Kit, target: ListRow, n: number): Promise<string | null> {
  const items = await allItems(kit);
  if (items.length + n > MAX_ITEMS) return copy.tooMany({ max: MAX_ITEMS });
  if (items.filter((r) => r.item.list === target.id).length + n > MAX_LIST_ITEMS) return copy.listFull({ name: target.list.name, max: MAX_LIST_ITEMS });
  return null;
}

/**
 * A thing was marked bought, or not, on the page: show it on its WhatsApp message too. The
 * message gets my ✅ once everything that came in it is bought, and my 👍 back otherwise. A
 * thing added on the page has no message, and then nothing happens.
 */
async function showOn(kit: Kit, id: string, item: Item) {
  const ids = item.msg?.length ? item.msg : [id];
  let all = item.bought;
  for (const other of ids) {
    if (other === id) continue;
    const it = await kit.store.get<Item>("items", other);
    if (it && !it.bought) all = false;
  }
  kit.reactTo({ kind: "item", ids } satisfies ItemRef as unknown as Json, all ? TICK : SAVED);
}

/** After something was added from WhatsApp: the tick, the one-time note, and which list when that isn't obvious. */
async function added(kit: Kit, lists: ListRow[], d: Details, ids: string[], here: string | null, priced: boolean) {
  kit.mark({ kind: "item", ids } satisfies ItemRef as unknown as Json);
  kit.react(SAVED);
  // Several things in one message: each remembers the others, to find the message again (showOn).
  if (ids.length > 1) {
    for (const id of ids) {
      const item = await kit.store.get<Item>("items", id);
      if (item) await kit.store.put("items", id, { ...item, msg: ids } as unknown as Json);
    }
  }
  // Naming a list that lives here makes it the one bare links go to next.
  if ((d.row.list.home ?? null) === here) await use(kit, here, d.row.id);
  if (!(await kit.store.get("state", "intro"))) {
    await kit.store.put("state", "intro", 1);
    return kit.send(copy.firstSave({ priced }));
  }
  if (!d.wasNamed && d.row.id !== firstOf(lists, here).id) kit.send(copy.addedTo({ name: d.row.list.name }));
}

/** Keep the links of one message as things on a list. */
async function addLinks(kit: Kit, links: Link[], text: string, here: string | null, sender: Sender | undefined) {
  await ensure(kit);
  const lists = await allLists(kit);
  const d = await read(kit, lists, ownWords(text), here, false);
  const onList = await allItems(kit, d.row.id);
  const fresh = links.filter((l) => !onList.some((r) => r.item.canonical === l.canonical));
  const full = fresh.length ? await room(kit, d.row, fresh.length) : null;
  if (full) return kit.send(full);
  const ids: string[] = [];
  let priced = false;
  for (const l of links) {
    const same = onList.find((r) => r.item.canonical === l.canonical);
    // Their own words name a link whose page gave no title; under a title they are a note.
    const words = d.words ? d.words.slice(0, NOTE_CHARS) : null;
    const price = d.price ?? l.price ?? null;
    const currency = d.price !== null ? d.currency : (l.currency ?? null);
    if (same) {
      // Sent again to the same list: one copy stays. New words, labels or a typed price replace the old.
      const next: Item = { ...same.item, title: l.found ? l.title : same.item.title, image: l.image ?? same.item.image, site: l.site };
      if (words) Object.assign(next, next.title ? { note: words } : { name: words.slice(0, NAME_CHARS) });
      if (d.tags.length) next.tags = d.tags;
      if (d.price !== null) Object.assign(next, { price: d.price, currency: d.currency, typed: true });
      else if (!same.item.typed && l.price != null) Object.assign(next, { price: l.price, currency: l.currency ?? null });
      await putItem(kit, same.id, next);
      if (!ids.includes(same.id)) ids.push(same.id);
      priced ||= next.price !== null;
      continue;
    }
    const id = `${kit.now.toString(36)}${kit.id().slice(0, 4)}`;
    const title = l.found ? l.title : null;
    await putItem(kit, id, {
      list: d.row.id,
      name: words && !title ? words.slice(0, NAME_CHARS) : null,
      url: l.url,
      canonical: l.canonical,
      site: l.site,
      title,
      image: l.image,
      price,
      currency,
      ...(d.price !== null ? { typed: true } : {}),
      bought: false,
      note: words && title ? words : null,
      tags: d.tags,
      at: kit.now + ids.length,
      ...byOf(sender),
    });
    ids.push(id);
    priced ||= price !== null;
  }
  await added(kit, lists, d, ids, here, priced);
}

/**
 * Something typed without a link: "running shoes 4000". Returns false when the words leave
 * nothing to call it, or (`mustPrice`) when they hold no price, so it may be something else.
 */
async function addTyped(kit: Kit, text: string, here: string | null, sender: Sender | undefined, mustPrice = false): Promise<boolean> {
  const lists = await allLists(kit);
  const d = await read(kit, lists, text, here, true);
  if (!d.words || (mustPrice && d.price === null)) return false;
  await ensure(kit);
  const full = await room(kit, d.row, 1);
  if (full) {
    kit.send(full);
    return true;
  }
  const id = `${kit.now.toString(36)}${kit.id().slice(0, 4)}`;
  await putItem(kit, id, {
    list: d.row.id,
    name: d.words.slice(0, NAME_CHARS),
    url: null,
    canonical: null,
    site: null,
    title: null,
    image: null,
    price: d.price,
    currency: d.currency,
    ...(d.price !== null ? { typed: true } : {}),
    bought: false,
    note: null,
    tags: d.tags,
    at: kit.now,
    ...byOf(sender),
  });
  await added(kit, lists, d, [id], here, d.price !== null);
  return true;
}

/** What is left to buy on a list, or what was bought, with what it adds up to. */
async function show(kit: Kit, target: ListRow, which: "left" | "bought") {
  const every = await allItems(kit, target.id);
  const rows = every.filter((r) => r.item.bought === (which === "bought"));
  if (!rows.length) {
    if (which === "bought") return kit.send(copy.nothingBought({ name: target.list.name }));
    return kit.send(every.length ? copy.nothingLeft({ name: target.list.name }) : copy.nothingYet());
  }
  // Newest first, so the thing just added is the one seen.
  const shown = [...rows].reverse().slice(0, SHOW);
  const data = { name: target.list.name, rows: shown.map((r) => row(kit, r.item)), more: rows.length - shown.length, count: rows.length, sum: total(rows.map((r) => r.item), own(kit)) };
  const text = which === "bought" ? copy.boughtList(data) : copy.left(data);
  // One thing: reacting or replying to this message works like on the thing itself.
  kit.send(text.slice(0, 3900), shown.length === 1 ? { ref: { kind: "item", ids: [shown[0].id] } satisfies ItemRef as unknown as Json } : undefined);
}

async function listsText(kit: Kit, here: string | null): Promise<string> {
  const lists = await allLists(kit);
  const items = await allItems(kit);
  const out = [];
  for (const l of lists) {
    const left = items.filter((r) => r.item.list === l.id && !r.item.bought);
    const elsewhere = (l.list.home ?? null) !== here;
    const home = l.list.home ? await kit.store.get<Home>("groups", l.list.home) : null;
    out.push({
      name: l.list.name,
      left: left.length,
      sum: total(left.map((r) => r.item), own(kit)),
      where: !elsewhere ? null : !l.list.home ? "main" : home?.made && slug(home.name) === slug(l.list.name) ? "own" : (home?.name ?? l.list.home),
      shared: !!(await kit.share.find(l.id)),
    });
  }
  return copy.lists({ lists: out });
}

async function share(kit: Kit, target: ListRow) {
  await ensure(kit);
  const url = await kit.share.url(target.id);
  // The message is theirs to forward, so it goes out on its own with nothing of mine in it.
  kit.send(copy.shareText({ name: target.list.name, url, first: slug(target.list.name) === slug(FIRST_LIST) }));
  if (!(await kit.store.get("state", "shared"))) {
    await kit.store.put("state", "shared", 1);
    kit.send(copy.shareHow());
  }
}

function askDelete(kit: Kit, target: ListRow, count: number, sender: Sender | undefined, here: string | null) {
  if (!sender) return;
  const ref: DeleteRef = { del: target.id, by: sender.id };
  kit.ask(copy.deleteQuestion({ name: target.list.name, count }), [DELETE_YES, DELETE_NO], { ref: ref as unknown as Json, ...(here ? { group: here } : {}), confirm: false });
}

/** Run one of the plain commands. Returns false when the message isn't one. */
async function command(kit: Kit, text: string, lower: string, here: string | null, sender: Sender | undefined): Promise<boolean> {
  const lists = await allLists(kit);
  const now = () => current(kit, lists, here);
  // What changes the lists themselves, or opens one to the world, is for the person who added Wishlist.
  // Anyone else in a group can add things, tick them off and look.
  if (sender && !sender.owner && /^(?:(?:new|add|create|make|start)\s+(?:a\s+)?group\b|rename\s|(?:delete|remove|close)\s+(?:the\s+|this\s+)?list\b|stop sharing|unshare|stop share|close link|share(?:\s|$)|currency(?:\s|$))/.test(lower)) {
    kit.send(copy.ownerOnly());
    return true;
  }

  // A list's own name, alone: show it.
  const exact = findList(lists, lower, here);
  if (exact && slug(lower.replace(/\s+list$/, "")) === slug(exact.list.name)) {
    await show(kit, exact, "left");
    return true;
  }
  let m = lower.match(/^(?:list|show|show me|wishlist|my list|my wishlist|items|left|to buy|total|what'?s left)(?:\s+(.+))?$/);
  if (m) {
    const target = m[1] ? findList(lists, m[1], here) : await now();
    // "show tickets 500" is not a list: let it be read as something else.
    if (!target) return false;
    await show(kit, target, "left");
    return true;
  }
  m = lower.match(/^(?:bought|got|purchased|done)(?:\s+(.+))?$/);
  if (m) {
    const target = m[1] ? findList(lists, m[1], here) : await now();
    if (!target) return false;
    await show(kit, target, "bought");
    return true;
  }
  if (/^(lists|my lists|all lists|wishlists)$/.test(lower)) {
    kit.send(await listsText(kit, here));
    return true;
  }
  const make = text.match(/^(?:new|add|create|make|start)\s+(?:a\s+)?(list|group)\s+(?:(?:for|called|named)\s+)?(.+)$/i);
  if (make) {
    const group = make[1].toLowerCase() === "group";
    const made = await createList(kit, make[2], here, group);
    if ("error" in made) kit.send(made.error);
    else kit.send(group ? copy.makingGroup({ name: made.list.name }) : copy.listMade({ name: made.list.name, example: firstOf(lists, here).list.name.toLowerCase() }));
    return true;
  }
  m = lower.match(/^(?:use|switch to|go to)\s+(.+)$/);
  if (m) {
    const target = findList(lists, m[1], here);
    if (!target) kit.send(copy.noSuchList({ name: m[1] }));
    else {
      await ensure(kit);
      await use(kit, here, target.id);
      kit.send(copy.using({ name: target.list.name }));
    }
    return true;
  }
  const rename = text.match(/^rename\s+(?:(?:the\s+)?list\s+)?(.+?)\s+to\s+(.+)$/i);
  if (rename) {
    const target = findList(lists, rename[1], here);
    if (!target) kit.send(copy.noSuchList({ name: rename[1] }));
    else {
      const done = await renameList(kit, target.id, rename[2]);
      kit.send("error" in done ? done.error : copy.renamed({ name: done.name }));
    }
    return true;
  }
  m = lower.match(/^(?:delete|remove|close)\s+(?:the\s+|this\s+)?list(?:\s+(.+))?$/);
  if (m) {
    const target = m[1] ? findList(lists, m[1], here) : await now();
    if (!target) kit.send(copy.noSuchList({ name: m[1] }));
    else askDelete(kit, target, (await allItems(kit, target.id)).length, sender, here);
    return true;
  }
  m = lower.match(/^(?:stop sharing|unshare|stop share|close link)(?:\s+(.+))?$/);
  if (m) {
    const target = m[1] ? findList(lists, m[1], here) : await now();
    if (!target) kit.send(copy.noSuchList({ name: m[1] }));
    else if (await kit.share.find(target.id)) {
      await kit.share.remove(target.id);
      kit.send(copy.sharingStopped({ name: target.list.name }));
    } else kit.send(copy.notShared({ name: target.list.name }));
    return true;
  }
  m = lower.match(/^share(?:\s+(?:link|my list|this))?(?:\s+(.+))?$/);
  if (m) {
    const target = m[1] ? findList(lists, m[1], here) : await now();
    if (!target) return false;
    await share(kit, target);
    return true;
  }
  if (/^(undo|delete last|remove last|oops)$/.test(lower)) {
    const mine = new Set(livingIn(lists, here).map((l) => l.id));
    const last = (await allItems(kit)).filter((r) => mine.has(r.item.list)).at(-1) ?? (await allItems(kit, (await now()).id)).at(-1);
    if (!last) kit.send(copy.nothingYet());
    else {
      await kit.store.delete("items", last.id);
      kit.send(copy.removed({ name: label(last.item) }));
    }
    return true;
  }
  m = lower.match(/^currency(?:\s+(?:is\s+|to\s+)?(.+))?$/);
  if (m) {
    const currency = m[1] ? (currencyOf(m[1]) ?? (/^[a-z]{3}$/.test(m[1]) ? m[1].toUpperCase() : null)) : null;
    if (!currency) kit.send(copy.currencyUnknown());
    else {
      await kit.setSettings({ currency });
      kit.send(copy.currencySet({ currency, example: money(1500, currency) }));
    }
    return true;
  }
  return false;
}

async function renameList(kit: Kit, id: string, said: string): Promise<{ name: string } | { error: string }> {
  await ensure(kit);
  const list = await kit.store.get<List>("lists", id);
  if (!list) return { error: copy.listGone() };
  const name = tidy(said).replace(/[*_~`]/g, "").slice(0, LIST_NAME_CHARS).trim();
  if (!slug(name)) return { error: copy.listNeedsName() };
  const taken = (await allLists(kit)).find((l) => l.id !== id && slug(l.list.name) === slug(name));
  if (taken) return { error: copy.listExists({ name: taken.list.name }) };
  await putList(kit, { id, list: { ...list, name } });
  // A group made for this list carries its name.
  const home = list.home ? await kit.store.get<Home>("groups", list.home) : null;
  if (list.home && home?.made && firstOf(await allLists(kit), list.home).id === id) {
    await kit.groups.rename(list.home, copy.groupTitle({ name }).slice(0, 25));
    await kit.store.put("groups", list.home, { ...home, name } as unknown as Json, home.created);
  }
  return { name };
}

async function moveTo(kit: Kit, ids: string[], to: string): Promise<number> {
  let moved = 0;
  for (const id of ids) {
    const item = await kit.store.get<Item>("items", id);
    if (!item) continue;
    await putItem(kit, id, { ...item, list: to });
    moved++;
  }
  return moved;
}

/** "move", "move this", "wrong list": they want it elsewhere but haven't said where. */
const MOVE = /^(?:(?:can you |please )?(?:move|shift|transfer)(?:\s+(?:it|this|that|this one))?(?:\s+(?:somewhere else|elsewhere|to (?:another|a different|some other) list))?|wrong list)$/;

/** A reply to something on a list: a word that changes it, a price, labels, or a note about it. */
async function onReply(kit: Kit, ids: string[], text: string, lower: string, sender: Sender | undefined, here: string | null) {
  const rows: ItemRow[] = [];
  for (const id of ids) {
    const item = await kit.store.get<Item>("items", id);
    if (item) rows.push({ id, item });
  }
  if (!rows.length) return kit.send(copy.itemGone());
  const each = async (change: (item: Item) => Item) => {
    for (const r of rows) await putItem(kit, r.id, change(r.item));
    kit.react(DONE);
  };
  if (/^(delete|remove|forget)(\s+(it|this|that))?$/.test(lower)) {
    for (const r of rows) await kit.store.delete("items", r.id);
    return kit.react(DONE);
  }
  if (/^(bought|got it|got|done|purchased|ordered|bought it)$/.test(lower)) return each((i) => ({ ...i, bought: true, boughtAt: kit.now }));
  if (/^(not bought|unbuy|still want|not yet|didn'?t buy|returned)$/.test(lower)) return each((i) => ({ ...i, bought: false, boughtAt: null, reacted: false }));
  if (/^(read again|read it again|reread|refresh|check again|check (?:the )?price|update(?: (?:the )?price)?)$/.test(lower)) {
    // Have the link's page read once more: a new name, picture or price replaces what it gave before.
    const linked = rows.filter((r) => r.item.url);
    if (!linked.length) return kit.send(copy.noLink());
    for (const r of linked) await again(kit, r.id, r.item);
    return kit.react(DONE);
  }
  if (/^(no price|remove price|clear price)$/.test(lower)) return each((i) => ({ ...i, price: null, currency: null, typed: false }));
  if (/^(no note|remove note|clear note)$/.test(lower)) return each((i) => ({ ...i, note: null }));
  if (/^(no labels?|no tags?|clear labels?|clear tags?)$/.test(lower)) return each((i) => ({ ...i, tags: [] }));
  const lists = await allLists(kit);
  if (MOVE.test(lower)) {
    if (!sender) return;
    const targets = lists.filter((l) => l.id !== rows[0].item.list).slice(0, 11);
    if (!targets.length) return kit.send(copy.noOtherList());
    const ref: MoveRef = { move: rows.map((r) => r.id), by: sender.id };
    return kit.ask(strip(copy.moveQuestion({ name: clip(label(rows[0].item), 60) })), [...targets.map((t) => t.list.name), STAY], { ref: ref as unknown as Json, ...(here ? { group: here } : {}), confirm: false });
  }
  const move = lower.match(/^(?:move|put)(?:\s+(?:it|this))?\s+(?:to|in|into|on|under)\s+(.+)$/);
  if (move) {
    const target = findList(lists, move[1], here);
    if (!target) return kit.send(copy.noSuchList({ name: move[1] }));
    await moveTo(kit, rows.map((r) => r.id), target.id);
    return kit.react(DONE);
  }
  const called = text.match(/^(?:name|call it|rename(?: it)?(?: to)?)[:\s]\s*(.+)$/i);
  if (called) return each((i) => ({ ...i, name: tidy(called[1]).slice(0, NAME_CHARS) }));
  // Only a price, only labels, or both: "2499", "rs 2499 #gift".
  const { tags, rest } = readTags(text);
  const price = rest ? readPrice(rest, true) : null;
  const priced = price && !price.rest ? price : null;
  if (priced || (tags.length && !rest)) {
    return each((i) => ({
      ...i,
      ...(priced ? { price: priced.price, currency: priced.currency, typed: true } : {}),
      ...(tags.length ? { tags: [...new Set([...i.tags, ...tags])].slice(0, 5) } : {}),
    }));
  }
  // Anything else is their own note about it.
  return each((i) => ({ ...i, note: text.slice(0, NOTE_CHARS) }));
}

/** Ask for a thing's link to be read once more. What comes back replaces what the page gave before (onLink). */
async function again(kit: Kit, id: string, item: Item) {
  if (!item.url) return;
  await putItem(kit, id, { ...item, reading: true });
  await kit.links.read(item.url, { item: id, again: true });
}

/** A thing as the shared page shows it. Notes only when the person turned them on for this list. */
function card(kit: Kit, item: Item, notes: boolean): SharedItem {
  return {
    title: label(item),
    url: item.url,
    image: item.image,
    detail: [item.site, ...item.tags.map((t) => `#${t}`)].filter(Boolean).join(" · ") || null,
    value: priceOf(kit, item),
    note: notes ? item.note : null,
    ...(item.bought ? { done: true, doneLabel: copy.pageBought() } : {}),
  };
}

export default definePlugin({
  id: "wishlist",
  version: "1.3.0",
  sdk: "1",
  name: "Wishlist",
  icon: "🎁",
  tagline: "Send links to things you want. Lists, prices and totals, kept.",
  description:
    "Send a link to something you want to its WhatsApp group, or type it with its price. It is kept on a list with its name, picture and price, and the list adds up what is left to buy. Tick things off with ✅ once bought, keep several lists, and share a list as a page anyone with the link can open.",
  groupName: copy.groupName(),
  price: 0,
  tier: 2,
  // Still being tried out: only people Zelfred allows can add it.
  unlisted: true,
  // "members": a household can keep one list together, and each thing remembers who added it.
  permissions: ["links", "groups", "members", "share"],
  links: { price: true },
  listing: {
    title: "Wishlist on WhatsApp: Save Links, Track Prices | Zelfred",
    description: "Send links to things you want to a WhatsApp chat. Each is kept with its picture and price, your lists add up, and a list can be shared with one link.",
    h1: "A wishlist you keep on WhatsApp",
  },
  welcome: copy.welcome(),
  help: copy.help(),
  settings: {
    /** The currency typed prices are in ("INR"). Null: guessed from the person's time zone. */
    currency: null,
  },

  async onInstall(kit) {
    await ensure(kit);
  },

  async onGroup(event, kit) {
    await ensure(kit);
    const lists = await allLists(kit);
    if (event.kind === "left") {
      // Its lists stay, and move to the main group so they still have a chat.
      for (const l of livingIn(lists, event.key)) await putList(kit, { id: l.id, list: { ...l.list, home: null } });
      await kit.store.delete("groups", event.key);
      return;
    }
    const base = tidy(event.name).replace(/[*_~`]/g, "").slice(0, LIST_NAME_CHARS - 3).trim() || "Group";
    let name = base;
    for (let n = 2; lists.some((l) => slug(l.list.name) === slug(name)); n++) name = `${base} ${n}`;
    await kit.store.put("groups", event.key, { name: tidy(event.name).slice(0, 40) || name, created: kit.now, made: false } satisfies Home as unknown as Json, kit.now);
    if (!livingIn(lists, event.key).length) {
      const made: ListRow = { id: kit.id().toLowerCase().slice(0, 10), list: { name, home: event.key, created: kit.now } };
      await putList(kit, made);
      await use(kit, event.key, made.id);
    }
    kit.send(copy.joinedGroup({ name: firstOf(await allLists(kit), event.key).list.name }));
  },

  async onMessage(event, kit) {
    const text = tidy(event.text);
    const lower = text.toLowerCase().replace(/[!.?]+$/, "");
    const here = event.group ?? null;

    if (event.links?.length) return addLinks(kit, event.links, event.text, here, event.sender);

    if (isItemRef(event.quotedRef) && text) return onReply(kit, event.quotedRef.ids, text, lower, event.sender, here);

    if (await command(kit, text, lower, here, event.sender)) return;

    // "add umbrella", or anything that ends in a price: something they want.
    const asked = text.match(/^(?:add|want|i want|buy|get|need|i need)\s+(.+)$/i);
    if (asked && (await addTyped(kit, asked[1], here, event.sender))) return;
    if (!asked && (await addTyped(kit, text, here, event.sender, true))) return;
    kit.unsure(copy.unsure());
  },

  async onLink(event, kit) {
    // A link typed on the page was read: fill in what the page says.
    const id = (event.ref as { item?: string } | null)?.item;
    const item = typeof id === "string" ? await kit.store.get<Item>("items", id) : null;
    if (!item || !id) return;
    const l = event.link;
    const next: Item = { ...item, reading: false, canonical: l.canonical, site: l.site, title: l.found ? l.title : item.title, image: l.image ?? item.image };
    // Read again on request: today's price replaces the one read before. A price they typed always stays.
    const fresh = (event.ref as { again?: boolean } | null)?.again === true;
    if (!item.typed && (item.price === null || fresh) && l.price != null) Object.assign(next, { price: l.price, currency: l.currency ?? null });
    await putItem(kit, id, next);
  },

  async onAnswer(event, kit) {
    const ref = event.ref;
    if (isMoveRef(ref)) {
      // Only the person who asked decides.
      if (!event.sender || event.sender.id !== ref.by) return;
      kit.close(ref as unknown as Json);
      if (event.option === STAY) return;
      const target = (await allLists(kit)).find((l) => l.list.name === event.option);
      if (!target) return kit.send(copy.listGone());
      const moved = await moveTo(kit, ref.move, target.id);
      return kit.send(moved ? copy.moved({ name: target.list.name }) : copy.itemGone());
    }
    if (isDeleteRef(ref)) {
      if (!event.sender || event.sender.id !== ref.by) return;
      kit.close(ref as unknown as Json);
      const list = await kit.store.get<List>("lists", ref.del);
      if (!list) return kit.send(copy.listGone());
      if (event.option !== DELETE_YES) return kit.send(copy.listKept({ name: list.name }));
      const gone = await deleteList(kit, ref.del);
      // Asked in the group that just closed with its list: nothing more is said there.
      if (!gone?.closed || gone.closed !== (event.group ?? null)) kit.send(copy.listDeleted({ name: list.name }));
    }
  },

  async onReaction(event, kit) {
    if (!isItemRef(event.ref)) return;
    const bought = !!event.emoji && BOUGHT_EMOJI.has(bareEmoji(event.emoji));
    // ✅ on a thing means it is bought. Changing or removing the reaction takes that back,
    // unless it was marked bought in words or on the page.
    // Any other reaction from the person who added Wishlist is kept as the thing's mark, to
    // group by on the page. WhatsApp holds one reaction a person a message, so a ✅ put over a
    // ❤️ leaves the ❤️ as the mark; taking a plain mark's reaction away clears it.
    const mine = event.sender?.owner !== false;
    const mark = event.emoji && !bought ? [...event.emoji].slice(0, 8).join("") : null;
    for (const id of event.ref.ids) {
      const item = await kit.store.get<Item>("items", id);
      if (!item) continue;
      if (bought) {
        if (!item.bought) await putItem(kit, id, { ...item, bought: true, boughtAt: kit.now, reacted: true });
        continue;
      }
      const wasTick = item.bought && !!item.reacted;
      const next: Item = wasTick ? { ...item, bought: false, boughtAt: null, reacted: false } : { ...item };
      if (mine && (mark || !wasTick)) next.mark = mark;
      if (wasTick || (next.mark ?? null) !== (item.mark ?? null)) await putItem(kit, id, next);
    }
  },

  understand: {
    intents: {
      add_item: "Name a thing they want to buy or own, with or without a price",
      show_list: "See what is on their wishlist or what is left to buy",
      bought: "See the things they already bought",
      lists: "See all the lists they have",
      new_list: "Start a new list, like one for a festival, a trip or a person",
      share: "Get a link to their list to send to other people",
      undo: "Remove the last thing they added",
      help: "Ask how this works or what they can say",
    },
  },

  async onIntent(event, kit) {
    const here = event.group ?? null;
    const lists = await allLists(kit);
    switch (event.intent) {
      case "add_item": {
        const words = tidy(event.text).replace(/^(?:please\s+)?(?:can you\s+)?(?:add|i want|i need|i would like|i'd like|want|need|buy|get)\s+(?:an?\s+|some\s+)?/i, "");
        if (await addTyped(kit, words, here, event.sender)) return;
        return kit.send(copy.unsure());
      }
      case "show_list":
        return show(kit, await current(kit, lists, here), "left");
      case "bought":
        return show(kit, await current(kit, lists, here), "bought");
      case "lists":
        return kit.send(await listsText(kit, here));
      case "new_list": {
        const m = event.text.match(/list\s+(?:(?:for|called|named)\s+)?(?:my\s+)?(.+)$/i);
        if (!m) return kit.send(copy.listNeedsName());
        const made = await createList(kit, m[1].replace(/[.!?]+$/, ""), here, false);
        return kit.send("error" in made ? made.error : copy.listMade({ name: made.list.name, example: firstOf(lists, here).list.name.toLowerCase() }));
      }
      case "share":
        return share(kit, await current(kit, lists, here));
      case "undo": {
        await command(kit, "undo", "undo", here, event.sender);
        return;
      }
      default:
        return kit.send(copy.help());
    }
  },

  web: {
    lockable: true,
    async load(kit) {
      const lists = await allLists(kit);
      const items = await allItems(kit);
      const mine = own(kit);
      const groups = await kit.store.list<Home>("groups");
      const out = [];
      for (const l of lists) {
        const on = items.filter((r) => r.item.list === l.id);
        const left = on.filter((r) => !r.item.bought);
        out.push({
          id: l.id,
          name: l.list.name,
          home: l.list.home ?? null,
          homeName: groups.find((g) => g.key === l.list.home)?.data.name ?? null,
          shared: await kit.share.find(l.id),
          notes: !!l.list.notes,
          count: on.length,
          left: left.length,
          sumLeft: total(left.map((r) => r.item), mine),
          sumBought: total(on.filter((r) => r.item.bought).map((r) => r.item), mine),
        });
      }
      return {
        currency: mine,
        // Everything on every list, added up.
        sumLeft: total(items.filter((r) => !r.item.bought).map((r) => r.item), mine),
        sumBought: total(items.filter((r) => r.item.bought).map((r) => r.item), mine),
        max: MAX_ITEMS,
        maxList: MAX_LIST_ITEMS,
        lists: out,
        groups: groups.map((g) => ({ key: g.key, name: g.data.name, made: g.data.made })),
        // Newest first.
        items: items.reverse().map((r) => ({
          id: r.id,
          list: r.item.list,
          name: r.item.name,
          title: r.item.title,
          label: label(r.item),
          url: r.item.url,
          site: r.item.site,
          image: r.item.image,
          price: r.item.price,
          currency: r.item.currency ?? mine,
          shown: priceOf(kit, r.item),
          bought: r.item.bought,
          mark: r.item.mark ?? null,
          note: r.item.note,
          tags: r.item.tags,
          at: r.item.at,
          by: r.item.by ?? null,
          reading: !!r.item.reading,
        })),
      } as unknown as Json;
    },
    actions: {
      /** Add something from the page: a link (read a moment later), or words with a price. */
      async add(kit, { list, text }) {
        await ensure(kit);
        const lists = await allLists(kit);
        const target = lists.find((l) => l.id === String(list ?? "")) ?? lists[0];
        const raw = String(text ?? "").slice(0, 2500);
        const url = /https?:\/\/[^\s<>"']+/i.exec(raw)?.[0].replace(/[),.!?;:\]]+$/, "") ?? null;
        const { tags, rest } = readTags(ownWords(raw));
        const priced = rest ? (readPrice(rest, true) ?? readPrice(rest)) : null;
        const words = tidy(priced ? priced.rest : rest);
        if (!url && !words) throw new Error("Paste a link, or type what it is.");
        const full = await room(kit, target, 1);
        if (full) throw new Error(strip(full));
        const id = `${kit.now.toString(36)}${kit.id().slice(0, 4)}`;
        await putItem(kit, id, {
          list: target.id,
          name: words ? words.slice(0, NAME_CHARS) : null,
          url,
          canonical: url,
          site: null,
          title: null,
          image: null,
          price: priced?.price ?? null,
          currency: priced?.currency ?? null,
          ...(priced ? { typed: true } : {}),
          bought: false,
          note: null,
          tags,
          at: kit.now,
          by: { id: kit.person.id ?? "owner", name: kit.person.name, owner: true },
          ...(url ? { reading: true } : {}),
        });
        if (url) await kit.links.read(url, { item: id });
        return { id };
      },
      /** Change what a thing is called, costs, says or is labelled. Only the fields given are changed. */
      async edit(kit, { id, name, price, currency, note, tags }) {
        const item = await kit.store.get<Item>("items", String(id));
        if (!item) return;
        const next: Item = { ...item };
        if (name !== undefined) next.name = tidy(String(name ?? "")).slice(0, NAME_CHARS) || null;
        if (price !== undefined) {
          const n = price === null || price === "" ? null : Number(price);
          if (n !== null && !(Number.isFinite(n) && n >= 0 && n < 1e10)) throw new Error("That price isn't a number.");
          next.price = n === null ? null : Math.round(n * 100) / 100;
          next.typed = n !== null;
          if (n === null) next.currency = null;
        }
        if (currency !== undefined && next.price !== null) {
          const c = String(currency ?? "").toUpperCase();
          next.currency = /^[A-Z]{3}$/.test(c) && c !== own(kit) ? c : null;
        }
        if (note !== undefined) next.note = String(note ?? "").trim().slice(0, NOTE_CHARS) || null;
        if (Array.isArray(tags)) next.tags = readTags(tags.map((t) => `#${String(t).replace(/^#/, "")}`).join(" ")).tags;
        if (!next.name && !next.title && !next.url) throw new Error("Give it a name.");
        await putItem(kit, String(id), next);
      },
      /** Read the thing's link once more, for a page that gave nothing the first time or a price that has changed. */
      async readAgain(kit, { id }) {
        const item = await kit.store.get<Item>("items", String(id));
        if (!item) return;
        if (!item.url) throw new Error("This one has no link to read.");
        await again(kit, String(id), item);
      },
      async setBought(kit, { id, on }) {
        const item = await kit.store.get<Item>("items", String(id));
        if (!item) return;
        const next: Item = { ...item, bought: !!on, boughtAt: on ? kit.now : null, reacted: false };
        await putItem(kit, String(id), next);
        await showOn(kit, String(id), next);
      },
      async move(kit, { id, list }) {
        if (!(await kit.store.get<List>("lists", String(list)))) throw new Error("That list isn't there any more.");
        await moveTo(kit, [String(id)], String(list));
      },
      async remove(kit, { id }) {
        await kit.store.delete("items", String(id));
      },
      /** `group`: give the list a WhatsApp group of its own. `home`: else, the group it should live in (null: the main one). */
      async createList(kit, { name, group, home }) {
        const key = typeof home === "string" && home && (await kit.store.get<Home>("groups", home)) ? home : null;
        const made = await createList(kit, String(name ?? ""), key, !!group);
        if ("error" in made) throw new Error(strip(made.error));
        return { id: made.id, name: made.list.name, home: made.list.home };
      },
      async renameList(kit, { id, name }) {
        const done = await renameList(kit, String(id), String(name ?? ""));
        if ("error" in done) throw new Error(strip(done.error));
        return done;
      },
      async deleteList(kit, { id }) {
        await deleteList(kit, String(id));
      },
      /** Turn a list's shared page on (returns its address) or off (the address closes for good). */
      async share(kit, { id, on }) {
        await ensure(kit);
        if (!(await kit.store.get<List>("lists", String(id)))) throw new Error("That list isn't there any more.");
        if (!on) return void (await kit.share.remove(String(id)));
        return { url: await kit.share.url(String(id)) };
      },
      /** A new address for a shared list: every copy of the old one stops working. */
      async replaceLink(kit, { id }) {
        if (!(await kit.share.find(String(id)))) throw new Error("That list isn't shared.");
        await kit.share.remove(String(id));
        return { url: await kit.share.url(String(id)) };
      },
      async setNotes(kit, { id, on }) {
        const list = await kit.store.get<List>("lists", String(id));
        if (list) await putList(kit, { id: String(id), list: { ...list, notes: !!on } });
      },
      /** The words to send with a shared list's link, as the person would say them. */
      async shareText(kit, { id }) {
        const list = await kit.store.get<List>("lists", String(id));
        const url = await kit.share.find(String(id));
        if (!list || !url) throw new Error("That list isn't shared.");
        return { text: copy.shareText({ name: list.name, url, first: slug(list.name) === slug(FIRST_LIST) }) };
      },
      async setCurrency(kit, { currency }) {
        const c = String(currency ?? "").toUpperCase();
        if (!/^[A-Z]{3}$/.test(c)) throw new Error("A currency is three letters, like INR.");
        await kit.setSettings({ currency: c });
      },
    },
    async shared(kit, key): Promise<SharedPage | null> {
      const list = await kit.store.get<List>("lists", key);
      if (!list) return null;
      const items = (await allItems(kit, key)).reverse();
      const want = items.filter((r) => !r.item.bought);
      const got = items.filter((r) => r.item.bought);
      return {
        title: list.name,
        intro: copy.pageIntro({ want: want.length, got: got.length }),
        image: want.find((r) => r.item.image)?.item.image ?? null,
        sections: [
          ...(want.length ? [{ items: want.map((r) => card(kit, r.item, !!list.notes)) }] : []),
          ...(got.length ? [{ heading: copy.pageBoughtHeading(), items: got.map((r) => card(kit, r.item, !!list.notes)) }] : []),
        ],
      };
    },
  },
});
