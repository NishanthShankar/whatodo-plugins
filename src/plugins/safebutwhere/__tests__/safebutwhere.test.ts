import { describe, expect, it } from "vitest";
import { createTestKit, photo } from "../../../testing";
import plugin, { ALBUM_MS, MAX_THINGS, NEAR_M, type Thing } from "../index";
import type { Place } from "../../../sdk";
import { looksKept, metres, rank, read, sayDay, shortAsTag } from "../words";

type T = ReturnType<typeof createTestKit>;

const things = (t: T) =>
  Object.entries(t.dump())
    .filter(([k]) => k.startsWith("things/"))
    .map(([, v]) => v as unknown as Thing);
const sendPhoto = (t: T, id: string, caption = "") => t.message(plugin, caption, null, null, undefined, undefined, { photos: [photo(id)] });
const home: Place = { lat: 12.9716, lng: 77.5946, name: "Home", address: null };
const sendPlace = (t: T, place: Place = home, text = "") => t.message(plugin, text, null, null, undefined, undefined, { place });

describe("safebutwhere: reading words", () => {
  it("takes tags out of the words and keeps the rest as written", () => {
    expect(read("Passport, blue file #documents #Travel-Stuff")).toEqual({ what: "Passport, blue file", tags: ["documents", "travel stuff"] });
    expect(read("#keys")).toEqual({ what: null, tags: ["keys"] });
  });

  it("a short line is also a tag, a longer one is not", () => {
    expect(shortAsTag("passport")).toEqual(["passport"]);
    expect(shortAsTag("spare car key")).toEqual(["spare car key"]);
    expect(shortAsTag("blue file on the top shelf")).toEqual([]);
    expect(shortAsTag("passport, blue file")).toEqual([]);
  });

  it("tells a thing with a place from a few plain words", () => {
    expect(looksKept("passport, blue file")).toBe(true);
    expect(looksKept("spare key under the pot")).toBe(true);
    expect(looksKept("charger #office")).toBe(true);
    expect(looksKept("passport")).toBe(false);
    expect(looksKept("spare key")).toBe(false);
  });

  it("ranks tags above words, and needs every word the best match has", () => {
    const items = [
      { id: "a", at: 1, tags: ["documents"], what: "passport, blue file", where: null },
      { id: "b", at: 2, tags: [], what: "blue umbrella, hall", where: null },
      { id: "c", at: 3, tags: ["passport"], what: null, where: null },
    ];
    expect(rank(items, "where is my passport").map((i) => i.id)).toEqual(["c", "a"]);
    expect(rank(items, "blue file").map((i) => i.id)).toEqual(["a"]);
    expect(rank(items, "where is it")).toEqual([]);
  });

  it("measures distance and says a day", () => {
    expect(metres(home, home)).toBe(0);
    expect(metres(home, { lat: 12.9726, lng: 77.5946 })).toBeGreaterThan(100);
    expect(sayDay("2026-03-03", "2026-11-15")).toBe("3 March");
    expect(sayDay("2025-03-03", "2026-11-15")).toBe("3 March 2025");
  });
});

