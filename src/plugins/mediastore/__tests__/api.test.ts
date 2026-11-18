import { describe, expect, it } from "vitest";
import { createTestKit, link } from "../../../testing";
import plugin from "../index";

const pasta = link("https://youtu.be/aaa", { canonical: "https://www.youtube.com/watch?v=aaa", site: "YouTube", kind: "short", title: "Creamy garlic pasta in 10 minutes", description: "Weeknight dinner #recipe", author: "Kitchen Stories", image: "https://i.ytimg.com/vi/aaa/hq.jpg", seconds: 58 });
const yoga = link("https://www.instagram.com/reel/bbb/", { canonical: "https://www.instagram.com/reel/bbb/", site: "Instagram", kind: "reel", description: "Morning stretches for a stiff back", author: "yogawithmira" });
const tap = link("https://example.com/fix-a-tap", { canonical: "https://example.com/fix-a-tap", title: "How to fix a dripping tap" });

type T = ReturnType<typeof createTestKit>;
type Out = { total: number; next: string | null; links: { id: string; title: string | null; url: string; group: { key: string; name: string } | null; liked: boolean; savedBy: string | null; savedAt: string }[] };
const send = (t: T, text: string, links: ReturnType<typeof link>[], group: string | null = null, from?: string) => t.message(plugin, text, null, group, from, links);
const links = async (t: T, params: Record<string, string> = {}) => (await t.api(plugin, "links", params)) as unknown as Out;

async function three(t: T) {
  await send(t, "https://youtu.be/aaa", [pasta]);
  await t.message(plugin, "new group recipes");
  await send(t, "https://www.instagram.com/reel/bbb/", [yoga], "recipes", "Mira");
  await send(t, "https://example.com/fix-a-tap", [tap]);
}

describe("reading links from another system", () => {
  it("lists them newest first, a page at a time", async () => {
    const t = createTestKit();
    await three(t);
    const first = await links(t, { limit: "2" });
    expect(first.total).toBe(3);
    expect(first.links.map((l) => l.url)).toEqual(["https://example.com/fix-a-tap", "https://www.instagram.com/reel/bbb/"]);
    const rest = await links(t, { limit: "2", after: first.next! });
    expect(rest.links.map((l) => l.url)).toEqual(["https://youtu.be/aaa"]);
    expect(rest.next).toBeNull();
  });

  it("filters by group, likes and words, and names who sent it without their id", async () => {
    const t = createTestKit();
    await three(t);
    const inGroup = await links(t, { group: "Recipes" });
    expect(inGroup.links).toHaveLength(1);
    expect(inGroup.links[0]).toMatchObject({ group: { key: "recipes", name: "recipes" }, savedBy: "Mira", liked: false });
    expect(JSON.stringify(inGroup)).not.toContain('"by"');
    expect((await links(t, { group: "main" })).total).toBe(2);
    expect((await links(t, { group: "nope" })).total).toBe(0);
    expect((await links(t, { q: "pasta dinner" })).links.map((l) => l.title)).toEqual(["Creamy garlic pasta in 10 minutes"]);
    expect((await links(t, { liked: "true" })).total).toBe(0);
    expect(inGroup.links[0].savedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
  });

  it("gives one link by id, and the groups with their counts", async () => {
    const t = createTestKit();
    await three(t);
    const id = (await links(t)).links[0].id;
    expect(await t.api(plugin, "link", { id })).toMatchObject({ link: { id, title: "How to fix a dripping tap" } });
    expect(await t.api(plugin, "link", { id: "nope" })).toEqual({ link: null });
    expect(await t.api(plugin, "groups")).toMatchObject({ main: { links: 2 }, groups: [{ key: "recipes", links: 1, closed: false }] });
  });
});

describe("telling another system what happened", () => {
  it("says when a link is added, changed, moved and deleted, and when groups come and go", async () => {
    const t = createTestKit();
    await send(t, "https://youtu.be/aaa", [pasta]);
    const id = (await links(t)).links[0].id;
    await t.message(plugin, "new group recipes");
    await t.act(plugin, "setLiked", { id, on: true });
    await t.act(plugin, "move", { id, group: "recipes" });
    await t.act(plugin, "remove", { id });
    await t.message(plugin, "close group recipes");
    expect(t.emitted.map((e) => e.event)).toEqual(["link.added", "group.added", "link.updated", "link.moved", "link.deleted", "group.closed"]);
    expect(t.emitted[2].data).toMatchObject({ link: { id, liked: true } });
    expect(t.emitted[3].data).toMatchObject({ link: { group: { key: "recipes" } } });
    expect(t.emitted[4].data).toMatchObject({ link: { id, url: "https://youtu.be/aaa" } });
  });

  it("only emits events it has listed", () => {
    expect(Object.keys(plugin.api!.events!).sort()).toEqual(["group.added", "group.closed", "link.added", "link.deleted", "link.moved", "link.updated"]);
  });
});

describe("limited to some groups", () => {
  it("a key limited to a group sees only that group, whatever it asks for", async () => {
    const t = createTestKit();
    await three(t);
    const only = { groups: ["recipes"] };
    const seen = (await t.api(plugin, "links", {}, only)) as unknown as Out;
    expect(seen.links.map((l) => l.url)).toEqual(["https://www.instagram.com/reel/bbb/"]);
    expect(((await t.api(plugin, "links", { group: "main" }, only)) as unknown as Out).total).toBe(0);
    const outside = (await links(t, { group: "main" })).links[0].id;
    expect(await t.api(plugin, "link", { id: outside }, only)).toEqual({ link: null });
    expect(await t.api(plugin, "groups", {}, only)).toMatchObject({ main: null, groups: [{ key: "recipes" }] });
    expect(((await t.api(plugin, "links", {}, { groups: [null] })) as unknown as Out).total).toBe(2);
  });

  it("reads several groups at once", async () => {
    const t = createTestKit();
    await three(t);
    expect((await links(t, { group: "recipes, main" })).total).toBe(3);
    expect((await links(t, { group: "recipes,nope" })).total).toBe(1);
  });

  it("says which group each event happened in, and both groups for a move", async () => {
    const t = createTestKit();
    await send(t, "https://youtu.be/aaa", [pasta]);
    const id = (await links(t)).links[0].id;
    await t.message(plugin, "new group recipes");
    await t.act(plugin, "move", { id, group: "recipes" });
    await t.act(plugin, "setLiked", { id, on: true });
    await t.act(plugin, "remove", { id });
    expect(t.emitted.map((e) => [e.event, e.group])).toEqual([
      ["link.added", null],
      ["group.added", "recipes"],
      ["link.moved", [null, "recipes"]],
      ["link.updated", "recipes"],
      ["link.deleted", "recipes"],
    ]);
    expect(t.emitted[2].data).toMatchObject({ from: null, link: { group: { key: "recipes" } } });
  });
});
