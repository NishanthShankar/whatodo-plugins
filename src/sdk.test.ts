/** The SDK's own rules and the test kit's, for the parts no plugin exercises yet. */
import { describe, expect, it } from "vitest";
import { definePlugin, type PluginDef, type Sender } from "./sdk";
import { createTestKit, link } from "./testing";

const base: PluginDef = {
  id: "probe",
  version: "1.0.0",
  sdk: "1",
  name: "Probe",
  icon: "🔎",
  tagline: "Says who wrote.",
  description: "A plugin used by the SDK's tests.",
  groupName: "🔎 Probe",
  price: 0,
  welcome: "hi",
  help: "help text",
};

function probe(permissions: PluginDef["permissions"]) {
  const seen: (Sender | undefined)[] = [];
  const plugin = definePlugin({
    ...base,
    permissions,
    understand: { intents: { one: "First thing", two: "Second thing" } },
    onMessage: async (e) => void seen.push(e.sender),
    onReaction: async (e) => void seen.push(e.sender),
    onIntent: async (e) => void seen.push(e.sender),
  });
  return { plugin, seen };
}

describe("members and sender", () => {
  it("says the owner sent it when nobody else is named", async () => {
    const { plugin, seen } = probe([]);
    const t = createTestKit({ person: { name: "Nisha", timezone: "Asia/Kolkata" } });
    await t.message(plugin, "hello");
    await t.react(plugin, "✅", { a: 1 });
    await t.intent(plugin, "hello", "one");
    expect(seen).toEqual(Array(3).fill({ id: "owner", name: "Nisha", owner: true, profile: true }));
  });

  it("delivers another member's events to a plugin with the members permission", async () => {
    const { plugin, seen } = probe(["members"]);
    const t = createTestKit();
    await t.message(plugin, "hello", null, null, "Asha Rao");
    await t.react(plugin, "✅", { a: 1 }, null, "Asha Rao");
    await t.intent(plugin, "hello", "two", null, 1, { id: "u2", name: null });
    expect(seen).toEqual([
      { id: "asha-rao", name: "Asha Rao", owner: false, profile: false },
      { id: "asha-rao", name: "Asha Rao", owner: false, profile: false },
      { id: "u2", name: null, owner: false, profile: false },
    ]);
  });

  it("keeps kit.person as the owner whoever writes", async () => {
    let person: unknown;
    const plugin = definePlugin({ ...base, permissions: ["members"], onMessage: async (_e, kit) => void (person = kit.person) });
    const t = createTestKit({ person: { name: "Nisha", timezone: "Asia/Kolkata" } });
    await t.message(plugin, "hello", null, null, "Asha");
    expect(person).toEqual({ id: "owner", name: "Nisha", timezone: "Asia/Kolkata", currency: null });
  });

  it("learns the person's currency once, and keeps the first one it is told", async () => {
    const plugin = definePlugin({ ...base, onMessage: async (e, kit) => kit.learn({ currency: e.text }) });
    const t = createTestKit();
    expect(t.kit.person.currency).toBeNull();
    await t.message(plugin, "INR");
    await t.message(plugin, "USD");
    expect(t.kit.person.currency).toBe("INR");
    await expect(t.message(plugin, "rupees")).rejects.toThrow(/three letter code/);
    const known = createTestKit({ person: { name: null, timezone: "Asia/Kolkata", currency: "EUR" } });
    await known.message(plugin, "INR");
    expect(known.kit.person.currency).toBe("EUR");
  });

  it("refuses another member's event without the permission", async () => {
    const { plugin, seen } = probe([]);
    const t = createTestKit();
    await expect(t.message(plugin, "hello", null, null, "Asha")).rejects.toThrow(/"members" permission/);
    await expect(t.react(plugin, "✅", { a: 1 }, null, "Asha")).rejects.toThrow(/"members" permission/);
    expect(seen).toEqual([]);
  });

  it("refuses members together with lock-members", () => {
    expect(() => definePlugin({ ...base, permissions: ["members", "lock-members"] })).toThrow(/can't be used together/);
  });
});

describe("questions", () => {
  const make = (permissions: PluginDef["permissions"]) => {
    const seen: unknown[] = [];
    const plugin = definePlugin({
      ...base,
      permissions,
      onMessage: async (e, kit) => (e.text === "done" ? kit.close({ pick: 1 }) : kit.ask("Tonight?", ["Dune", "Dark"], { ref: { pick: 1 } })),
      onAnswer: async (e) => void seen.push(e),
    });
    return { plugin, seen };
  };

  it("settles a one-person question on the first answer and posts the confirm line", async () => {
    const { plugin, seen } = make([]);
    const t = createTestKit({ person: { name: "Nisha", timezone: "Asia/Kolkata" } });
    await t.message(plugin, "pick");
    expect(t.asked).toEqual([{ question: "Tonight?", options: ["Dune", "Dark"], ref: { pick: 1 }, group: null, confirm: "{{question}}: {{option}}", keep: false, multiple: false, intro: null, mention: null, open: true }]);
    await t.answer(plugin, { pick: 1 }, 1);
    expect(seen).toEqual([{ ref: { pick: 1 }, choice: 1, option: "Dark", group: null, sender: { id: "owner", name: "Nisha", owner: true, profile: true } }]);
    expect(t.sent.map((m) => m.text)).toEqual(["Tonight?: Dark"]);
    expect(t.asked[0].open).toBe(false);
    await expect(t.answer(plugin, { pick: 1 }, 0)).rejects.toThrow(/no open question/);
  });

  it("keeps a shared question open, marks a changed answer, and closes on kit.close", async () => {
    const { plugin, seen } = make(["members"]);
    const t = createTestKit();
    await t.message(plugin, "pick");
    await t.answer(plugin, { pick: 1 }, 0, "Asha");
    await t.answer(plugin, { pick: 1 }, 0, "Asha");
    await t.answer(plugin, { pick: 1 }, 1, "Asha");
    await t.answer(plugin, { pick: 1 }, 1);
    expect(seen.map((e) => [(e as { sender: Sender }).sender.id, (e as { choice: number }).choice, (e as { changed?: boolean }).changed ?? false])).toEqual([
      ["asha", 0, false],
      ["asha", 1, true],
      ["owner", 1, false],
    ]);
    expect(t.sent).toEqual([]);
    await t.message(plugin, "done");
    expect(t.asked[0].open).toBe(false);
  });

  it("replaces an open question asked again with the same ref", async () => {
    const { plugin } = make([]);
    const t = createTestKit();
    await t.message(plugin, "pick");
    await t.message(plugin, "pick");
    expect(t.asked.map((a) => a.open)).toEqual([false, true]);
  });

  it("refuses a choice outside the options, and holds questions to their limits", async () => {
    const { plugin } = make([]);
    const t = createTestKit();
    await t.message(plugin, "pick");
    await expect(t.answer(plugin, { pick: 1 }, 2)).rejects.toThrow(/isn't one of/);
    expect(() => t.kit.ask("", ["a", "b"])).toThrow(/question/);
    expect(() => t.kit.ask("Q", ["a"])).toThrow(/2 to 100/);
    expect(() => t.kit.ask("Q", ["a", "A "])).toThrow(/the same/);
    expect(() => t.kit.ask("Q", ["a", "b".repeat(101)])).toThrow(/100/);
  });
});

describe("links and marked messages", () => {
  function make(permissions: PluginDef["permissions"]) {
    const seen: unknown[] = [];
    const plugin = definePlugin({
      ...base,
      permissions,
      onMessage: async (e, kit) => {
        seen.push(e.links ?? null);
        if (e.links) kit.mark({ saved: e.links[0].canonical });
      },
    });
    return { plugin, seen };
  }

  it("hands a plugin with the permission what was read from the links", async () => {
    const { plugin, seen } = make(["links"]);
    const t = createTestKit();
    await t.message(plugin, "look https://youtu.be/abc", null, null, undefined, [link("https://youtu.be/abc", { canonical: "https://www.youtube.com/watch?v=abc", site: "YouTube", kind: "video", title: "A video" })]);
    expect(seen).toEqual([[{ url: "https://youtu.be/abc", canonical: "https://www.youtube.com/watch?v=abc", site: "YouTube", kind: "video", found: true, title: "A video", description: null, author: null, image: null, seconds: null }]]);
    expect(t.marks).toEqual([{ saved: "https://www.youtube.com/watch?v=abc" }]);
  });

  it("leaves links unset on a message without any", async () => {
    const { plugin, seen } = make(["links"]);
    const t = createTestKit();
    await t.message(plugin, "hello");
    expect(seen).toEqual([null]);
    expect(t.marks).toEqual([]);
  });

  it("refuses link details for a plugin without the permission", async () => {
    const { plugin } = make([]);
    const t = createTestKit();
    await expect(t.message(plugin, "https://a.test", null, null, undefined, [link("https://a.test")])).rejects.toThrow(/"links" permission/);
  });

  it("knows the permission by name", () => {
    expect(() => definePlugin({ ...base, permissions: ["links"] })).not.toThrow();
  });
});

describe("a question with an intro", () => {
  const asking = (opts: { intro?: string; mention?: string }, permissions?: ("members")[]) =>
    definePlugin({ ...base, ...(permissions ? { permissions } : {}), onMessage: async (e, kit) => kit.ask("Create it?", ["Yes", "Not now"], { ...opts, ...(opts.mention ? { mention: e.sender!.id } : {}) }) });

  it("keeps the intro and who is tagged in it", async () => {
    const t = createTestKit();
    await t.message(asking({ intro: "Good start {{mention}}.", mention: "x" }, ["members"]), "hi");
    expect(t.asked[0]).toMatchObject({ question: "Create it?", intro: "Good start {{mention}}.", mention: "owner" });
  });

  it("has neither unless asked", async () => {
    const t = createTestKit();
    await t.message(asking({}), "hi");
    expect(t.asked[0]).toMatchObject({ intro: null, mention: null });
  });

  it("refuses a mention without the members permission, or without its place in the intro", async () => {
    await expect(createTestKit().message(asking({ intro: "Good start {{mention}}.", mention: "x" }), "hi")).rejects.toThrow(/members/);
    await expect(createTestKit().message(asking({ intro: "Good start.", mention: "x" }, ["members"]), "hi")).rejects.toThrow(/\{\{mention\}\}/);
    await expect(createTestKit().message(asking({ intro: "Good start {{mention}}." }, ["members"]), "hi")).rejects.toThrow(/no mention/);
  });
});

describe("questions that stay", () => {
  it("keeps a kept question open, takes every change and posts no confirm line", async () => {
    const seen: [number, boolean][] = [];
    const plugin = definePlugin({
      ...base,
      onMessage: async (e, kit) => (e.text === "done" ? kit.close("q") : kit.ask("Did you?", ["Yes", "No"], { ref: "q", keep: true })),
      onAnswer: async (e) => void seen.push([e.choice, e.changed ?? false]),
    });
    const t = createTestKit();
    await t.message(plugin, "ask");
    expect(t.asked[0]).toMatchObject({ keep: true, open: true });
    await t.answer(plugin, "q", 0);
    await t.answer(plugin, "q", 1);
    await t.answer(plugin, "q", 0);
    await t.answer(plugin, "q", 0);
    expect(seen).toEqual([[0, false], [1, true], [0, true]]);
    expect(t.sent).toEqual([]);
    expect(t.asked[0].open).toBe(true);
    await t.message(plugin, "done");
    await expect(t.answer(plugin, "q", 1)).rejects.toThrow(/no open question/);
  });
});

describe("intents in an extra group", () => {
  it("tells the plugin which group, and answers there", async () => {
    const seen: (string | null | undefined)[] = [];
    const plugin = definePlugin({
      ...base,
      permissions: ["groups"],
      understand: { intents: { one: "First thing", two: "Second thing" } },
      onIntent: async (e, kit) => {
        seen.push(e.group);
        kit.send("here");
      },
    });
    const t = createTestKit();
    await t.intent(plugin, "something", "one", null, 1, undefined, "recipes");
    await t.intent(plugin, "something", "one");
    expect(seen).toEqual(["recipes", null]);
    expect(t.sent.map((s) => s.group)).toEqual(["recipes", null]);
  });
});

describe("a group the person already had", () => {
  it("is handed to the plugin, answered in, and taken back", async () => {
    const seen: string[] = [];
    const plugin = definePlugin({
      ...base,
      permissions: ["groups"],
      onGroup: async (e, kit) => {
        seen.push(`${e.kind} ${e.key} ${e.name}`);
        if (e.kind === "joined") kit.send("hello");
      },
    });
    const t = createTestKit();
    await t.group(plugin, "joined", "x-1", "Family");
    expect(t.groups.get("x-1")).toEqual({ name: "Family", hello: null });
    expect(t.sent.map((s) => s.group)).toEqual(["x-1"]);
    await t.group(plugin, "left", "x-1", "Family");
    expect(t.groups.has("x-1")).toBe(false);
    expect(seen).toEqual(["joined x-1 Family", "left x-1 Family"]);
  });

  it("needs the groups permission", () => {
    expect(() => definePlugin({ ...base, onGroup: async () => {} })).toThrow(/groups/);
  });
});

describe("profiles", () => {
  it("knows who has a profile, and records a yes", async () => {
    const seen: (boolean | undefined)[] = [];
    const plugin = definePlugin({
      ...base,
      permissions: ["members"],
      onMessage: async (e, kit) => {
        seen.push(e.sender?.profile);
        if (e.text === "yes") await kit.signUp(e.sender!.id);
      },
    });
    const t = createTestKit();
    await t.message(plugin, "hi");
    await t.message(plugin, "hi", null, null, "Asha");
    await t.message(plugin, "yes", null, null, "Asha");
    await t.message(plugin, "hi", null, null, "Asha");
    expect(seen).toEqual([true, false, false, true]);
    expect(t.signedUp).toEqual(["asha"]);
  });

  it("refuses to sign anyone up for a plugin without members", async () => {
    const plugin = definePlugin({ ...base, onMessage: async (_e, kit) => kit.signUp("x") });
    const t = createTestKit();
    await expect(t.message(plugin, "hi")).rejects.toThrow(/"members" permission/);
  });
});

describe("a member's page", () => {
  it("loads for the person asking, and needs members", async () => {
    const plugin = definePlugin({ ...base, permissions: ["members"], web: { load: async () => ({ all: true }), loadFor: async (_kit, sender) => ({ who: sender.id }) } });
    const t = createTestKit();
    expect(await t.loadFor(plugin, "Asha")).toEqual({ who: "asha" });
    expect(() => definePlugin({ ...base, web: { load: async () => ({}), loadFor: async () => ({}) } })).toThrow(/web.loadFor needs/);
  });
});

describe("an api for the person's other systems", () => {
  const api = { get: { things: { about: "Every thing.", run: async (_kit: unknown, p: Record<string, string>) => ({ limit: p.limit ?? null }) } }, events: { "thing.added": "A thing was added." } };

  it("answers a read endpoint and records what the plugin emits", async () => {
    const plugin = definePlugin({ ...base, permissions: ["api"], api, onMessage: async (_e, kit) => kit.emit("thing.added", { id: "t1" }) });
    const t = createTestKit();
    expect(await t.api(plugin, "things", { limit: "5" })).toEqual({ limit: "5" });
    await t.message(plugin, "add a thing");
    expect(t.emitted).toEqual([{ event: "thing.added", data: { id: "t1" } }]);
    await expect(t.api(plugin, "nope")).rejects.toThrow(/no api endpoint/);
  });

  it("needs the permission, well-formed names, and only emits what it listed", async () => {
    expect(() => definePlugin({ ...base, api })).toThrow(/"api" permission/);
    expect(() => definePlugin({ ...base, permissions: ["api"], api: { get: { "Bad Name": api.get.things } } })).toThrow(/lowercase/);
    expect(() => definePlugin({ ...base, permissions: ["api"], api: { ...api, events: { added: "", } } })).toThrow(/saying when/);
    const plugin = definePlugin({ ...base, permissions: ["api"], api, onMessage: async (_e, kit) => kit.emit("thing.exploded", {}) });
    await expect(createTestKit().message(plugin, "x")).rejects.toThrow(/isn't in api.events/);
  });
});
