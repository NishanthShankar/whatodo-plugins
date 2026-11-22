import { describe, expect, it } from "vitest";
import { definePlugin } from "../../../sdk";
import { createTestKit, link } from "../../../testing";
import plugin, { MAX_LIST_ITEMS, type Item, type List } from "../index";
import { guessCurrency, money, readPrice, readTags, total } from "../money";

type T = ReturnType<typeof createTestKit>;

const phones = link("https://www.amazon.in/dp/B0PHONES?ref=x", { canonical: "https://www.amazon.in/dp/B0PHONES", site: "amazon.in", title: "Sony WH-1000XM5 Headphones", image: "https://img.example/phones.jpg", price: 24990, currency: "INR" });
const lamp = link("https://example.com/lamp", { title: "Brass desk lamp", image: "https://img.example/lamp.jpg", price: 49.5, currency: "USD" });
const mug = link("https://example.com/mug", { title: "Stoneware mug" });
const dead = link("https://shop.example/x", { site: "shop.example", found: false });

const send = (t: T, text: string, links: ReturnType<typeof link>[], group: string | null = null, from?: string) => t.message(plugin, text, null, group, from, links);
const items = (t: T) =>
  Object.entries(t.dump())
    .filter(([k]) => k.startsWith("items/"))
    .map(([k, v]) => ({ id: k.slice(6), ...(v as unknown as Item) }));
const lists = (t: T) =>
  Object.entries(t.dump())
    .filter(([k]) => k.startsWith("lists/"))
    .map(([k, v]) => ({ id: k.slice(6), ...(v as unknown as List) }));
const listId = (t: T, name: string) => lists(t).find((l) => l.name === name)!.id;
const last = (t: T) => t.sent.at(-1)!.text;

describe("reading prices and labels", () => {
  it("reads a price with its currency, either side of the number", () => {
    expect(readPrice("headphones rs 24,990")).toEqual({ price: 24990, currency: "INR", rest: "headphones" });
    expect(readPrice("₹1,24,990 laptop")).toEqual({ price: 124990, currency: "INR", rest: "laptop" });
    expect(readPrice("lamp $49.50")).toEqual({ price: 49.5, currency: "USD", rest: "lamp" });
    expect(readPrice("tickets 20 usd")).toEqual({ price: 20, currency: "USD", rest: "tickets" });
    expect(readPrice("sofa 1.2 lakh")).toEqual({ price: 120000, currency: null, rest: "sofa" });
    expect(readPrice("sofa rs 1.2 lakh")).toEqual({ price: 120000, currency: "INR", rest: "sofa" });
    expect(readPrice("bike 85k")).toEqual({ price: 85000, currency: null, rest: "bike" });
  });

  it("takes a bare number as a price only at the end, and only from 50 up", () => {
    expect(readPrice("running shoes 4000")).toEqual({ price: 4000, currency: null, rest: "running shoes" });
    expect(readPrice("iphone 15")).toBeNull();
    expect(readPrice("iphone 15 pro")).toBeNull();
    expect(readPrice("4000")).toBeNull();
    expect(readPrice("4000", true)).toEqual({ price: 4000, currency: null, rest: "" });
    expect(readPrice("20", true)).toEqual({ price: 20, currency: null, rest: "" });
  });

  it("reads labels, lowercase and without repeats", () => {
    expect(readTags("mug #Kitchen #gift #kitchen")).toEqual({ tags: ["kitchen", "gift"], rest: "mug" });
    expect(readTags("c# book")).toEqual({ tags: [], rest: "c# book" });
  });

  it("writes money the way it is written", () => {
    expect(money(124990, "INR")).toBe("₹1,24,990");
    expect(money(1234567.5, "USD")).toBe("$1,234,567.50");
    expect(money(300, "AED")).toBe("AED 300");
    expect(total([{ price: 100, currency: null }, { price: 20, currency: "USD" }, { price: null, currency: null }], "INR")).toBe("₹100 + $20");
    expect(total([{ price: null, currency: null }], "INR")).toBeNull();
    expect(guessCurrency("Asia/Kolkata")).toBe("INR");
    expect(guessCurrency("America/New_York")).toBe("USD");
  });
});