describe("safebutwhere: keeping", () => {
  it("explains once, after the first thing, then only reacts", async () => {
    const t = createTestKit();
    await t.message(plugin, "passport, blue file, top shelf");
    expect(t.reactions).toEqual(["👍"]);
    expect(t.sent).toHaveLength(1);
    await t.message(plugin, "spare key under the pot");
    expect(t.reactions).toEqual(["👍", "👍"]);
    expect(t.sent).toHaveLength(1);
    expect(things(t).map((x) => x.what)).toEqual(["passport, blue file, top shelf", "spare key under the pot"]);
  });

  it("keeps a photo with no words", async () => {
    const t = createTestKit();
    await sendPhoto(t, "p1");
    expect(things(t)).toEqual([{ what: null, tags: [], photo: "p1", place: null, at: t.kit.now }]);
    expect(t.reactions).toEqual(["👍"]);
  });

  it("keeps a photo with its caption, and a short caption is a tag too", async () => {
    const t = createTestKit();
    await sendPhoto(t, "p1", "passport #documents");
    expect(things(t)[0]).toMatchObject({ what: "passport", tags: ["documents", "passport"], photo: "p1" });
  });

  it("words sent after several photos go on every one of them", async () => {
    const t = createTestKit();
    await sendPhoto(t, "p1");
    await sendPhoto(t, "p2");
    await sendPhoto(t, "p3");
    await t.message(plugin, "jewellery");
    const all = things(t);
    expect(all).toHaveLength(3);
    for (const x of all) expect(x).toMatchObject({ what: "jewellery", tags: ["jewellery"] });
    // The words are theirs; a second line is a thing of its own.
    await t.message(plugin, "bank locker, key in the red pouch");
    expect(things(t)).toHaveLength(4);
  });

  it("a caption on one photo of an album covers the others, before and after it", async () => {
    const t = createTestKit();
    await sendPhoto(t, "p1");
    await sendPhoto(t, "p2", "winter clothes, loft #storage");
    await sendPhoto(t, "p3");
    for (const x of things(t)) expect(x).toMatchObject({ what: "winter clothes, loft", tags: ["storage"] });
  });

  it("a photo sent long after a captioned one is on its own", async () => {
    const t = createTestKit({ hour: 10 });
    await sendPhoto(t, "p1", "passport");
    t.setHour(11);
    expect(60 * 60_000).toBeGreaterThan(ALBUM_MS);
    await sendPhoto(t, "p2");
    expect(things(t).map((x) => x.what).sort()).toEqual([null, "passport"].sort());
  });

  it("words long after a photo are not that photo's", async () => {
    const t = createTestKit({ hour: 10 });
    await sendPhoto(t, "p1");
    t.setHour(12);
    await t.message(plugin, "passport, blue file");
    expect(things(t)).toHaveLength(2);
    expect(things(t).find((x) => x.photo)!.what).toBeNull();
  });

  it("keeps the position shared right after a thing, on all of them", async () => {
    const t = createTestKit();
    await sendPhoto(t, "p1");
    await sendPhoto(t, "p2");
    await sendPlace(t);
    for (const x of things(t)) expect(x.place).toEqual(home);
    expect(t.reactions).toEqual(["👍", "👍", "👍"]);
  });

  it("a position with words and nothing before it is a thing of its own", async () => {
    const t = createTestKit({ hour: 9 });
    await sendPlace(t, home, "documents in mum's locker");
    expect(things(t)).toEqual([{ what: "documents in mum's locker", tags: [], photo: null, place: home, at: t.kit.now }]);
  });

  it("turns a new thing away when full, and doesn't leave the photo behind", async () => {
    const t = createTestKit();
    for (let i = 0; i < MAX_THINGS; i++) await t.kit.store.put("things", `x${i}`, { what: `thing ${i}`, tags: [], photo: null, place: null, at: i }, i);
    await sendPhoto(t, "p1");
    expect(t.removedFiles).toEqual(["p1"]);
    expect(t.sent.at(-1)!.text).toContain(String(MAX_THINGS));
    expect(things(t)).toHaveLength(MAX_THINGS);
  });
});

describe("safebutwhere: finding", () => {
  const filled = async () => {
    const t = createTestKit();
    await sendPhoto(t, "p1", "passport, blue file #documents");
    await t.message(plugin, "spare key under the pot");
    t.sent.length = 0;
    return t;
  };

  it("answers with the words, and the photo when there is one", async () => {
    const t = await filled();
    await t.message(plugin, "where is my passport");
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]).toMatchObject({ photo: "p1" });
    expect(t.sent[0].text).toContain("passport, blue file");
    await t.message(plugin, "find spare key");
    expect(t.sent[1].photo).toBeUndefined();
    expect(t.sent[1].text).toContain("under the pot");
  });

  it("takes a few plain words as a search", async () => {
    const t = await filled();
    await t.message(plugin, "passport");
    expect(t.sent[0].text).toContain("blue file");
    await t.message(plugin, "documents?");
    expect(t.sent[1].photo).toBe("p1");
  });

  it("says so when nothing matches, and is unsure about plain words it can't place", async () => {
    const t = await filled();
    await t.message(plugin, "where is my umbrella");
    expect(t.sent[0].text).toContain("umbrella");
    await t.message(plugin, "umbrella");
    expect(t.unsures).toHaveLength(1);
    expect(t.unsures[0]).toContain("umbrella");
  });

  it("shows three in full and counts the rest", async () => {
    const t = createTestKit();
    for (let i = 1; i <= 5; i++) await t.message(plugin, `charger ${i}, drawer ${i}`);
    t.sent.length = 0;
    await t.message(plugin, "find charger");
    expect(t.sent).toHaveLength(4);
    expect(t.sent[3].text).toContain("2 more");
  });

  it("shows what is kept near a position shared on its own", async () => {
    const t = createTestKit({ hour: 8 });
    await t.message(plugin, "documents in mum's locker");
    await sendPlace(t);
    t.setHour(20);
    t.sent.length = 0;
    await sendPlace(t, { lat: 12.9718, lng: 77.5946, name: null, address: null });
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].text).toContain("mum's locker");
    await sendPlace(t, { lat: 13.5, lng: 77.5946, name: null, address: null });
    expect(metres(home, { lat: 13.5, lng: 77.5946 })).toBeGreaterThan(NEAR_M);
    expect(t.sent).toHaveLength(2);
  });

  it("lists recent things, tags and the count", async () => {
    const t = await filled();
    await t.message(plugin, "recent");
    expect(t.sent[0].text).toContain("1. spare key under the pot");
    await t.message(plugin, "tags");
    expect(t.sent[1].text).toContain("#documents · 1");
    await t.message(plugin, "count");
    expect(t.sent[2].text).toContain("2 things kept, 1 with a photo");
  });

  it("works through the intent model", async () => {
    const t = await filled();
    await t.intent(plugin, "any idea where i left my passport", "find");
    expect(t.sent[0].photo).toBe("p1");
    await t.intent(plugin, "i am putting the drill with ravi next door", "keep");
    expect(things(t)).toHaveLength(3);
  });
});

