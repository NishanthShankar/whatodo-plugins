import { describe, expect, it } from "vitest";
import forms, { size, slug } from "..";
import { createTestKit } from "../../../testing";
import type { HookFile } from "../../../sdk";

const T = (o = {}) => createTestKit({ today: "2026-11-17", hour: 10, ...o });
const last = (t: ReturnType<typeof T>) => t.sent.at(-1)!.text;
const file = (id: string, name: string, bytes = 240_000): HookFile => ({ id, field: "id_proof", name, type: "application/pdf", size: bytes });
type Page = { forms: { key: string; url: string; closed: boolean; count: number }[]; submissions: { id: string; form: string; fields: Record<string, string>; files: HookFile[]; done: boolean }[]; total: number };

describe("forms: helpers", () => {
  it("makes keys from names and sizes for people", () => {
    expect(slug("Partner Applications!")).toBe("partner-applications");
    expect(slug("  ")).toBe("");
    expect([size(500), size(240_000), size(1_300_000)]).toEqual(["500 B", "234 KB", "1.2 MB"]);
  });
});

describe("forms: making and listing", () => {
  it("new form opens a hook and replies with the address", async () => {
    const t = T();
    await t.message(forms, "new form Contact");
    expect(t.hooks.has("contact")).toBe(true);
    expect(last(t)).toContain("Your form *Contact* is ready.");
    expect(last(t)).toContain("https://hooks.test/contact");
    await t.message(forms, "new form contact");
    expect(last(t)).toContain("You already have a form called *Contact*");
    await t.message(forms, "new form !!!");
    expect(last(t)).toContain("Give the form a name");
  });

  it("forms, address and unknown names", async () => {
    const t = T();
    await t.message(forms, "forms");
    expect(last(t)).toContain("No forms yet");
    await t.message(forms, "new form partner applications");
    await t.message(forms, "forms");
    expect(last(t)).toContain("*partner applications*: 0 submissions");
    await t.message(forms, "address partner applications");
    expect(last(t)).toContain("https://hooks.test/partner-applications");
    await t.message(forms, "address nope");
    expect(last(t)).toContain(`I don't have a form called "nope"`);
    await t.message(forms, "what");
    expect(last(t)).toContain("help");
  });
});

