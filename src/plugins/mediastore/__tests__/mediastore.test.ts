import { describe, expect, it } from "vitest";
import { createTestKit, link } from "../../../testing";
import plugin, { hash, MAX_LINKS, slug, type Item } from "../index";
import { rank, words } from "../search";

const pasta = link("https://youtu.be/aaa?si=x", {
  canonical: "https://www.youtube.com/watch?v=aaa",
  site: "YouTube",
  kind: "short",
  title: "Creamy garlic pasta in 10 minutes",
  description: "The easiest weeknight dinner. #recipe #pasta",
  author: "Kitchen Stories",
  image: "https://i.ytimg.com/vi/aaa/hqdefault.jpg",
  seconds: 58,
});
const yoga = link("https://www.instagram.com/reel/bbb/?igsh=1", {
  canonical: "https://www.instagram.com/reel/bbb/",
  site: "Instagram",
  kind: "reel",
  title: null,
  description: "Morning stretches for a stiff back",
  author: "yogawithmira",
  image: "https://scontent.cdninstagram.com/x.jpg",
});
const dead = link("https://www.instagram.com/reel/ccc/", { canonical: "https://www.instagram.com/reel/ccc/", site: "Instagram", kind: "reel", found: false });

const send = (t: ReturnType<typeof createTestKit>, text: string, links: ReturnType<typeof link>[], group: string | null = null) => t.message(plugin, text, null, group, undefined, links);
const items = (t: ReturnType<typeof createTestKit>) =>
  Object.entries(t.dump())
    .filter(([k]) => k.startsWith("links/"))
    .map(([k, v]) => ({ id: k.slice(6), ...(v as unknown as Item) }));

describe("saving", () => {
  it("keeps a link with its details, marks the message and thumbs it", async () => {
    const t = createTestKit();
    await send(t, pasta.url, [pasta]);
    const [one] = items(t);
    expect(one).toMatchObject({ url: pasta.url, canonical: pasta.canonical, site: "YouTube", kind: "short", title: pasta.title, author: "Kitchen Stories", seconds: 58, note: null, group: null, found: true });
    expect(t.reactions).toEqual(["👍"]);
    expect(t.marks).toEqual([{ kind: "link", ids: [one.id] }]);
  });

  it("explains the caption only the first time", async () => {
    const t = createTestKit();
    await send(t, pasta.url, [pasta]);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].text).toMatch(/kept its title and caption/);
    await send(t, yoga.url, [yoga]);
    expect(t.sent).toHaveLength(1);
    expect(t.reactions).toEqual(["👍", "👍"]);
  });

  it("says so when the first link couldn't be read, and still keeps it", async () => {
    const t = createTestKit();
    await send(t, dead.url, [dead]);
    expect(t.sent[0].text).toMatch(/couldn't read/);
    expect(items(t)[0]).toMatchObject({ found: false, title: null });
  });

  it("keeps the words sent with a link as the note", async () => {
    const t = createTestKit();
    await send(t, `try this on sunday ${pasta.url}`, [pasta]);
    expect(items(t)[0].note).toBe("try this on sunday");
  });

  it("keeps every link of a message", async () => {
    const t = createTestKit();
    await send(t, `${pasta.url} ${yoga.url}`, [pasta, yoga]);
    expect(items(t)).toHaveLength(2);
    expect((t.marks[0] as { ids: string[] }).ids).toHaveLength(2);
  });

  it("keeps one copy of a link sent twice, with the newer note and details", async () => {
    const t = createTestKit();
    await send(t, `first ${pasta.url}`, [pasta]);
    await send(t, "https://www.youtube.com/shorts/aaa", [{ ...pasta, url: "https://www.youtube.com/shorts/aaa", image: "https://new.test/a.jpg" }]);
    expect(items(t)).toHaveLength(1);
    expect(items(t)[0]).toMatchObject({ note: "first", image: "https://new.test/a.jpg" });
    await send(t, `second ${pasta.url}`, [pasta]);
    expect(items(t)[0].note).toBe("second");
  });

  it("keeps a link's details when a later read of it fails", async () => {
    const t = createTestKit();
    await send(t, pasta.url, [pasta]);
    await send(t, pasta.url, [{ ...pasta, found: false, title: null, description: null, author: null, image: null, seconds: null }]);
    expect(items(t)[0]).toMatchObject({ found: true, title: pasta.title });
  });

  it("cuts a very long caption", async () => {
    const t = createTestKit();
    await send(t, pasta.url, [{ ...pasta, description: "x".repeat(5000) }]);
    expect(items(t)[0].description).toHaveLength(1500);
  });

  it("stops at the limit and says so", async () => {
    const t = createTestKit();
    for (let i = 0; i < MAX_LINKS; i++) await t.kit.store.put("links", `k${i}`, { canonical: `c${i}`, at: i } as never, i);
    await send(t, pasta.url, [pasta]);
    expect(t.sent[0].text).toMatch(/most links I can keep/);
    expect(items(t)).toHaveLength(MAX_LINKS);
    expect(t.reactions).toEqual([]);
  });
});

