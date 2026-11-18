/**
 * Every reply MediaStore can give, captured exactly. This file exists so the wording can be
 * moved or rewritten on purpose and never by accident: a change here is a change people see.
 */
import { describe, expect, it } from "vitest";
import { createTestKit, link } from "../../../testing";
import plugin, { MAX_LINKS } from "../index";

type T = ReturnType<typeof createTestKit>;

/** Everything the plugin put on WhatsApp so far. */
const said = (t: T) => ({ sent: t.sent, asked: t.asked, reactions: t.reactions, unsures: t.unsures, groups: [...t.groups] });

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
});
const dead = link("https://www.instagram.com/reel/ccc/", { canonical: "https://www.instagram.com/reel/ccc/", site: "Instagram", kind: "reel", found: false });
/** A plain page nobody could say anything about: only its address is left to show. */
const bare = link("https://example.com/bare");
const long = link("https://example.com/long", { title: `A very long title ${"that goes on ".repeat(10)}and on` });
const numbered = (n: number) => link(`https://example.com/pasta/${n}`, { title: `Pasta idea ${n}`, author: n % 2 ? "Asha" : null });

const send = (t: T, text: string, links: ReturnType<typeof link>[], group: string | null = null, from?: string) => t.message(plugin, text, null, group, from, links);

describe("mediastore copy: what the plugin says about itself", () => {
  it("welcome, help and group name", () => {
    expect({ welcome: plugin.welcome, help: plugin.help, groupName: plugin.groupName }).toMatchSnapshot();
  });

  it("help, asked for in words and through the intent model", async () => {
    const t = createTestKit();
    await t.message(plugin, "help");
    await t.intent(plugin, "how does this work", "help");
    expect(said(t)).toMatchSnapshot();
  });
});

describe("mediastore copy: saving", () => {
  it("the first link, read", async () => {
    const t = createTestKit();
    await send(t, pasta.url, [pasta]);
    await send(t, yoga.url, [yoga]);
    expect(said(t)).toMatchSnapshot();
  });

  it("the first link, not read", async () => {
    const t = createTestKit();
    await send(t, dead.url, [dead]);
    expect(said(t)).toMatchSnapshot();
  });

  it("no room left", async () => {
    const t = createTestKit();
    for (let i = 0; i < MAX_LINKS; i++) await t.kit.store.put("links", `k${i}`, { canonical: `c${i}`, at: i } as never, i);
    await send(t, pasta.url, [pasta]);
    expect(said(t)).toMatchSnapshot();
  });

  it("a message that is not understood", async () => {
    const t = createTestKit();
    await t.message(plugin, "hmm ok");
    expect(said(t)).toMatchSnapshot();
  });
});

describe("mediastore copy: finding and listing", () => {
  it("with nothing saved", async () => {
    const t = createTestKit();
    await t.message(plugin, "find pasta");
    await t.message(plugin, "recent");
    await t.message(plugin, "liked");
    await t.message(plugin, "important");
    await t.message(plugin, "undo");
    await t.message(plugin, "count");
    await t.message(plugin, "groups");
    await t.intent(plugin, "where is that pasta thing", "search");
    await t.intent(plugin, "what did I save lately", "recent");
    await t.intent(plugin, "the ones I liked", "liked");
    await t.intent(plugin, "the important ones", "important");
    await t.intent(plugin, "what groups do I have", "groups");
    await t.intent(plugin, "take that back", "undo");
    expect(said(t)).toMatchSnapshot();
  });

  it("one result, several results, and none", async () => {
    const t = createTestKit();
    await send(t, pasta.url, [pasta]);
    await send(t, `for my back ${yoga.url}`, [yoga]);
    await send(t, `cook   this on sunday ${long.url}`, [long]);
    await send(t, bare.url, [bare]);
    await send(t, dead.url, [dead]);
    t.sent.length = 0;
    t.reactions.length = 0;
    await t.message(plugin, "find garlic pasta");
    await t.message(plugin, "find instagram reels");
    await t.message(plugin, "find lasagna");
    await t.message(plugin, `find ${"lasagna ".repeat(12)}`);
    await t.message(plugin, "search sunday");
    await t.message(plugin, `find ${"garlic pasta ".repeat(8)}`);
    await t.message(plugin, "recent");
    await t.message(plugin, "count");
    await t.intent(plugin, "where is that pasta thing", "search");
    await t.intent(plugin, "what did I save lately", "recent");
    expect(said(t)).toMatchSnapshot();
  });

  it("more results than fit in one message", async () => {
    const t = createTestKit();
    for (let n = 1; n <= 7; n++) await send(t, `pasta ${numbered(n).url}`, [numbered(n)]);
    t.sent.length = 0;
    t.reactions.length = 0;
    await t.message(plugin, "find pasta");
    await t.message(plugin, "latest");
    await t.message(plugin, "count");
    expect(said(t)).toMatchSnapshot();
  });

  it("liked and important, marked by reaction and in words", async () => {
    const t = createTestKit();
    await send(t, pasta.url, [pasta]);
    const first = t.marks[0];
    await send(t, `for my back ${yoga.url}`, [yoga]);
    const second = t.marks[1];
    t.sent.length = 0;
    t.reactions.length = 0;
    await t.react(plugin, "❤️", first);
    await t.message(plugin, "important", first);
    await t.message(plugin, "A note of my own", first);
    await t.react(plugin, "⭐", second);
    await t.message(plugin, "liked");
    await t.message(plugin, "important");
    await t.message(plugin, "recent");
    await t.message(plugin, "unlike", first);
    await t.message(plugin, "like", first);
    await t.message(plugin, "not important", first);
    await t.message(plugin, "no note", first);
    await t.intent(plugin, "the ones I liked", "liked");
    await t.intent(plugin, "the important ones", "important");
    expect(said(t)).toMatchSnapshot();
  });

  it("count with one link", async () => {
    const t = createTestKit();
    await send(t, pasta.url, [pasta]);
    t.sent.length = 0;
    await t.message(plugin, "count");
    expect(said(t)).toMatchSnapshot();
  });
});