describe("forms: submissions", () => {
  it("stores a submission and posts its fields and file names", async () => {
    const t = T();
    await t.message(forms, "new form contact");
    await t.hook(forms, "contact", { name: "Asha", email: "asha@example.com", message: "Hello" }, [file("f1", "id-proof.pdf"), file("f2", "photo.jpg", 1_300_000)], "https://example.com");
    expect(last(t)).toBe(
      "📬 *contact*\n*name:* Asha\n*email:* asha@example.com\n*message:* Hello\n📎 id-proof.pdf (234 KB), photo.jpg (1.2 MB)\n_Open the files on app.zelfred.com._",
    );
    const page = (await t.load(forms)) as unknown as Page;
    expect(page.total).toBe(1);
    expect(page.forms[0]).toMatchObject({ key: "contact", count: 1, closed: false });
    expect(page.submissions[0]).toMatchObject({ form: "contact", fields: { name: "Asha" }, done: false });
    expect(page.submissions[0].files.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(t.sent.at(-1)!.ref).toEqual({ kind: "submission", id: page.submissions[0].id });
  });

  it("cuts long values and long field lists short in the message, but keeps them", async () => {
    const t = T();
    await t.message(forms, "new form contact");
    const fields: Record<string, string> = { note: "x".repeat(500) };
    for (let i = 0; i < 14; i++) fields[`f${i}`] = String(i);
    await t.hook(forms, "contact", fields);
    expect(last(t)).toContain(`*note:* ${"x".repeat(300)}…`);
    expect(last(t)).toContain("_and 3 more fields_");
    const page = (await t.load(forms)) as unknown as Page;
    expect(page.submissions[0].fields.note).toHaveLength(500);
    expect(Object.keys(page.submissions[0].fields)).toHaveLength(15);
  });

  it("✅ marks a submission done; taking it off undoes that", async () => {
    const t = T();
    await t.message(forms, "new form contact");
    await t.hook(forms, "contact", { name: "Asha" });
    const ref = t.sent.at(-1)!.ref;
    await t.react(forms, "✅", ref);
    expect(((await t.load(forms)) as unknown as Page).submissions[0].done).toBe(true);
    await t.react(forms, null, ref);
    expect(((await t.load(forms)) as unknown as Page).submissions[0].done).toBe(false);
    await t.react(forms, "✅", { other: true });
  });

  it("last shows the latest, of all forms or one", async () => {
    const t = T();
    await t.message(forms, "last");
    expect(last(t)).toBe("Nothing has come in yet.");
    await t.message(forms, "new form contact");
    await t.message(forms, "new form demo");
    await t.hook(forms, "contact", { name: "Asha" });
    t.setHour(11);
    await t.hook(forms, "demo", { name: "Ravi" });
    await t.message(forms, "last");
    expect(last(t)).toContain("*demo*\n*name:* Ravi");
    await t.message(forms, "last contact");
    expect(last(t)).toContain("*contact*\n*name:* Asha");
  });

  it("stops messaging after the daily number, says so once, and keeps everything", async () => {
    const t = T({ settings: { dailyMessages: 2 } });
    await t.message(forms, "new form contact");
    const n = t.sent.length;
    for (let i = 0; i < 6; i++) await t.hook(forms, "contact", { n: String(i) });
    expect(t.sent.slice(n).map((s) => s.text.split("\n")[0])).toEqual([
      "📬 *contact*",
      "📬 *contact*",
      "📬 *contact* has had more than 2 submissions today. I'll stop messaging about it until tomorrow. They're all on app.zelfred.com.",
    ]);
    expect(((await t.load(forms)) as unknown as Page).total).toBe(6);
    t.setToday("2026-11-18");
    await t.hook(forms, "contact", { n: "next day" });
    expect(last(t)).toContain("*n:* next day");
  });
});

describe("forms: a new address", () => {
  it("replaces the address and keeps what the form received", async () => {
    const t = T();
    await t.message(forms, "new form contact");
    await t.hook(forms, "contact", { name: "Asha" }, [file("f1", "id.pdf")]);
    // Watch the hook being closed and opened again: that is what gives it a new address.
    const calls: string[] = [];
    const { url, remove } = t.kit.hooks;
    t.kit.hooks.remove = async (k) => (calls.push(`remove ${k}`), remove(k));
    t.kit.hooks.url = async (k) => (calls.push(`url ${k}`), url(k));
    await t.message(forms, "new address contact");
    expect(calls).toEqual(["remove contact", "url contact"]);
    expect(last(t)).toContain("*contact* has a new address. The old one no longer works");
    expect(t.hooks.has("contact")).toBe(true);
    const page = (await t.load(forms)) as unknown as Page;
    expect(page.total).toBe(1);
    expect(page.forms[0]).toMatchObject({ key: "contact", count: 1, closed: false });
    expect(t.removedFiles).toEqual([]);
    // From the page, and for forms that can't have one.
    expect(await t.act(forms, "newAddress", { key: "contact" })).toEqual({ key: "contact", url: "https://hooks.test/contact" });
    await t.message(forms, "new address nope");
    expect(last(t)).toContain(`I don't have a form called "nope"`);
    await t.message(forms, "close contact");
    await t.message(forms, "new address contact");
    expect(last(t)).toContain("is closed");
    await expect(t.act(forms, "newAddress", { key: "contact" })).rejects.toThrow("isn't open");
  });

  it("in a form's own group, new address needs no name", async () => {
    const t = T();
    await t.message(forms, "new form kyc in its own group");
    await t.message(forms, "new address", null, "kyc");
    expect(t.sent.at(-1)).toMatchObject({ group: "kyc" });
    expect(last(t)).toContain("*kyc* has a new address");
  });
});

describe("forms: marking done from WhatsApp", () => {
  it("any tick or thumbs up marks it done and is ticked back; other emoji don't", async () => {
    for (const emoji of ["✅", "✔️", "✔", "☑️", "✓", "👍", "👍🏽", "👌", "🆗"]) {
      const t = T();
      await t.message(forms, "new form contact");
      await t.hook(forms, "contact", { name: "Asha" });
      await t.react(forms, emoji, t.sent.at(-1)!.ref);
      expect(((await t.load(forms)) as unknown as Page).submissions[0].done, emoji).toBe(true);
      expect(t.reactions.at(-1), emoji).toBe("✅");
    }
    const t = T();
    await t.message(forms, "new form contact");
    await t.hook(forms, "contact", { name: "Asha" });
    const ref = t.sent.at(-1)!.ref;
    await t.react(forms, "❤️", ref);
    expect(((await t.load(forms)) as unknown as Page).submissions[0].done).toBe(false);
    expect(t.reactions).toEqual([]);
    await t.react(forms, "✅", ref);
    await t.react(forms, null, ref);
    expect(((await t.load(forms)) as unknown as Page).submissions[0].done).toBe(false);
    expect(t.reactions).toEqual(["✅", ""]);
  });
});

describe("forms: field order", () => {
  it("keeps the order the form sent, even when storage sorts the fields", async () => {
    const t = T();
    await t.message(forms, "new form contact");
    await t.hook(forms, "contact", { name: "Asha", email: "a@example.com", city: "Pune" });
    const page = (await t.load(forms)) as unknown as Page & { submissions: { order: string[] }[] };
    expect(page.submissions[0].order).toEqual(["name", "email", "city"]);
    // What a database that sorts object keys hands back: the order comes from `order`.
    const id = page.submissions[0].id;
    const row = (await t.kit.store.get<Record<string, unknown>>("submissions", id))!;
    await t.kit.store.put("submissions", id, { ...row, fields: { city: "Pune", email: "a@example.com", name: "Asha" } }, row.at as number);
    await t.message(forms, "last");
    expect(last(t)).toBe("📬 *contact*\n*name:* Asha\n*email:* a@example.com\n*city:* Pune");
    // A 1.0.0 row has no order: it still shows.
    await t.kit.store.put("submissions", id, { form: "contact", at: row.at as number, fields: { b: "2", a: "1" }, files: [], origin: null }, row.at as number);
    await t.message(forms, "last");
    expect(last(t)).toBe("📬 *contact*\n*b:* 2\n*a:* 1");
  });
});

describe("forms: closing and deleting", () => {
  it("close stops the address; a late request keeps nothing, files included", async () => {
    const t = T();
    await t.message(forms, "new form contact");
    await t.message(forms, "close contact");
    expect(t.hooks.has("contact")).toBe(false);
    expect(last(t)).toContain("*contact* is closed");
    await expect(t.hook(forms, "contact", { a: "b" })).rejects.toThrow("isn't open");
    // A request already on its way when the form closed reaches onHook: nothing is kept.
    await forms.onHook!({ key: "contact", fields: { a: "b" }, files: [file("late", "x.pdf")], origin: null }, t.kit);
    expect(t.removedFiles).toEqual(["late"]);
    expect(((await t.load(forms)) as unknown as Page).total).toBe(0);
    await t.message(forms, "address contact");
    expect(last(t)).toContain("is closed");
    await t.message(forms, "new form contact");
    expect(t.hooks.has("contact")).toBe(true);
  });

  it("the page can make a form, mark done, and delete a submission or a whole form with its files", async () => {
    const t = T();
    expect(await t.act(forms, "createForm", { name: "KYC" })).toEqual({ key: "kyc", url: "https://hooks.test/kyc" });
    await expect(t.act(forms, "createForm", { name: "kyc" })).rejects.toThrow("already have a form");
    await t.hook(forms, "kyc", { name: "Asha" }, [file("a1", "pan.pdf")]);
    t.setHour(11);
    await t.hook(forms, "kyc", { name: "Ravi" }, [file("b1", "aadhaar.pdf"), file("b2", "selfie.jpg")]);
    let page = (await t.load(forms)) as unknown as Page;
    expect(page.submissions.map((s) => s.fields.name)).toEqual(["Ravi", "Asha"]);
    await t.act(forms, "setDone", { id: page.submissions[0].id, done: true });
    await t.act(forms, "deleteSubmission", { id: page.submissions[1].id });
    expect(t.removedFiles).toEqual(["a1"]);
    page = (await t.load(forms)) as unknown as Page;
    expect(page.submissions).toHaveLength(1);
    expect(page.submissions[0].done).toBe(true);
    await t.act(forms, "deleteForm", { key: "kyc" });
    expect(t.removedFiles).toEqual(["a1", "b1", "b2"]);
    expect(t.hooks.has("kyc")).toBe(false);
    expect(Object.keys(t.dump())).toEqual([]);
  });
});

describe("forms: a group per form", () => {
  it("new form ... in its own group opens a group named after the form and announces there", async () => {
    const t = T();
    await t.message(forms, "new form KYC in its own group");
    expect(t.hooks.has("kyc")).toBe(true);
    expect(t.groups.get("kyc")).toMatchObject({ name: "📬 KYC" });
    expect(t.groups.get("kyc")!.hello).toContain("This group is for your form *KYC*");
    expect(last(t)).toContain("I'm making a WhatsApp group just for this form");
    await t.hook(forms, "kyc", { name: "Asha" });
    expect(t.sent.at(-1)).toMatchObject({ group: "kyc", text: "📬 *KYC*\n*name:* Asha" });
    // A form without its own group still posts in the main one.
    await t.message(forms, "new form contact");
    await t.hook(forms, "contact", { name: "Ravi" });
    expect(t.sent.at(-1)!.group).toBe(null);
    expect(t.groups.has("contact")).toBe(false);
  });

  it("group <form> gives an existing form its own group, once", async () => {
    const t = T();
    await t.message(forms, "new form partners");
    await t.message(forms, "group partners");
    expect(t.groups.has("partners")).toBe(true);
    expect(last(t)).toContain("I'm making a WhatsApp group just for *partners*");
    await t.message(forms, "group partners");
    expect(last(t)).toBe("*partners* already has its own group.");
    await t.message(forms, "group nope");
    expect(last(t)).toContain(`I don't have a form called "nope"`);
  });

  it("in a form's own group, last, address and close are about that form", async () => {
    const t = T();
    await t.message(forms, "new form kyc in its own group");
    await t.message(forms, "new form contact");
    await t.hook(forms, "kyc", { name: "Asha" });
    t.setHour(11);
    await t.hook(forms, "contact", { name: "Ravi" });
    await t.message(forms, "last", null, "kyc");
    expect(t.sent.at(-1)).toMatchObject({ group: "kyc" });
    expect(last(t)).toContain("*kyc*\n*name:* Asha");
    await t.message(forms, "address", null, "kyc");
    expect(last(t)).toContain("https://hooks.test/kyc");
    await t.message(forms, "close", null, "kyc");
    expect(t.hooks.has("kyc")).toBe(false);
    expect(t.hooks.has("contact")).toBe(true);
    // In the main group a bare "close" names nothing.
    await t.message(forms, "close");
    expect(last(t)).toContain("help");
  });

  it("the page can add a form with its own group, give one later, and deleting closes the group", async () => {
    const t = T();
    await t.act(forms, "createForm", { name: "Demo", ownGroup: true });
    t.setHour(11);
    await t.act(forms, "createForm", { name: "Contact" });
    let page = (await t.load(forms)) as unknown as { forms: { key: string; ownGroup: boolean }[] };
    expect(page.forms.map((f) => [f.key, f.ownGroup])).toEqual([["demo", true], ["contact", false]]);
    await t.act(forms, "giveGroup", { key: "contact" });
    expect([...t.groups.keys()].sort()).toEqual(["contact", "demo"]);
    await t.act(forms, "deleteForm", { key: "demo" });
    expect([...t.groups.keys()]).toEqual(["contact"]);
    page = (await t.load(forms)) as unknown as { forms: { key: string; ownGroup: boolean }[] };
    expect(page.forms.map((f) => [f.key, f.ownGroup])).toEqual([["contact", true]]);
  });
});

describe("forms: basics", () => {
  it("is unlisted and answers help", async () => {
    expect(forms.unlisted).toBe(true);
    const t = T();
    await t.message(forms, "help");
    expect(last(t)).toBe(forms.help);
  });
});

describe("forms: renaming", () => {
  type Named = { forms: { key: string; name: string; url: string; groupName: string | null }[] };
  const named = async (t: ReturnType<typeof T>) => ((await t.load(forms)) as unknown as Named).forms;

  it("rename <form> to <name> changes the name and nothing else", async () => {
    const t = T();
    await t.message(forms, "new form contact");
    const before = (await named(t))[0];
    await t.message(forms, "rename contact to Contact Us");
    expect(last(t)).toBe("📬 *contact* is now *Contact Us*. Its address hasn't changed.");
    const after = (await named(t))[0];
    expect(after).toMatchObject({ key: "contact", name: "Contact Us", url: before.url, groupName: null });
    // It answers to its new name and still to its key.
    await t.message(forms, "address contact us");
    expect(last(t)).toContain(before.url);
    await t.message(forms, "rename contact");
    expect(last(t)).toContain("Tell me the new name too");
    await t.message(forms, "rename nothing to Something");
    expect(last(t)).toContain(`I don't have a form called "nothing"`);
  });

  it("won't take a name another form answers to", async () => {
    const t = T();
    await t.message(forms, "new form contact");
    await t.message(forms, "new form Partners");
    await t.message(forms, "rename contact to partners");
    expect(last(t)).toBe(`You already have a form called "partners". Pick another name.`);
    expect((await named(t)).map((f) => f.name)).toEqual(["contact", "Partners"]);
  });

  it("a form's own group keeps its name when the form is renamed, and gets its own from the page", async () => {
    const t = T();
    await t.message(forms, "new form KYC in its own group");
    expect(t.groups.get("kyc")!.name).toBe("📬 KYC");
    await t.message(forms, "rename to Know Your Customer", null, "kyc");
    expect(last(t)).toBe("📬 *KYC* is now *Know Your Customer*. Its address hasn't changed.");
    expect(t.groups.get("kyc")!.name).toBe("📬 KYC");
    expect((await named(t))[0]).toMatchObject({ name: "Know Your Customer", groupName: "📬 KYC" });

    const out = await t.act(forms, "rename", { key: "kyc", groupName: "  Customer   checks  " });
    expect(out).toMatchObject({ name: "Know Your Customer", groupName: "Customer checks" });
    expect(t.groups.get("kyc")!.name).toBe("Customer checks");
    // Both at once, and a group name longer than WhatsApp takes is cut.
    await t.act(forms, "rename", { key: "kyc", name: "KYC 2", groupName: "A group name that is far too long" });
    expect((await named(t))[0]).toMatchObject({ name: "KYC 2", groupName: "A group name that is far" });
    expect(t.groups.get("kyc")!.name.length).toBeLessThanOrEqual(25);
  });

  it("a form in the main group has no group name to change", async () => {
    const t = T();
    await t.message(forms, "new form contact");
    await t.act(forms, "rename", { key: "contact", name: "Hello", groupName: "Ignored" });
    expect((await named(t))[0]).toMatchObject({ name: "Hello", groupName: null });
    expect(t.groups.size).toBe(0);
    await expect(t.act(forms, "rename", { key: "contact", name: "   " })).rejects.toThrow(/Give the form a name/);
  });
});
