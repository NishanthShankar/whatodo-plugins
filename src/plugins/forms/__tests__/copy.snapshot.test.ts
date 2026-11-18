/**
 * Every reply Forms can give, captured exactly. This file exists so the wording can be moved
 * or rewritten on purpose and never by accident: a change here is a change people see.
 */
import { describe, expect, it } from "vitest";
import forms from "..";
import type { HookFile } from "../../../sdk";
import { createTestKit } from "../../../testing";

const T = (o = {}) => createTestKit({ today: "2026-11-17", hour: 10, ...o });
type Kit = ReturnType<typeof T>;

/** Everything the plugin put on WhatsApp so far. */
const said = (t: Kit) => ({ sent: t.sent, asked: t.asked, reactions: t.reactions, unsures: t.unsures, groups: [...t.groups] });
const file = (id: string, name: string, bytes: number): HookFile => ({ id, field: "upload", name, type: "application/pdf", size: bytes });

describe("forms copy: what the plugin says about itself", () => {
  it("welcome, help and group name", () => {
    expect({ welcome: forms.welcome, help: forms.help, groupName: forms.groupName }).toMatchSnapshot();
  });

  it("help, and a message that is not understood", async () => {
    const t = T();
    await t.message(forms, "help");
    await t.message(forms, "what");
    expect(said(t)).toMatchSnapshot();
  });
});

describe("forms copy: making and listing", () => {
  it("a new form, a second one of the same name, and one with no name", async () => {
    const t = T();
    await t.message(forms, "new form Contact");
    await t.message(forms, "new form contact");
    await t.message(forms, "new form !!!");
    expect(said(t)).toMatchSnapshot();
  });

  it("no more than fifty", async () => {
    const t = T();
    for (let i = 1; i <= 50; i++) await t.kit.store.put("forms", `f${i}`, { name: `f${i}`, url: `https://hooks.test/f${i}`, createdDay: "2026-11-01", created: i, count: 0 }, i);
    await t.message(forms, "new form one too many");
    expect(said(t)).toMatchSnapshot();
  });

  it("the list: none, open and closed, one submission and several", async () => {
    const t = T();
    await t.message(forms, "forms");
    await t.message(forms, "new form Contact");
    await t.message(forms, "new form Partner Applications");
    await t.message(forms, "new form Old One");
    await t.hook(forms, "contact", { name: "Asha" });
    await t.hook(forms, "partner-applications", { name: "Asha" });
    await t.hook(forms, "partner-applications", { name: "Ravi" });
    await t.message(forms, "close old one");
    await t.message(forms, "forms");
    expect(said(t)).toMatchSnapshot();
  });

  it("the address again, of an unknown form and of a closed one", async () => {
    const t = T();
    await t.message(forms, "new form Contact");
    t.sent.length = 0;
    await t.message(forms, "address contact");
    await t.message(forms, "address nope");
    await t.message(forms, "close contact");
    await t.message(forms, "address contact");
    await t.message(forms, "close nope");
    expect(said(t)).toMatchSnapshot();
  });

  it("a new address, for an unknown form and for a closed one", async () => {
    const t = T();
    await t.message(forms, "new form Contact");
    t.sent.length = 0;
    await t.message(forms, "new address contact");
    await t.message(forms, "new address nope");
    await t.message(forms, "close contact");
    await t.message(forms, "new address for contact");
    // Opened again: it keeps its name and gets a new address.
    await t.message(forms, "new form contact");
    expect(said(t)).toMatchSnapshot();
  });
});

describe("forms copy: submissions", () => {
  it("fields, long values, many fields, files and nothing at all", async () => {
    const t = T();
    await t.message(forms, "new form Contact");
    t.sent.length = 0;
    await t.hook(forms, "contact", { name: "Asha", email: "asha@example.com", message: "Hello" }, [file("f1", "id-proof.pdf", 240_000), file("f2", "photo.jpg", 1_300_000), file("f3", "note.txt", 500)], "https://example.com");
    await t.hook(forms, "contact", { message: "x".repeat(400) });
    await t.hook(forms, "contact", Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`field ${i + 1}`, `value ${i + 1}`])));
    await t.hook(forms, "contact", {});
    await t.hook(forms, "contact", {}, [file("f4", "only.pdf", 2048)]);
    await t.hook(forms, "contact", Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`long field number ${i + 1}`, "y".repeat(400)])), [file("f5", "tail.pdf", 1)]);
    expect(said(t)).toMatchSnapshot();
  });

  it("the latest: none, of all forms, of one, of an unknown form, and of a form that is gone", async () => {
    const t = T();
    await t.message(forms, "last");
    await t.message(forms, "new form a");
    await t.message(forms, "new form Bee Two");
    await t.hook(forms, "a", { n: "1" });
    t.setHour(11);
    await t.hook(forms, "bee-two", { n: "2" });
    await t.message(forms, "last");
    await t.message(forms, "last a");
    await t.message(forms, "latest nope");
    await t.kit.store.delete("forms", "bee-two");
    await t.message(forms, "last");
    expect(said(t)).toMatchSnapshot();
  });

  it("the daily number: said once, then quiet", async () => {
    const t = T({ settings: { dailyMessages: 2 } });
    await t.message(forms, "new form Contact");
    t.sent.length = 0;
    for (let i = 1; i <= 5; i++) await t.hook(forms, "contact", { n: String(i) });
    expect(said(t)).toMatchSnapshot();
  });

  it("a tick marks one done and is ticked back; taking it off clears it; other emoji do nothing", async () => {
    const t = T();
    await t.message(forms, "new form Contact");
    await t.hook(forms, "contact", { name: "Asha" });
    const ref = t.sent.at(-1)!.ref;
    t.sent.length = 0;
    await t.react(forms, "✅", ref);
    await t.react(forms, null, ref);
    await t.react(forms, "👍🏽", ref);
    await t.react(forms, "😂", ref);
    expect(said(t)).toMatchSnapshot();
  });
});

describe("forms copy: a form's own group", () => {
  it("made with the form, and the daily number said there", async () => {
    const t = T({ settings: { dailyMessages: 1 } });
    await t.message(forms, "new form Partner Applications For This Year in its own group");
    await t.hook(forms, "partner-applications-for-this", { name: "Asha" });
    await t.hook(forms, "partner-applications-for-this", { name: "Ravi" });
    expect(said(t)).toMatchSnapshot();
  });

  it("given later: once, not to an unknown form, not to a closed one", async () => {
    const t = T();
    await t.message(forms, "new form Contact");
    await t.message(forms, "new form Old One");
    await t.message(forms, "close old one");
    t.sent.length = 0;
    t.reactions.length = 0;
    await t.message(forms, "group contact");
    await t.message(forms, "group contact");
    await t.message(forms, "group nope");
    await t.message(forms, "move old one to its own group");
    expect(said(t)).toMatchSnapshot();
  });

  it("inside it, last, address, new address and close are about that form", async () => {
    const t = T();
    await t.message(forms, "new form Contact in its own group");
    t.sent.length = 0;
    await t.message(forms, "last", null, "contact");
    await t.hook(forms, "contact", { name: "Asha" });
    await t.message(forms, "last", null, "contact");
    await t.message(forms, "address", null, "contact");
    await t.message(forms, "new address", null, "contact");
    await t.message(forms, "close", null, "contact");
    await t.message(forms, "address", null, "contact");
    await t.message(forms, "new address", null, "contact");
    expect(said(t)).toMatchSnapshot();
  });
});