describe("finding", () => {
  async function two() {
    const t = createTestKit();
    await send(t, pasta.url, [pasta]);
    await send(t, `for my back ${yoga.url}`, [yoga]);
    t.sent.length = 0;
    return t;
  }

  it("finds by title, caption, who posted and note", async () => {
    const t = await two();
    await t.message(plugin, "find garlic pasta");
    expect(t.sent[0].text).toContain("Creamy garlic pasta");
    expect(t.sent[0].text).not.toContain("stretches");
    await t.message(plugin, "search stretches");
    expect(t.sent[1].text).toContain(yoga.url);
    await t.message(plugin, "find yogawithmira");
    expect(t.sent[2].text).toContain(yoga.url);
    await t.message(plugin, "find back");
    expect(t.sent[3].text).toContain(yoga.url);
  });

  it("finds by site and kind", async () => {
    const t = await two();
    await t.message(plugin, "find instagram reels");
    expect(t.sent[0].text).toContain(yoga.url);
    expect(t.sent[0].text).not.toContain(pasta.url);
  });

  it("gives a single result a ref, so it can be reacted to", async () => {
    const t = await two();
    await t.message(plugin, "find pasta");
    expect(t.sent[0].ref).toEqual({ kind: "link", ids: [items(t).find((i) => i.site === "YouTube")!.id] });
  });

  it("says when nothing matches or nothing is saved", async () => {
    const t = await two();
    await t.message(plugin, "find lasagna");
    expect(t.sent[0].text).toMatch(/Nothing saved matches "lasagna"/);
    const empty = createTestKit();
    await empty.message(plugin, "find pasta");
    expect(empty.sent[0].text).toMatch(/Nothing is saved yet/);
  });

  it("lists the latest, newest first", async () => {
    const t = await two();
    await t.message(plugin, "recent");
    expect(t.sent[0].text.indexOf(yoga.url)).toBeLessThan(t.sent[0].text.indexOf(pasta.url));
  });

  it("counts by site", async () => {
    const t = await two();
    await t.message(plugin, "count");
    expect(t.sent[0].text).toMatch(/2 links saved/);
  });

  it("hands anything else to the intent model, and searches on its say", async () => {
    const t = await two();
    await t.message(plugin, "where is that pasta thing");
    expect(t.unsures).toHaveLength(1);
    await t.intent(plugin, "where is that pasta thing", "search");
    expect(t.sent[0].text).toContain(pasta.url);
    await t.intent(plugin, "what did I save lately", "recent");
    expect(t.sent[1].text).toContain("Latest");
    await t.intent(plugin, "how does this work", "help");
    expect(t.sent[2].text).toContain("*MediaStore*");
  });
});