describe("mediastore copy: replying to a link", () => {
  it("delete, undo and a link that is gone", async () => {
    const t = createTestKit();
    await send(t, pasta.url, [pasta]);
    await send(t, yoga.url, [yoga]);
    const [first, second] = t.marks;
    t.sent.length = 0;
    t.reactions.length = 0;
    await t.message(plugin, "undo");
    await t.message(plugin, "a note", second);
    await t.message(plugin, "delete", first);
    await t.message(plugin, "delete", first);
    await t.intent(plugin, "take that back", "undo");
    expect(said(t)).toMatchSnapshot();
  });

  it("undo names a link by its note, its caption or its address when it has no title", async () => {
    const t = createTestKit();
    await send(t, bare.url, [bare]);
    await t.message(plugin, "undo");
    await send(t, yoga.url, [yoga]);
    await t.message(plugin, "undo");
    await send(t, `my own words ${dead.url}`, [dead]);
    await t.message(plugin, "undo");
    expect(said(t)).toMatchSnapshot();
  });
});

describe("mediastore copy: groups", () => {
  it("making, listing and closing", async () => {
    const t = createTestKit();
    await t.message(plugin, "new group Recipes");
    await t.message(plugin, "add group recipes");
    await t.message(plugin, "new group !!!");
    await t.message(plugin, "make a folder called Workouts for the gym and more");
    await send(t, pasta.url, [pasta], "recipes");
    await send(t, yoga.url, [yoga], "recipes");
    await send(t, bare.url, [bare], "workouts-for-the-gym");
    await t.message(plugin, "groups");
    await t.intent(plugin, "what groups do I have", "groups");
    await t.message(plugin, "recent", null, "recipes");
    await t.message(plugin, "close group recipes");
    await t.message(plugin, "close group recipes");
    await t.message(plugin, "close group", null, "workouts-for-the-gym");
    await t.message(plugin, "close group", null, "ghost");
    await t.message(plugin, "new group recipes");
    expect(said(t)).toMatchSnapshot();
  });

  it("no more than twenty", async () => {
    const t = createTestKit();
    for (let i = 1; i <= 20; i++) await t.kit.store.put("groups", `g${i}`, { name: `g${i}`, created: i }, i);
    await t.message(plugin, "new group one too many");
    await t.intent(plugin, "make a group for workouts", "new_group");
    expect(said(t)).toMatchSnapshot();
  });

  it("from a plain sentence", async () => {
    const t = createTestKit();
    await t.intent(plugin, "can you make a group for my workouts.", "new_group");
    await t.intent(plugin, "I want to sort these", "new_group");
    await t.intent(plugin, "make a group called workouts", "new_group");
    await t.intent(plugin, "can you move that pasta link", "move");
    expect(said(t)).toMatchSnapshot();
  });

  it("a group the person already had", async () => {
    const t = createTestKit();
    await t.group(plugin, "joined", "x-fam", "Family   Recipes");
    await t.group(plugin, "joined", "x-none", "   ");
    await send(t, pasta.url, [pasta], "x-fam");
    await t.message(plugin, "groups");
    await t.message(plugin, "close group family recipes");
    await t.group(plugin, "left", "x-none", "");
    await t.message(plugin, "groups");
    expect(said(t)).toMatchSnapshot();
  });
});

describe("mediastore copy: moving a link", () => {
  it("to a named group, and to one that is not there", async () => {
    const t = createTestKit();
    await t.message(plugin, "new group recipes");
    await send(t, pasta.url, [pasta]);
    const ref = t.marks[0];
    t.sent.length = 0;
    t.reactions.length = 0;
    await t.message(plugin, "move to recipes", ref);
    await t.message(plugin, "move to gym", ref);
    await t.message(plugin, "move to main", ref);
    expect(said(t)).toMatchSnapshot();
  });

  it("asking which group, and every answer", async () => {
    const t = createTestKit();
    await t.message(plugin, "new group recipes");
    await t.message(plugin, "new group workouts");
    await send(t, `*bold* words ${long.url}`, [{ ...long, title: `*Starred* ${long.title}` }]);
    const ref = t.marks[0];
    const ask = () => t.asked.at(-1)!;
    t.sent.length = 0;
    t.reactions.length = 0;
    // Moved.
    await t.message(plugin, "move", ref);
    await t.answer(plugin, ask().ref, 0);
    // Left where it is.
    await t.message(plugin, "move this", ref, "recipes");
    await t.answer(plugin, ask().ref, 2);
    // Back to the main group.
    await t.message(plugin, "wrong group", ref, "recipes");
    await t.answer(plugin, ask().ref, 0);
    // The group was closed while the question was open.
    await t.message(plugin, "move", ref);
    await t.message(plugin, "close group workouts");
    await t.answer(plugin, ask().ref, 1);
    // The link was deleted while the question was open.
    await t.message(plugin, "move", ref);
    await t.message(plugin, "delete", ref);
    await t.answer(plugin, ask().ref, 0);
    expect(said(t)).toMatchSnapshot();
  });

  it("with no group in common", async () => {
    const t = createTestKit();
    await t.message(plugin, "new group recipes");
    await send(t, yoga.url, [yoga], null, "Asha");
    const ref = t.marks.at(-1)!;
    t.sent.length = 0;
    t.reactions.length = 0;
    await t.message(plugin, "move", ref, null, "Asha");
    await t.message(plugin, "move", ref);
    expect(said(t)).toMatchSnapshot();
  });
});
