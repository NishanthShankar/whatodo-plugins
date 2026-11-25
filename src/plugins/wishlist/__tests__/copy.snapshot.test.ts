/**
 * Every reply Wishlist can give, captured exactly. This file exists so the wording can be
 * moved or rewritten on purpose and never by accident: a change here is a change people see.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useRandom } from "../../../sdk";
import { createTestKit, link } from "../../../testing";
import { copy } from "../copy";
import plugin, { MAX_ITEMS, MAX_LISTS, MAX_LIST_ITEMS } from "../index";

type T = ReturnType<typeof createTestKit>;

/** Everything the plugin put on WhatsApp so far. */
const said = (t: T) => ({ sent: t.sent, asked: t.asked, reactions: t.reactions, unsures: t.unsures, groups: [...t.groups] });

const phones = link("https://www.amazon.in/dp/B0PHONES", { site: "amazon.in", title: "Sony WH-1000XM5 Headphones", image: "https://img.example/phones.jpg", price: 24990, currency: "INR" });
const lamp = link("https://example.com/lamp", { title: "Brass desk lamp", price: 49.5, currency: "USD" });
const mug = link("https://example.com/mug", { title: "Stoneware mug" });
const send = (t: T, text: string, links: ReturnType<typeof link>[], group: string | null = null, from?: string) => t.message(plugin, text, null, group, from, links);

// The first wording of each message, so the snapshot never depends on a draw.
beforeEach(() => useRandom(() => 0));
afterEach(() => useRandom());

describe("wishlist copy: what the plugin says about itself", () => {
  it("welcome, help and group name", () => {
    expect({ welcome: plugin.welcome, help: plugin.help, groupName: plugin.groupName }).toMatchSnapshot();
  });

  it("help through the intent model, and a message it can't read", async () => {
    const t = createTestKit();
    await t.intent(plugin, "how does this work", "help");
    await t.message(plugin, "what a day");
    expect(said(t)).toMatchSnapshot();
  });
});

describe("wishlist copy: adding and showing", () => {
  it("the first thing, with and without a price", async () => {
    const a = createTestKit();
    await send(a, phones.url, [phones]);
    const b = createTestKit();
    await send(b, mug.url, [mug]);
    expect({ priced: said(a), unpriced: said(b) }).toMatchSnapshot();
  });

  it("a list, what was bought, every list, and nothing at all", async () => {
    const t = createTestKit();
    await t.message(plugin, "list");
    await t.message(plugin, "bought");
    await send(t, `${phones.url} #audio`, [phones]);
    await send(t, lamp.url, [lamp]);
    await t.message(plugin, "socks 300");
    await t.react(plugin, "✅", t.marks[2]);
    await t.message(plugin, "list");
    await t.message(plugin, "bought");
    await t.message(plugin, "new list diwali");
    await send(t, mug.url, [mug]);
    await t.message(plugin, "new group Trip to Goa");
    await t.message(plugin, "lists");
    await t.message(plugin, "use wishlist");
    await t.message(plugin, "undo");
    expect(said(t)).toMatchSnapshot();
  });

  it("more than fits in one message", async () => {
    const t = createTestKit();
    for (let i = 1; i <= 12; i++) await t.message(plugin, `thing ${i} ${i * 100}`);
    await t.message(plugin, "list");
    expect(t.sent.at(-1)).toMatchSnapshot();
  });

  it("everything bought", async () => {
    const t = createTestKit();
    await t.message(plugin, "socks 300");
    await t.message(plugin, "bought", t.marks[0]);
    await t.message(plugin, "list");
    expect(t.sent.at(-1)).toMatchSnapshot();
  });
});

describe("wishlist copy: lists, moving and deleting", () => {
  it("naming, renaming, moving and the questions", async () => {
    const t = createTestKit();
    await t.message(plugin, "new list");
    await t.message(plugin, "new list ***");
    await t.message(plugin, "new list Gifts");
    await t.message(plugin, "new list gifts");
    await t.message(plugin, "rename gifts to Presents");
    await t.message(plugin, "rename nothing to Something");
    await t.message(plugin, "use nothing");
    await send(t, mug.url, [mug]);
    const ref = t.marks[0];
    await t.message(plugin, "move", ref);
    await t.answer(plugin, t.asked.at(-1)!.ref, 0);
    await t.message(plugin, "move to nowhere", ref);
    await t.message(plugin, "delete", ref);
    await t.message(plugin, "450", ref);
    await t.message(plugin, "delete list presents");
    await t.answer(plugin, t.asked.at(-1)!.ref, 1);
    await t.message(plugin, "delete list presents");
    await t.answer(plugin, t.asked.at(-1)!.ref, 0);
    await t.message(plugin, "delete list nothing");
    await t.message(plugin, "currency");
    await t.message(plugin, "currency eur");
    expect(said(t)).toMatchSnapshot();
  });

  it("a group the person already had", async () => {
    const t = createTestKit();
    await t.group(plugin, "joined", "x-home", "Home stuff");
    expect(said(t)).toMatchSnapshot();
  });

  it("limits", () => {
    expect([copy.tooMany({ max: MAX_ITEMS }), copy.listFull({ name: "Wishlist", max: MAX_LIST_ITEMS }), copy.tooManyLists({ max: MAX_LISTS }), copy.noOtherList(), copy.listGone(), copy.itemGone(), copy.ownerOnly(), copy.noLink()]).toMatchSnapshot();
  });
});

describe("wishlist copy: sharing", () => {
  it("the message to forward, in each wording, for the first list and a named one", () => {
    const out: string[] = [];
    for (let i = 0; i < copy.shareText.wordings; i++) {
      useRandom(() => i / copy.shareText.wordings);
      out.push(copy.shareText({ name: "Wishlist", url: "https://zelfred.com/s/abc", first: true }), copy.shareText({ name: "Diwali", url: "https://zelfred.com/s/abc", first: false }));
    }
    expect(out).toMatchSnapshot();
  });

  it("sharing, stopping, and the page's own words", async () => {
    const t = createTestKit();
    await t.message(plugin, "stop sharing");
    await t.message(plugin, "share");
    await t.message(plugin, "stop sharing");
    expect({ said: said(t), page: [copy.pageIntro({ want: 3, got: 1 }), copy.pageIntro({ want: 1, got: 0 }), copy.pageIntro({ want: 0, got: 2 }), copy.pageIntro({ want: 0, got: 0 }), copy.pageBoughtHeading(), copy.pageBought()] }).toMatchSnapshot();
  });
});