describe("adding", () => {
  it("keeps a link with its title, picture and the page's price", async () => {
    const t = createTestKit();
    await send(t, phones.url, [phones]);
    const [one] = items(t);
    expect(one).toMatchObject({ list: "main", name: null, title: phones.title, url: phones.url, site: "amazon.in", image: phones.image, price: 24990, currency: "INR", bought: false, note: null, tags: [] });
    expect(t.reactions).toEqual(["👍"]);
    expect(t.marks).toEqual([{ kind: "item", ids: [one.id] }]);
    expect(t.sent[0].text).toMatch(/Added, with its price/);
  });

  it("explains only the first time", async () => {
    const t = createTestKit();
    await send(t, mug.url, [mug]);
    expect(t.sent[0].text).toMatch(/couldn't find a price/);
    await send(t, lamp.url, [lamp]);
    expect(t.sent).toHaveLength(1);
  });

  it("takes the price and labels typed with a link over the page's, and the words as a note", async () => {
    const t = createTestKit();
    await send(t, `${phones.url} for the commute 21999 #audio`, [phones]);
    expect(items(t)[0]).toMatchObject({ price: 21999, currency: null, typed: true, note: "for the commute", tags: ["audio"] });
  });

  it("names a link by their words when its page couldn't be read", async () => {
    const t = createTestKit();
    await send(t, `${dead.url} blue kettle`, [dead]);
    expect(items(t)[0]).toMatchObject({ name: "blue kettle", title: null, note: null });
  });

  it("keeps one copy of a link sent twice to the same list", async () => {
    const t = createTestKit();
    await send(t, phones.url, [phones]);
    await send(t, `${phones.url} 19999`, [phones]);
    expect(items(t)).toHaveLength(1);
    expect(items(t)[0]).toMatchObject({ price: 19999, typed: true });
  });

  it("adds something typed with a price, or with add", async () => {
    const t = createTestKit();
    await t.message(plugin, "running shoes 4000");
    await t.message(plugin, "add umbrella");
    expect(items(t).map((i) => [i.name, i.price])).toEqual([["running shoes", 4000], ["umbrella", null]]);
    expect(t.unsures).toEqual([]);
  });

  it("is unsure about words that are neither", async () => {
    const t = createTestKit();
    await t.message(plugin, "what a day");
    expect(items(t)).toEqual([]);
    expect(t.unsures).toHaveLength(1);
    await t.intent(plugin, "i want a standing desk", "add_item");
    expect(items(t)[0].name).toBe("standing desk");
  });

  it("stops at a full list", async () => {
    const t = createTestKit();
    await t.install(plugin);
    for (let i = 0; i < MAX_LIST_ITEMS; i++) await t.kit.store.put("items", `x${i}`, { list: "main", name: `thing ${i}`, url: null, canonical: null, site: null, title: null, image: null, price: null, currency: null, bought: false, note: null, tags: [], at: i }, i);
    await t.message(plugin, "one more 500");
    expect(last(t)).toMatch(/is full/);
    expect(items(t)).toHaveLength(MAX_LIST_ITEMS);
  });
});

describe("several lists in one chat", () => {
  it("a named list gets the link, and a bare link goes to the list used last", async () => {
    const t = createTestKit();
    await send(t, mug.url, [mug]);
    await t.message(plugin, "new list diwali");
    expect(last(t)).toMatch(/\*diwali\* is ready/);
    const diwali = listId(t, "diwali");
    // Just made: it is the one in use.
    await send(t, lamp.url, [lamp]);
    expect(items(t).find((i) => i.url === lamp.url)!.list).toBe(diwali);
    // Named: back to the first list, which becomes the one in use.
    await send(t, `wishlist ${phones.url}`, [phones]);
    expect(items(t).find((i) => i.url === phones.url)!.list).toBe("main");
    await send(t, dead.url, [dead]);
    expect(items(t).find((i) => i.url === dead.url)!.list).toBe("main");
  });

  it("says which list when a bare link went to one that isn't the chat's first", async () => {
    const t = createTestKit();
    await send(t, mug.url, [mug]);
    await t.message(plugin, "new list diwali");
    const before = t.sent.length;
    await send(t, lamp.url, [lamp]);
    expect(t.sent.slice(before).map((s) => s.text)).toEqual(["In *diwali*."]);
    await send(t, `diwali: ${phones.url}`, [phones]);
    expect(t.sent).toHaveLength(before + 1);
  });

  it("reads the list's name after the words too, and from typed things only with a colon or 'in'", async () => {
    const t = createTestKit();
    await t.message(plugin, "new list gifts");
    await t.message(plugin, "use wishlist");
    await t.message(plugin, "gifts for mom 2000");
    await t.message(plugin, "gifts: scarf 800");
    await t.message(plugin, "candles 300 in gifts");
    const gifts = listId(t, "gifts");
    expect(items(t).map((i) => [i.name, i.price, i.list === gifts])).toEqual([["gifts for mom", 2000, false], ["scarf", 800, true], ["candles", 300, true]]);
  });

  it("finds the list's name after a later 'for' too", async () => {
    const t = createTestKit();
    await t.message(plugin, "new list diwali");
    await t.message(plugin, "use wishlist");
    await t.message(plugin, "a note to self for diwali 300");
    await send(t, `${lamp.url} on sale for the diwali list`, [lamp]);
    const diwali = listId(t, "diwali");
    expect(items(t).map((i) => [i.name ?? i.note, i.list === diwali])).toEqual([["a note to self", true], ["on sale", true]]);
  });

  it("lets someone else in the group add and tick, but not delete, rename or share", async () => {
    const t = createTestKit();
    await t.group(plugin, "joined", "x-home", "Home");
    await send(t, lamp.url, [lamp], "x-home", "Asha");
    await t.react(plugin, "✅", t.marks[0], "x-home", "Asha");
    expect(items(t)[0].bought).toBe(true);
    const before = t.sent.length;
    for (const said of ["share", "stop sharing", "delete list home", "rename home to Ours", "new group gifts", "currency usd"]) await t.message(plugin, said, null, "x-home", "Asha");
    expect(t.sent.slice(before).map((m) => m.text)).toEqual(Array(6).fill(expect.stringMatching(/^Only the person who added Wishlist/)));
    expect(t.shares.size).toBe(0);
    expect(t.asked).toEqual([]);
    expect(lists(t).map((l) => l.name)).toEqual(["Wishlist", "Home"]);
    // A new list in the chat they are in is theirs to start.
    await t.message(plugin, "new list snacks", null, "x-home", "Asha");
    expect(lists(t).map((l) => l.name)).toContain("snacks");
  });

  it("gives a list a WhatsApp group of its own, where links go to it", async () => {
    const t = createTestKit();
    await t.message(plugin, "new group Trip to Goa");
    expect([...t.groups]).toEqual([["trip-to-goa", { name: "🎁 Trip to Goa", hello: expect.stringContaining("Trip to Goa") }]]);
    await send(t, lamp.url, [lamp], "trip-to-goa");
    expect(items(t)[0].list).toBe(listId(t, "Trip to Goa"));
    // The main chat still goes to the first list.
    await send(t, mug.url, [mug]);
    expect(items(t).find((i) => i.url === mug.url)!.list).toBe("main");
  });

  it("refuses a second list of the same name", async () => {
    const t = createTestKit();
    await t.message(plugin, "new list Diwali");
    await t.message(plugin, "new list diwali");
    expect(last(t)).toMatch(/already have a list called \*Diwali\*/);
  });

  it("takes a group the person already had, and gives its lists back to the main chat when it leaves", async () => {
    const t = createTestKit();
    await t.group(plugin, "joined", "x-home", "Home stuff");
    expect(last(t)).toMatch(/keeping a wishlist for this group now, called \*Home stuff\*/);
    await send(t, lamp.url, [lamp], "x-home", "Asha");
    expect(items(t)[0]).toMatchObject({ list: listId(t, "Home stuff"), by: { id: "asha", name: "Asha", owner: false } });
    await t.group(plugin, "left", "x-home", "Home stuff");
    expect(lists(t).find((l) => l.name === "Home stuff")!.home).toBeNull();
    expect(items(t)).toHaveLength(1);
  });
});

describe("showing", () => {
  it("lists what is left with the total, newest first", async () => {
    const t = createTestKit();
    await send(t, phones.url, [phones]);
    await send(t, lamp.url, [lamp]);
    await t.message(plugin, "socks 300");
    await t.message(plugin, "list");
    expect(last(t)).toMatch(/^🎁 \*Wishlist\*: 3 things to buy, ₹25,290 \+ \$49\.50/);
    expect(last(t).indexOf("socks")).toBeLessThan(last(t).indexOf("Sony"));
  });

  it("shows another list by its name, and every list with lists", async () => {
    const t = createTestKit();
    await t.message(plugin, "new list diwali");
    await t.message(plugin, "lamps 900");
    await t.message(plugin, "use wishlist");
    await t.message(plugin, "diwali");
    expect(last(t)).toMatch(/\*diwali\*: 1 thing to buy, ₹900/);
    await t.message(plugin, "lists");
    expect(last(t)).toBe("*Your lists*\n\n*Wishlist*: nothing to buy\n*diwali*: 1 thing to buy, ₹900");
  });

  it("says so when there is nothing", async () => {
    const t = createTestKit();
    await t.message(plugin, "list");
    expect(last(t)).toMatch(/Nothing on the list yet/);
    await t.message(plugin, "bought");
    expect(last(t)).toMatch(/Nothing on \*Wishlist\* is bought yet/);
  });

  it("undo removes the last thing added here", async () => {
    const t = createTestKit();
    await t.message(plugin, "socks 300");
    await t.message(plugin, "umbrella 900");
    await t.message(plugin, "undo");
    expect(last(t)).toBe("Removed *umbrella*.");
    expect(items(t).map((i) => i.name)).toEqual(["socks"]);
  });
});

describe("on something already added", () => {
  const one = async () => {
    const t = createTestKit();
    await send(t, mug.url, [mug]);
    return { t, ref: t.marks[0] };
  };

  it("✅ marks it bought, and taking the reaction off takes that back", async () => {
    const { t, ref } = await one();
    await t.react(plugin, "✅", ref);
    expect(items(t)[0]).toMatchObject({ bought: true, reacted: true });
    await t.react(plugin, null, ref);
    expect(items(t)[0]).toMatchObject({ bought: false, reacted: false });
  });

  it("a reaction never takes back what was said in words", async () => {
    const { t, ref } = await one();
    await t.message(plugin, "bought", ref);
    await t.react(plugin, "✅", ref);
    await t.react(plugin, null, ref);
    expect(items(t)[0].bought).toBe(true);
  });

  it("a reply sets the price, labels, a name or a note", async () => {
    const { t, ref } = await one();
    await t.message(plugin, "450", ref);
    expect(items(t)[0]).toMatchObject({ price: 450, typed: true });
    await t.message(plugin, "$12 #kitchen", ref);
    expect(items(t)[0]).toMatchObject({ price: 12, currency: "USD", tags: ["kitchen"] });
    await t.message(plugin, "call it The good mug", ref);
    expect(items(t)[0].name).toBe("The good mug");
    await t.message(plugin, "the one from the cafe, about rs 400", ref);
    expect(items(t)[0]).toMatchObject({ note: "the one from the cafe, about rs 400", price: 12 });
    await t.message(plugin, "delete", ref);
    expect(items(t)).toEqual([]);
  });

  it("reads its link again when asked, and keeps a price they typed", async () => {
    const { t, ref } = await one();
    await t.message(plugin, "read again", ref);
    expect(items(t)[0].reading).toBe(true);
    expect(t.reads).toEqual([{ url: mug.url, ref: { item: items(t)[0].id, again: true } }]);
    await t.link(plugin, { ...mug, title: "Stoneware mug, blue", price: 450, currency: "INR" });
    expect(items(t)[0]).toMatchObject({ reading: false, title: "Stoneware mug, blue", price: 450 });
    // The price moved: a second read replaces the one read before.
    await t.act(plugin, "readAgain", { id: items(t)[0].id });
    await t.link(plugin, { ...mug, price: 399, currency: "INR" });
    expect(items(t)[0].price).toBe(399);
    // Their own price is never replaced.
    await t.message(plugin, "500", ref);
    await t.message(plugin, "refresh", ref);
    await t.link(plugin, { ...mug, price: 350, currency: "INR" });
    expect(items(t)[0]).toMatchObject({ price: 500, typed: true });
    await t.message(plugin, "kettle 900");
    await t.message(plugin, "read again", t.marks[1]);
    expect(t.sent.at(-1)!.text).toMatch(/has no link/);
    await expect(t.act(plugin, "readAgain", { id: items(t).find((i) => i.name === "kettle")!.id })).rejects.toThrow(/no link/);
  });

  it("moves it to a named list, or asks which", async () => {
    const { t, ref } = await one();
    await t.message(plugin, "move", ref);
    expect(last(t)).toMatch(/no other list/);
    await t.message(plugin, "new list gifts");
    await t.message(plugin, "move to gifts", ref);
    expect(items(t)[0].list).toBe(listId(t, "gifts"));
    await t.message(plugin, "move", ref);
    const q = t.asked.at(-1)!;
    expect(q).toMatchObject({ question: "Move Stoneware mug to which list?", options: ["Wishlist", "Leave it here"] });
    await t.answer(plugin, q.ref, 0);
    expect(items(t)[0].list).toBe("main");
    expect(last(t)).toBe("Moved to *Wishlist*.");
  });
});

describe("deleting a list", () => {
  it("asks first, and keeps it on no", async () => {
    const t = createTestKit();
    await t.message(plugin, "new list gifts");
    await t.message(plugin, "scarf 800");
    await t.message(plugin, "delete list gifts");
    const q = t.asked.at(-1)!;
    expect(q).toMatchObject({ question: "Delete gifts and the 1 thing on it?", options: ["Delete it", "Keep it"], confirm: false });
    await t.answer(plugin, q.ref, 1);
    expect(last(t)).toBe("No problem. *gifts* stays.");
    expect(items(t)).toHaveLength(1);
  });

  it("removes the list, its things, its share link and the group made for it", async () => {
    const t = createTestKit();
    await t.message(plugin, "new group gifts");
    await t.message(plugin, "scarf 800", null, "gifts");
    await t.message(plugin, "share", null, "gifts");
    expect([...t.shares.keys()]).toEqual([listId(t, "gifts")]);
    await t.message(plugin, "delete list gifts");
    await t.answer(plugin, t.asked.at(-1)!.ref, 0);
    expect(lists(t).map((l) => l.name)).toEqual(["Wishlist"]);
    expect(items(t)).toEqual([]);
    expect(t.shares.size).toBe(0);
    expect(t.groups.size).toBe(0);
  });
});

describe("sharing", () => {
  it("sends a message to forward, with a note the first time only", async () => {
    const t = createTestKit();
    await t.message(plugin, "share");
    expect(t.sent.map((s) => s.text)).toEqual([expect.stringMatching(/https:\/\/share\.test\/main-1$/), expect.stringMatching(/^Forward that message/)]);
    // In the person's voice: nothing of Zelfred's in it.
    expect(t.sent[0].text).not.toMatch(/\bI'll\b|Zelfred/);
    await t.message(plugin, "share");
    expect(t.sent).toHaveLength(3);
  });

  it("the page shows the list, with no note unless turned on and nothing about who made it", async () => {
    const t = createTestKit({ person: { name: "Priya Sharma", timezone: "Asia/Kolkata" } });
    await send(t, `${phones.url} ask dad`, [phones]);
    await send(t, mug.url, [mug]);
    await t.react(plugin, "✅", t.marks[1]);
    await t.message(plugin, "share");
    const page = (await t.shared(plugin, "main"))!;
    expect(page).toMatchObject({ title: "Wishlist", intro: "1 thing wanted, 1 already bought.", image: phones.image });
    expect(page.sections).toEqual([
      { items: [{ title: phones.title, url: phones.url, image: phones.image, detail: "amazon.in", value: "₹24,990", note: null }] },
      { heading: "Already bought", items: [{ title: "Stoneware mug", url: mug.url, image: null, detail: "example.com", value: null, note: null, done: true, doneLabel: "Bought" }] },
    ]);
    expect(JSON.stringify(page)).not.toMatch(/Priya|owner/);
    await t.act(plugin, "setNotes", { id: "main", on: true });
    expect((await t.shared(plugin, "main"))!.sections[0].items[0].note).toBe("ask dad");
  });

  it("stop sharing closes the link, and sharing again makes a new one", async () => {
    const t = createTestKit();
    await t.message(plugin, "share");
    await t.message(plugin, "stop sharing");
    expect(last(t)).toMatch(/isn't shared any more/);
    expect(t.shares.size).toBe(0);
    await t.message(plugin, "stop sharing");
    expect(last(t)).toBe("*Wishlist* isn't shared.");
    await t.message(plugin, "share");
    expect(last(t)).toMatch(/main-2$/);
  });
});

describe("the page", () => {
  it("loads lists with their totals and every thing", async () => {
    const t = createTestKit();
    await send(t, phones.url, [phones]);
    await t.message(plugin, "socks 300");
    await t.react(plugin, "✅", t.marks[1]);
    const data = (await t.load(plugin)) as unknown as { currency: string; lists: Record<string, unknown>[]; items: Record<string, unknown>[] };
    expect(data.currency).toBe("INR");
    expect(data.lists).toEqual([{ id: "main", name: "Wishlist", home: null, homeName: null, shared: null, notes: false, count: 2, left: 1, sumLeft: "₹24,990", sumBought: "₹300" }]);
    expect(data.items.map((i) => [i.label, i.shown, i.bought])).toEqual([["socks", "₹300", true], ["Sony WH-1000XM5 Headphones", "₹24,990", false]]);
  });

  it("shows the first list before anything is stored", async () => {
    const t = createTestKit();
    const data = (await t.load(plugin)) as unknown as { lists: { id: string; name: string }[] };
    expect(data.lists.map((l) => [l.id, l.name])).toEqual([["main", "Wishlist"]]);
  });

  it("adds a link typed on the page, and fills it in once it is read", async () => {
    const t = createTestKit();
    const { id } = (await t.act(plugin, "add", { list: "main", text: `${lamp.url} #desk` })) as { id: string };
    expect(items(t)[0]).toMatchObject({ url: lamp.url, title: null, reading: true, tags: ["desk"], by: { owner: true } });
    expect(t.reads).toEqual([{ url: lamp.url, ref: { item: id } }]);
    await t.link(plugin, lamp);
    expect(items(t)[0]).toMatchObject({ title: "Brass desk lamp", image: lamp.image, price: 49.5, currency: "USD", reading: false });
  });

  it("keeps a price typed on the page over the one the link gives", async () => {
    const t = createTestKit();
    await t.act(plugin, "add", { list: "main", text: `${lamp.url} 3500` });
    await t.link(plugin, lamp);
    expect(items(t)[0]).toMatchObject({ price: 3500, currency: null, typed: true });
  });

  it("edits, ticks, moves and removes", async () => {
    const t = createTestKit();
    const { id } = (await t.act(plugin, "add", { list: "main", text: "kettle" })) as { id: string };
    await t.act(plugin, "edit", { id, name: "Blue kettle", price: 1499, note: "matte one", tags: ["Kitchen", "#home"] });
    expect(items(t)[0]).toMatchObject({ name: "Blue kettle", price: 1499, typed: true, note: "matte one", tags: ["kitchen", "home"] });
    await t.act(plugin, "setBought", { id, on: true });
    expect(items(t)[0].bought).toBe(true);
    const made = (await t.act(plugin, "createList", { name: "Kitchen" })) as { id: string };
    await t.act(plugin, "move", { id, list: made.id });
    expect(items(t)[0].list).toBe(made.id);
    await t.act(plugin, "renameList", { id: made.id, name: "New kitchen" });
    expect(lists(t).map((l) => l.name)).toEqual(["Wishlist", "New kitchen"]);
    await t.act(plugin, "remove", { id });
    expect(items(t)).toEqual([]);
    await expect(t.act(plugin, "add", { list: "main", text: "  " })).rejects.toThrow(/Paste a link/);
  });

  it("shares from the page, replaces the link and hands over words to send with it", async () => {
    const t = createTestKit();
    expect(await t.act(plugin, "share", { id: "main", on: true })).toEqual({ url: "https://share.test/main-1" });
    expect(await t.act(plugin, "replaceLink", { id: "main" })).toEqual({ url: "https://share.test/main-2" });
    expect(((await t.act(plugin, "shareText", { id: "main" })) as { text: string }).text).toMatch(/share\.test\/main-2/);
    await t.act(plugin, "share", { id: "main", on: false });
    expect(t.shares.size).toBe(0);
  });

  it("sets the currency typed prices are in", async () => {
    const t = createTestKit();
    await t.message(plugin, "currency usd");
    expect(last(t)).toBe("Prices you type are in USD now, like $1,500.");
    await t.message(plugin, "socks 300");
    await t.message(plugin, "list");
    expect(last(t)).toMatch(/1 thing to buy, \$300/);
  });
});

describe("the kit's rules for sharing", () => {
  const base = { id: "x-test", version: "1.0.0", sdk: "1", name: "X", icon: "x", tagline: "x", description: "x", groupName: "x", price: 0, welcome: "x", help: "x" };
  const web = { load: async () => null, shared: async () => null };
  it("refuses share with vault, and each half of sharing without the other", () => {
    expect(() => definePlugin({ ...base, permissions: ["share", "vault"], web })).toThrow(/"share" and "vault"/);
    expect(() => definePlugin({ ...base, permissions: [], web })).toThrow(/web\.shared needs the "share" permission/);
    expect(() => definePlugin({ ...base, permissions: ["share"], web: { load: web.load } })).toThrow(/needs web\.shared/);
    expect(() => definePlugin({ ...base, permissions: [], links: { price: true } })).toThrow(/need the "links" permission/);
    expect(definePlugin({ ...base, permissions: ["share", "links"], links: { price: true }, web }).id).toBe("x-test");
  });
});