describe("marking", () => {
  async function one() {
    const t = createTestKit();
    await send(t, pasta.url, [pasta]);
    t.sent.length = 0;
    t.reactions.length = 0;
    return { t, ref: t.marks[0] };
  }

  it("likes with a heart and takes it back when the reaction goes", async () => {
    const { t, ref } = await one();
    await t.react(plugin, "❤️", ref);
    expect(items(t)[0].liked).toBe(true);
    await t.react(plugin, null, ref);
    expect(items(t)[0].liked).toBe(false);
  });

  it("marks important with a star, and a changed reaction swaps the mark", async () => {
    const { t, ref } = await one();
    await t.react(plugin, "❤️", ref);
    await t.react(plugin, "⭐", ref);
    expect(items(t)[0]).toMatchObject({ liked: false, important: true });
    await t.react(plugin, "😂", ref);
    expect(items(t)[0]).toMatchObject({ liked: false, important: false });
  });

  it("keeps a mark set in words when a reaction comes and goes", async () => {
    const { t, ref } = await one();
    await t.message(plugin, "like", ref);
    await t.react(plugin, "⭐", ref);
    await t.react(plugin, null, ref);
    expect(items(t)[0]).toMatchObject({ liked: true, important: false });
    expect(t.reactions).toEqual(["👍"]);
  });

  it("lists liked and important", async () => {
    const { t, ref } = await one();
    await t.message(plugin, "liked");
    expect(t.sent[0].text).toMatch(/haven't liked any/);
    await t.react(plugin, "💜", ref);
    await t.message(plugin, "liked");
    expect(t.sent[1].text).toContain(pasta.url);
    await t.message(plugin, "important");
    expect(t.sent[2].text).toMatch(/Nothing is marked important/);
  });

  it("ignores a reaction with a ref that isn't a link's", async () => {
    const { t } = await one();
    await t.react(plugin, "❤️", { kind: "other" });
    await t.react(plugin, "❤️", { kind: "link", ids: ["gone"] });
    expect(items(t)[0].liked).toBeUndefined();
  });
});

describe("replying to a link", () => {
  async function one() {
    const t = createTestKit();
    await send(t, pasta.url, [pasta]);
    t.sent.length = 0;
    t.reactions.length = 0;
    return { t, ref: t.marks[0] };
  }

  it("keeps the reply as the note, and clears it", async () => {
    const { t, ref } = await one();
    await t.message(plugin, "Cook this for Asha", ref);
    expect(items(t)[0].note).toBe("Cook this for Asha");
    expect(t.reactions).toEqual(["👍"]);
    await t.message(plugin, "no note", ref);
    expect(items(t)[0].note).toBeNull();
  });

  it("deletes, and forgets the address so it can be saved again", async () => {
    const { t, ref } = await one();
    await t.message(plugin, "delete", ref);
    expect(items(t)).toHaveLength(0);
    expect(Object.keys(t.dump()).filter((k) => k.startsWith("urls/"))).toHaveLength(0);
    await t.message(plugin, "a note", ref);
    expect(t.sent[0].text).toMatch(/isn't saved any more/);
  });

  it("marks and unmarks in words", async () => {
    const { t, ref } = await one();
    await t.message(plugin, "important", ref);
    await t.message(plugin, "like", ref);
    expect(items(t)[0]).toMatchObject({ liked: true, important: true });
    await t.message(plugin, "unlike", ref);
    await t.message(plugin, "not important", ref);
    expect(items(t)[0]).toMatchObject({ liked: false, important: false });
  });

  it("undo removes the last link", async () => {
    const { t } = await one();
    await t.message(plugin, "undo");
    expect(items(t)).toHaveLength(0);
    expect(t.sent[0].text).toMatch(/Removed \*Creamy garlic pasta/);
    await t.message(plugin, "undo");
    expect(t.sent[1].text).toBe("Nothing is saved yet.");
  });
});

describe("groups", () => {
  it("makes a group, saves under it and searches only it there", async () => {
    const t = createTestKit();
    await t.message(plugin, "new group Recipes");
    expect(t.groups.get("recipes")).toMatchObject({ name: "🎬 Recipes" });
    await send(t, pasta.url, [pasta], "recipes");
    await send(t, yoga.url, [yoga]);
    expect(items(t).find((i) => i.site === "YouTube")!.group).toBe("recipes");
    t.sent.length = 0;
    await t.message(plugin, "recent", null, "recipes");
    expect(t.sent[0].text).toContain(pasta.url);
    expect(t.sent[0].text).not.toContain(yoga.url);
    expect(t.sent[0].group).toBe("recipes");
    await t.message(plugin, "find recipes");
    expect(t.sent[1].text).toContain(pasta.url);
    await t.message(plugin, "groups");
    expect(t.sent[2].text).toContain("*Recipes*: 1 link");
  });

  it("refuses a second group of the same name and a nameless one", async () => {
    const t = createTestKit();
    await t.message(plugin, "new group recipes");
    await t.message(plugin, "add group Recipes");
    expect(t.sent[1].text).toMatch(/already have a group/);
    await t.message(plugin, "new group !!!");
    expect(t.sent[2].text).toMatch(/Give the group a name/);
  });

  it("moves a link by reply and closes a group without losing its links", async () => {
    const t = createTestKit();
    await t.message(plugin, "new group recipes");
    await send(t, pasta.url, [pasta]);
    const ref = t.marks[0];
    await t.message(plugin, "move to recipes", ref);
    expect(items(t)[0].group).toBe("recipes");
    await t.message(plugin, "move to gym", ref);
    expect(t.sent.at(-1)!.text).toMatch(/don't have a group called "gym"/);
    await t.message(plugin, "close group recipes");
    expect(t.groups.has("recipes")).toBe(false);
    expect(items(t)[0].group).toBe("recipes");
    await t.message(plugin, "close group recipes");
    expect(t.sent.at(-1)!.text).toMatch(/don't have a group/);
    await t.message(plugin, "move to main", ref);
    expect(items(t)[0].group).toBeNull();
  });

  it("makes a group from a plain sentence", async () => {
    const t = createTestKit();
    await t.intent(plugin, "can you make a group for workouts", "new_group");
    expect(t.groups.has("workouts")).toBe(true);
    await t.intent(plugin, "I want to sort these", "new_group");
    expect(t.sent.at(-1)!.text).toMatch(/What should it be called/);
    await t.intent(plugin, "what groups do I have", "groups");
    expect(t.sent.at(-1)!.text).toContain("workouts");
  });
});

describe("web page", () => {
  it("loads links newest first with group counts", async () => {
    const t = createTestKit();
    await t.message(plugin, "new group recipes");
    await send(t, pasta.url, [pasta], "recipes");
    await send(t, yoga.url, [yoga]);
    const data = (await t.load(plugin)) as unknown as { total: number; links: { url: string; image: string | null }[]; groups: { key: string; count: number }[] };
    expect(data.total).toBe(2);
    expect(data.links.map((l) => l.url)).toEqual([yoga.url, pasta.url]);
    expect(data.links[1].image).toBe(pasta.image);
    expect(data.groups).toEqual([{ key: "recipes", name: "recipes", closed: false, count: 1 }]);
    expect(((await t.load(plugin, { limit: 1 })) as unknown as { links: unknown[] }).links).toHaveLength(1);
  });

  it("changes a link through its actions", async () => {
    const t = createTestKit();
    await send(t, pasta.url, [pasta]);
    const id = items(t)[0].id;
    await t.act(plugin, "setLiked", { id, on: true });
    await t.act(plugin, "setImportant", { id, on: true });
    await t.act(plugin, "setNote", { id, note: "  dinner  " });
    expect(items(t)[0]).toMatchObject({ liked: true, important: true, note: "dinner" });
    await t.act(plugin, "setNote", { id, note: "" });
    await t.act(plugin, "setLiked", { id, on: false });
    expect(items(t)[0]).toMatchObject({ liked: false, note: null });
    await expect(t.act(plugin, "move", { id, group: "nope" })).rejects.toThrow(/doesn't exist/);
    await t.act(plugin, "createGroup", { name: "Recipes" });
    await t.act(plugin, "move", { id, group: "recipes" });
    expect(items(t)[0].group).toBe("recipes");
    await t.act(plugin, "move", { id, group: null });
    expect(items(t)[0].group).toBeNull();
    await expect(t.act(plugin, "createGroup", { name: "recipes" })).rejects.toThrow(/already have/);
    await t.act(plugin, "closeGroup", { key: "recipes" });
    expect(t.groups.has("recipes")).toBe(false);
    await t.act(plugin, "remove", { id });
    expect(items(t)).toHaveLength(0);
  });
});

describe("helpers", () => {
  it("slugs names and hashes addresses steadily", () => {
    expect(slug("My Recipes!")).toBe("my-recipes");
    expect(hash("https://a.test/1")).toBe(hash("https://a.test/1"));
    expect(hash("https://a.test/1")).not.toBe(hash("https://a.test/2"));
  });

  it("drops filler words and plurals from a search", () => {
    expect(words("where is that pasta recipes video I saved")).toEqual(["pasta", "recipe"]);
    expect(words("find the")).toEqual([]);
  });

  it("ranks a note above a title above a caption, and needs every word the best has", () => {
    const base = { title: null, author: null, where: "", description: null, note: null };
    const rows = [
      { ...base, at: 1, id: "caption", description: "pasta night" },
      { ...base, at: 2, id: "title", title: "pasta" },
      { ...base, at: 3, id: "note", note: "pasta" },
      { ...base, at: 4, id: "both", title: "garlic pasta" },
    ];
    expect(rank(rows, "pasta").map((r) => r.id)).toEqual(["note", "both", "title", "caption"]);
    expect(rank(rows, "garlic pasta").map((r) => r.id)).toEqual(["both"]);
    expect(rank(rows, "pas").map((r) => r.id)).toContain("note");
    expect(rank(rows, "the")).toEqual([]);
  });

  it("answers an unknown message with the fallback", async () => {
    const t = createTestKit();
    await t.message(plugin, "hmm ok");
    expect(t.unsures[0]).toMatch(/I didn't get that/);
    await t.message(plugin, "help");
    expect(t.sent[0].text).toContain("*MediaStore*");
  });
});