describe("safebutwhere: changing", () => {
  it("a reply with words changes the thing, a tag is added, delete removes it and its photo", async () => {
    const t = createTestKit();
    await sendPhoto(t, "p1", "passport, blue file");
    const ref = t.marks.at(-1)!;
    await t.message(plugin, "passport, bank locker", ref);
    expect(things(t)[0].what).toBe("passport, bank locker");
    await t.message(plugin, "#documents", ref);
    expect(things(t)[0]).toMatchObject({ what: "passport, bank locker", tags: ["documents"] });
    await t.message(plugin, "delete", ref);
    expect(things(t)).toHaveLength(0);
    expect(t.removedFiles).toEqual(["p1"]);
  });

  it("a reply to an answer changes that thing", async () => {
    const t = createTestKit();
    await t.message(plugin, "passport, blue file");
    await t.message(plugin, "where is my passport");
    await t.message(plugin, "passport, with dad", t.sent.at(-1)!.ref);
    expect(things(t)[0].what).toBe("passport, with dad");
  });

  it("a reply to something already removed says so", async () => {
    const t = createTestKit();
    await t.message(plugin, "passport, blue file");
    const ref = t.marks.at(-1)!;
    await t.message(plugin, "undo");
    await t.message(plugin, "passport, shelf", ref);
    expect(t.sent.at(-1)!.text).toContain("isn't kept");
  });

  it("undo removes the last thing", async () => {
    const t = createTestKit();
    await t.message(plugin, "undo");
    expect(t.sent.at(-1)!.text).toContain("nothing to remove");
    await sendPhoto(t, "p1");
    await t.message(plugin, "undo");
    expect(things(t)).toHaveLength(0);
    expect(t.removedFiles).toEqual(["p1"]);
  });
});

describe("safebutwhere: the page", () => {
  it("loads things newest first, with tag counts", async () => {
    const t = createTestKit({ hour: 8 });
    await t.message(plugin, "passport, blue file #documents");
    t.setHour(9);
    await sendPhoto(t, "p1", "will #documents");
    const data = (await t.load(plugin)) as { total: number; things: { what: string; photo: string | null }[]; tags: { tag: string; count: number }[] };
    expect(data.total).toBe(2);
    expect(data.things.map((x) => x.what)).toEqual(["will", "passport, blue file"]);
    expect(data.tags[0]).toEqual({ tag: "documents", count: 2 });
  });

  it("adds, edits and removes", async () => {
    const t = createTestKit();
    t.addFile("up1");
    const made = (await t.act(plugin, "add", { what: "  drill,  garage ", tags: ["Tools", "#tools"], photo: "up1", place: { lat: 1, lng: 2 } })) as { id: string };
    expect(things(t)[0]).toMatchObject({ what: "drill, garage", tags: ["tools"], photo: "up1", place: { lat: 1, lng: 2, name: null, address: null } });
    await t.act(plugin, "edit", { id: made.id, what: "drill, shed", place: null });
    expect(things(t)[0]).toMatchObject({ what: "drill, shed", place: null, tags: ["tools"] });
    await t.act(plugin, "remove", { id: made.id });
    expect(things(t)).toHaveLength(0);
    expect(t.removedFiles).toEqual(["up1"]);
  });

  it("refuses an empty thing, and a photo that isn't this install's", async () => {
    const t = createTestKit();
    await expect(t.act(plugin, "add", {})).rejects.toThrow("photo or a few words");
    await expect(t.act(plugin, "add", { photo: "someone-elses" })).rejects.toThrow("photo or a few words");
    await expect(t.act(plugin, "edit", { id: "nope", what: "x" })).rejects.toThrow("isn't kept");
  });
});
