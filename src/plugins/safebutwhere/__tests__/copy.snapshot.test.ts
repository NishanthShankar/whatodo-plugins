/**
 * Every reply SafeButWhere can give, captured exactly. This file exists so the wording can be
 * moved or rewritten on purpose and never by accident: a change here is a change people see.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { useRandom } from "../../../copy";
import { createTestKit, photo } from "../../../testing";
import plugin, { MAX_THINGS } from "../index";
import { copy } from "../copy";

type T = ReturnType<typeof createTestKit>;

// The first wording of every message, so a snapshot never depends on chance.
beforeAll(() => useRandom(() => 0));
afterAll(() => useRandom());

const said = (t: T) => ({ sent: t.sent, reactions: t.reactions, unsures: t.unsures });
const sendPhoto = (t: T, id: string, caption = "") => t.message(plugin, caption, null, null, undefined, undefined, { photos: [photo(id)] });
const home = { lat: 12.9716, lng: 77.5946, name: "Home", address: "12 Lake Road" };
const sendPlace = (t: T, text = "") => t.message(plugin, text, null, null, undefined, undefined, { place: home });

describe("safebutwhere copy: what the plugin says about itself", () => {
  it("welcome, help and group name", () => {
    expect({ welcome: plugin.welcome, help: plugin.help, groupName: plugin.groupName }).toMatchSnapshot();
  });

  it("help through the intent model, and a message it can't read", async () => {
    const t = createTestKit();
    await t.intent(plugin, "how does this work", "help");
    await t.message(plugin, "hmm");
    expect(said(t)).toMatchSnapshot();
  });
});

describe("safebutwhere copy: keeping", () => {
  it("the first thing, as words", async () => {
    const t = createTestKit();
    await t.message(plugin, "passport, blue file, top shelf");
    await t.message(plugin, "spare key under the pot");
    expect(said(t)).toMatchSnapshot();
  });

  it("the first thing, as a photo with no words", async () => {
    const t = createTestKit();
    await sendPhoto(t, "p1");
    expect(said(t)).toMatchSnapshot();
  });

  it("full", async () => {
    const t = createTestKit();
    for (let i = 0; i < MAX_THINGS; i++) await t.kit.store.put("things", `x${i}`, { what: `thing ${i}`, tags: [], photo: null, place: null, at: i }, i);
    await t.message(plugin, "passport, blue file");
    expect(said(t)).toMatchSnapshot();
    expect(copy.full.wordings).toBe(2);
  });
});

describe("safebutwhere copy: finding", () => {
  it("answers: with a photo, tags and a position; words alone; more than fit; nothing", async () => {
    const t = createTestKit({ hour: 9 });
    await sendPhoto(t, "p1", "passport, blue file #documents");
    await sendPlace(t);
    t.setHour(10);
    for (let i = 1; i <= 5; i++) await t.message(plugin, `charger ${i}, drawer ${i}`);
    t.sent.length = 0;
    await t.message(plugin, "where is my passport");
    await t.message(plugin, "find charger");
    await t.message(plugin, "where is my umbrella");
    await t.message(plugin, "umbrella");
    await t.message(plugin, "where is it");
    expect(said(t)).toMatchSnapshot();
  });

  it("near a position, and nothing near", async () => {
    const t = createTestKit({ hour: 9 });
    await t.message(plugin, "documents in mum's locker");
    await sendPlace(t);
    t.setHour(20);
    t.sent.length = 0;
    await t.message(plugin, "", null, null, undefined, undefined, { place: { lat: 12.9719, lng: 77.5946, name: null, address: null } });
    await t.message(plugin, "", null, null, undefined, undefined, { place: { lat: 20, lng: 77.5946, name: null, address: null } });
    expect(said(t)).toMatchSnapshot();
  });

  it("recent, tags, count, and each when there is nothing", async () => {
    const empty = createTestKit();
    for (const m of ["recent", "tags", "count", "where is my passport", "undo"]) await empty.message(plugin, m);
    const t = createTestKit();
    await sendPhoto(t, "p1");
    await t.message(plugin, "passport, blue file #documents #travel-papers");
    await t.message(plugin, "spare key under the pot");
    t.sent.length = 0;
    for (const m of ["recent", "tags", "count"]) await t.message(plugin, m);
    expect({ empty: said(empty), filled: said(t) }).toMatchSnapshot();
  });
});

describe("safebutwhere copy: groups", () => {
  it("none yet, an empty one, one in full, a long one as a list, and the list of groups", async () => {
    const t = createTestKit();
    await t.message(plugin, "groups");
    await t.message(plugin, "🔑");
    await sendPhoto(t, "p1", "spare key #keys");
    await t.react(plugin, "🔑", t.marks.at(-1)!);
    for (let i = 1; i <= 4; i++) {
      await t.message(plugin, `charger ${i}, drawer ${i}`);
      await t.react(plugin, "🔌", t.marks.at(-1)!);
    }
    await t.message(plugin, "🔑");
    await t.message(plugin, "🔌");
    await t.message(plugin, "groups");
    await t.message(plugin, "recent");
    expect(said(t)).toMatchSnapshot();
  });
});

describe("safebutwhere copy: changing", () => {
  it("undo, a reply to something gone, a reply it can't read", async () => {
    const t = createTestKit();
    await t.message(plugin, "passport, blue file");
    const ref = t.marks.at(-1)!;
    await sendPhoto(t, "p1");
    t.sent.length = 0;
    await t.message(plugin, "undo");
    await t.message(plugin, "undo");
    await t.message(plugin, "passport, shelf", ref);
    expect(said(t)).toMatchSnapshot();
  });
});
