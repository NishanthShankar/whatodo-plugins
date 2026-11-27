import { describe, expect, it } from "vitest";
import plugin, { type Bill, type Book, weekday } from "..";
import type { MailRead } from "../../../sdk";
import { createTestKit, mail, photo } from "../../../testing";
import { readWords } from "../words";

type T = ReturnType<typeof createTestKit>;

const send = (t: T, id: string, caption = "") => t.message(plugin, caption, null, null, undefined, undefined, { photos: [photo(id)] });
const bills = (t: T) =>
  Object.entries(t.dump())
    .filter(([k]) => k.startsWith("bills/"))
    .map(([k, v]) => ({ id: k.slice(6), ...(v as unknown as Bill) }));
const books = (t: T) =>
  Object.entries(t.dump())
    .filter(([k]) => k.startsWith("books/"))
    .map(([k, v]) => ({ id: k.slice(6), ...(v as unknown as Book) }))
    .sort((a, b) => a.order - b.order);
const billOf = (t: T, file: string) => bills(t).find((b) => b.files[0].id === file)!;
const refOf = (t: T, file: string) => ({ kind: "bill", id: billOf(t, file).id });

/** A person who has sent their first bill and named it Acme (🏢), and made Home (🏠) on the page. */
async function settled() {
  const t = createTestKit();
  await send(t, "p0");
  await t.message(plugin, "Acme");
  await t.act(plugin, "addBook", { name: "Home", kind: "person" });
  return t;
}

describe("invoice-holder: a bill arrives", () => {
  it("1. a photo with no caption is kept with a 👍 and no words, after the first time", async () => {
    const t = await settled();
    const before = t.sent.length;
    await send(t, "p1");
    expect(t.sent.length).toBe(before);
    expect(t.reactions.at(-1)).toBe("👍");
    expect(billOf(t, "p1")).toMatchObject({ state: "to-tag", book: null, source: "whatsapp" });
    expect(billOf(t, "p1").by).toBeTruthy();
  });

  it("2. the first photo ever gets the first-time line and the question, once", async () => {
    const t = createTestKit();
    await send(t, "p1");
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].text).toContain("Whose bill is this?");
    await t.message(plugin, "Acme Traders");
    expect(books(t)).toMatchObject([{ name: "Acme Traders", emoji: "🏢", kind: "business" }]);
    expect(billOf(t, "p1")).toMatchObject({ state: "filed", book: books(t)[0].id });
    expect(t.reactTos.at(-1)).toEqual({ ref: refOf(t, "p1"), emoji: "🏢" });
    const after = t.sent.length;
    await send(t, "p2");
    await send(t, "p3");
    expect(t.sent.length).toBe(after);
  });

  it("the first-book question can also be answered by replying to the bill", async () => {
    const t = createTestKit();
    await send(t, "p1");
    await t.message(plugin, "Mum", refOf(t, "p1"));
    expect(books(t)).toMatchObject([{ name: "Mum" }]);
    expect(billOf(t, "p1").state).toBe("filed");
  });

  it("books made on the page before the first photo are shown instead of asked for", async () => {
    const t = createTestKit();
    await t.act(plugin, "addBook", { name: "Acme" });
    await send(t, "p1");
    expect(t.sent[0].text).toContain("🏢 Acme");
    expect(t.sent[0].text).not.toContain("Whose");
  });

  it("8. three photos sent together make three bills in one batch, and only the captioned one is filed", async () => {
    const t = await settled();
    await send(t, "a", "acme 450");
    await send(t, "b");
    await send(t, "c");
    const [a, b, c] = ["a", "b", "c"].map((f) => billOf(t, f));
    expect([a.state, b.state, c.state]).toEqual(["filed", "to-tag", "to-tag"]);
    expect(a.amount).toBe(450);
    expect(new Set([a.batch, b.batch, c.batch]).size).toBe(1);
    t.setHour(23);
    await send(t, "d");
    expect(billOf(t, "d").batch).not.toBe(a.batch);
  });
});

describe("invoice-holder: filing", () => {
  it("3. a reaction with a book's emoji files the bill and my mark becomes that emoji", async () => {
    const t = await settled();
    await send(t, "p1");
    await t.react(plugin, "🏠", refOf(t, "p1"));
    expect(billOf(t, "p1")).toMatchObject({ state: "filed", tagged: { how: "reaction" } });
    expect(t.reactTos.at(-1)).toEqual({ ref: refOf(t, "p1"), emoji: "🏠" });
  });

  it("4. changing the reaction moves the bill; removing it unfiles it", async () => {
    const t = await settled();
    await send(t, "p1");
    const [acme, home] = books(t);
    await t.react(plugin, "🏢", refOf(t, "p1"));
    expect(billOf(t, "p1").book).toBe(acme.id);
    await t.react(plugin, "🏠", refOf(t, "p1"));
    expect(billOf(t, "p1").book).toBe(home.id);
    await t.react(plugin, null, refOf(t, "p1"));
    expect(billOf(t, "p1")).toMatchObject({ state: "to-tag", book: null });
    expect(t.reactTos.at(-1)).toEqual({ ref: refOf(t, "p1"), emoji: "👍" });
  });

  it("a skin tone or the picture mark on the emoji counts as the same book", async () => {
    const t = createTestKit();
    await t.act(plugin, "addBook", { name: "Ravi", kind: "person", emoji: "👨" });
    await send(t, "p1");
    await t.react(plugin, "👨🏽", refOf(t, "p1"));
    expect(billOf(t, "p1").state).toBe("filed");
  });

  it("5. 👍, ✅, 👌, 🙏 and ❌ file nothing, and an emoji no book has changes nothing", async () => {
    const t = await settled();
    await send(t, "p1");
    for (const e of ["👍", "✅", "👌", "🙏", "❌", "🦄"]) await t.react(plugin, e, refOf(t, "p1"));
    expect(billOf(t, "p1").state).toBe("to-tag");
  });

  it("removing a reaction from a bill filed another way leaves it filed", async () => {
    const t = await settled();
    await send(t, "p1", "acme");
    await t.react(plugin, null, refOf(t, "p1"));
    expect(billOf(t, "p1").state).toBe("filed");
  });

  it("6. a caption with a book's name files it, a number in it is the amount, a number alone files nothing", async () => {
    const t = await settled();
    await send(t, "p1", "acme uber 450");
    expect(billOf(t, "p1")).toMatchObject({ state: "filed", amount: 450, name: "uber", note: null, tagged: { how: "caption" } });
    expect(t.reactions.at(-1)).toBe("🏢");
    expect(t.sent.at(-1)!.text).toContain("Read from your caption");
    const after = t.sent.length;
    await send(t, "p2", "1200");
    expect(billOf(t, "p2")).toMatchObject({ state: "to-tag", amount: 1200 });
    expect(t.sent.length).toBe(after);
  });

  it("7. a reply with a book's name files it; a reply that fits two books gets one poll", async () => {
    const t = await settled();
    await t.act(plugin, "addBook", { name: "Acme Retail" });
    await send(t, "p1");
    await t.message(plugin, "home", refOf(t, "p1"));
    expect(billOf(t, "p1")).toMatchObject({ state: "filed", tagged: { how: "reply" } });
    await send(t, "p2");
    await t.message(plugin, "acme", refOf(t, "p2"));
    expect(t.asked).toHaveLength(0);
    // "acme" is the whole name of Acme, so it wins over a part of Acme Retail.
    expect(billOf(t, "p2").book).toBe(books(t).find((b) => b.name === "Acme")!.id);
    await t.act(plugin, "addBook", { name: "Acme Foods" });
    await send(t, "p3");
    await t.message(plugin, "retail foods", refOf(t, "p3"));
    expect(t.asked).toHaveLength(1);
    expect(t.asked[0].options).toEqual(["🛒 Acme Retail", "🚗 Acme Foods"]);
    await t.answer(plugin, t.asked[0].ref, 1);
    expect(billOf(t, "p3")).toMatchObject({ state: "filed", tagged: { how: "poll" } });
  });

  it("a reply that names no book asks which, and keeps the words as the name", async () => {
    const t = await settled();
    await send(t, "p1");
    await t.message(plugin, "diesel", refOf(t, "p1"));
    expect(billOf(t, "p1").name).toBe("diesel");
    expect(t.asked).toHaveLength(1);
  });

  it("a reply with an amount sets it without asking", async () => {
    const t = await settled();
    await send(t, "p1");
    await t.message(plugin, "₹1,250.50", refOf(t, "p1"));
    expect(billOf(t, "p1").amount).toBe(1250.5);
    expect(t.asked).toHaveLength(0);
  });

  it("a reply to a bill that was removed says so", async () => {
    const t = await settled();
    await send(t, "p1");
    const ref = refOf(t, "p1");
    await t.act(plugin, "remove", { id: ref.id });
    await t.message(plugin, "acme", ref);
    expect(t.sent.at(-1)!.text).toContain("isn't here");
  });

  it("10. a tap on the page files the bill and shows as my mark in WhatsApp", async () => {
    const t = await settled();
    await send(t, "p1");
    const [, home] = books(t);
    await t.act(plugin, "tag", { ids: [billOf(t, "p1").id], book: home.id });
    expect(t.reactTos.at(-1)).toEqual({ ref: refOf(t, "p1"), emoji: "🏠" });
    const page = (await t.load(plugin)) as any;
    expect(page.bills.find((b: any) => b.id === billOf(t, "p1").id).book).toBe(home.id);
    expect(page.books.find((b: any) => b.id === home.id).count).toBe(1);
  });
});

describe("invoice-holder: the page", () => {
  it("11. the load counts bills to tag and keeps a missing amount as null", async () => {
    const t = await settled();
    await send(t, "p1", "450");
    await send(t, "p2");
    const page = (await t.load(plugin)) as any;
    expect(page.total).toBe(3);
    expect(page.toTag).toBe(2);
    expect(page.bills.map((b: any) => b.amount).sort()).toEqual([450, null, null]);
  });

  it("12. removing a bill deletes its picture", async () => {
    const t = await settled();
    await send(t, "p1");
    await t.act(plugin, "remove", { id: billOf(t, "p1").id });
    expect(bills(t).some((b) => b.files[0].id === "p1")).toBe(false);
    expect(t.removedFiles).toContain("p1");
  });

  it("adds bills from the page, several at once in one batch", async () => {
    const t = await settled();
    t.addFile("w1");
    t.addFile("w2");
    const { ids } = (await t.act(plugin, "add", { photos: ["w1", "w2", "nope"] })) as any;
    expect(ids).toHaveLength(2);
    const added = bills(t).filter((b) => b.source === "page");
    expect(added).toHaveLength(2);
    expect(added[0].batch).toBe(added[1].batch);
    await expect(t.act(plugin, "add", { photo: "nope" })).rejects.toThrow("picture");
  });

  it("edits a bill's amount, date and note, and refuses nonsense", async () => {
    const t = await settled();
    await send(t, "p1");
    const id = billOf(t, "p1").id;
    await t.act(plugin, "edit", { id, amount: "1,200", billDate: "2026-11-02", note: " rent " });
    expect(billOf(t, "p1")).toMatchObject({ amount: 1200, billDate: "2026-11-02", note: "rent" });
    await t.act(plugin, "edit", { id, amount: null });
    expect(billOf(t, "p1").amount).toBeNull();
    await expect(t.act(plugin, "edit", { id, amount: "lots" })).rejects.toThrow();
    await expect(t.act(plugin, "edit", { id, billDate: "2nd Nov" })).rejects.toThrow();
    await expect(t.act(plugin, "edit", { id: "gone" })).rejects.toThrow();
  });

  it("14. an eighth book can be made on the page and has no emoji in WhatsApp", async () => {
    const t = createTestKit();
    for (const n of ["A1", "B1", "C1", "D1", "E1", "F1", "G1", "H1"]) await t.act(plugin, "addBook", { name: n });
    const all = books(t);
    expect(all.filter((b) => b.emoji)).toHaveLength(7);
    expect(all.find((b) => b.name === "H1")!.emoji).toBeNull();
    await expect(t.act(plugin, "editBook", { id: all.find((b) => b.name === "H1")!.id, emoji: "🦄" })).rejects.toThrow("Seven");
  });

  it("book emoji are checked: never a done-mark, never another book's", async () => {
    const t = await settled();
    const [acme, home] = books(t);
    await expect(t.act(plugin, "editBook", { id: acme.id, emoji: "✅" })).rejects.toThrow("done");
    await expect(t.act(plugin, "editBook", { id: acme.id, emoji: "🏠" })).rejects.toThrow("Home");
    await expect(t.act(plugin, "editBook", { id: acme.id, emoji: "ab" })).rejects.toThrow();
    await expect(t.act(plugin, "addBook", { name: "acme" })).rejects.toThrow("already");
    await expect(t.act(plugin, "addBook", { name: "X", gst: "123" })).rejects.toThrow("GST");
    await t.act(plugin, "editBook", { id: home.id, gst: "29abcde1234f1z5", kind: "business" });
    expect(books(t)[1]).toMatchObject({ gst: "29ABCDE1234F1Z5", kind: "business" });
  });

  it("a new emoji for a book changes the mark on its bills in WhatsApp", async () => {
    const t = await settled();
    const [acme] = books(t);
    await t.act(plugin, "editBook", { id: acme.id, emoji: "🦄" });
    expect(t.reactTos.at(-1)).toEqual({ ref: refOf(t, "p0"), emoji: "🦄" });
  });

  it("removing a book leaves its bills, unfiled", async () => {
    const t = await settled();
    const [acme] = books(t);
    await t.act(plugin, "removeBook", { id: acme.id });
    expect(books(t)).toHaveLength(1);
    expect(billOf(t, "p0")).toMatchObject({ state: "to-tag", book: null });
  });
});

describe("invoice-holder: other messages", () => {
  it("books lists the books with their emoji", async () => {
    const t = await settled();
    await t.message(plugin, "books");
    expect(t.sent.at(-1)!.text).toContain("🏢 Acme");
    expect(t.sent.at(-1)!.text).toContain("🏠 Home");
  });

  it("anything else goes to the intent model with a plain fallback", async () => {
    const t = await settled();
    await t.message(plugin, "hello there");
    expect(t.unsures).toHaveLength(1);
  });

  it("help sends the help", async () => {
    const t = createTestKit();
    await t.message(plugin, "help");
    expect(t.sent[0].text).toBe(plugin.help);
  });

  it("a stale or foreign ref changes nothing", async () => {
    const t = await settled();
    await t.react(plugin, "🏢", { kind: "bill", id: "nope" });
    await t.react(plugin, "🏢", { something: "else" });
    expect(bills(t)).toHaveLength(1);
  });
});

describe("invoice-holder: reading captions", () => {
  const B = [
    { id: "a", name: "Acme Foods" },
    { id: "r", name: "Acme Retail" },
    { id: "h", name: "Home" },
  ];
  it.each([
    ["acme foods uber 450", "a", [], 450, "uber"],
    ["acme 450", null, ["a", "r"], 450, "acme"],
    ["home rs 1,200 electricity", "h", [], 1200, "electricity"],
    ["acme inv 4471 2100", null, ["a", "r"], null, "acme inv 4471 2100"],
    ["home 12 nov 450", "h", [], null, "12 nov 450"],
    ["₹99.50", null, [], 99.5, null],
    ["payment for homework", null, [], null, "payment for homework"],
    ["450/- home", "h", [], 450, null],
  ])("%s", (text, book, books, amount, note) => {
    const { currency: _, ...rest } = readWords(text, B);
    expect(rest).toEqual({ book, books, amount, note });
  });
});

describe("invoice-holder: 1.1.0", () => {
  it("knows the day of the week", () => {
    expect(weekday("2026-11-29")).toBe(0);
    expect(weekday("2026-11-26")).toBe(4);
    expect(weekday("2027-01-01")).toBe(5);
    expect(weekday("2024-02-29")).toBe(4);
  });

  it("a deleted photo keeps its bill, and says so", async () => {
    const t = await settled();
    await send(t, "p1");
    await t.deleted(plugin, refOf(t, "p1"));
    expect(billOf(t, "p1")).toBeTruthy();
    expect(t.sent.at(-1)!.text).toContain("still kept on your page");
  });

  it("a deleted message whose bill was already removed says nothing", async () => {
    const t = await settled();
    await send(t, "p1");
    const ref = refOf(t, "p1");
    await t.act(plugin, "remove", { id: ref.id });
    const before = t.sent.length;
    await t.deleted(plugin, ref);
    expect(t.sent.length).toBe(before);
  });

  it("on Sunday, says how many bills wait for a folder, once, and nothing when none wait", async () => {
    const t = await settled();
    await send(t, "p1");
    await send(t, "p2");
    t.setToday("2026-11-28");
    let before = t.sent.length;
    await t.schedule(plugin, "waiting");
    expect(t.sent.length).toBe(before);
    t.setToday("2026-11-29");
    await t.schedule(plugin, "waiting");
    expect(t.sent.at(-1)!.text).toBe("2 bills have no folder yet. They are kept either way.\n\nTo file one, react to it with a folder's emoji, or use your page.");
    before = t.sent.length;
    await t.schedule(plugin, "waiting");
    expect(t.sent.length).toBe(before);
    for (const f of ["p1", "p2"]) await t.react(plugin, "🏠", refOf(t, f));
    t.setToday("2026-12-06");
    await t.schedule(plugin, "waiting");
    expect(t.sent.length).toBe(before);
  });

  it("on the 1st, says how the month before went, once", async () => {
    const t = createTestKit({ today: "2026-11-10" });
    await send(t, "p0");
    await t.message(plugin, "Acme");
    await send(t, "p1", "acme 450");
    await send(t, "p2", "rs 1,200");
    t.setToday("2026-11-30");
    let before = t.sent.length;
    await t.schedule(plugin, "month");
    expect(t.sent.length).toBe(before);
    t.setToday("2026-12-01");
    await t.schedule(plugin, "month");
    expect(t.sent.at(-1)!.text).toBe("November 2026: 3 bills. 2 have an amount: ₹1,650. All 3 are on your page.");
    before = t.sent.length;
    await t.schedule(plugin, "month");
    expect(t.sent.length).toBe(before);
    t.setToday("2027-01-01");
    await t.schedule(plugin, "month");
    expect(t.sent.length).toBe(before);
  });
});

describe("invoice-holder: a bill by mail", () => {
  it("keeps a mail's PDF as a bill waiting for a folder, with its sender, and says only the note question (1.4.0)", async () => {
    const t = await settled();
    const before = t.sent.length;
    expect(await t.mail(plugin, mail({ id: "m1", label: "hdfc", files: [{ id: "f1", type: "application/pdf", size: 9000 }] }))).toBe("took");
    expect(t.sent.slice(before).map((s) => (s.ref as any)?.kind)).toEqual(["note"]);
    expect(billOf(t, "f1")).toMatchObject({ source: "mail", state: "to-tag", book: null, mail: { from: "billing@example.com", domain: "example.com", label: "hdfc", id: "m1" } });
    const page = (await t.load(plugin)) as any;
    expect(JSON.stringify(page)).toContain("billing@example.com");
  });

  it("files a bill from a sender whose last bill was filed into the same folder", async () => {
    const t = await settled();
    await t.mail(plugin, mail({ id: "m1", files: [{ id: "f1", type: "application/pdf", size: 9000 }] }));
    const acme = books(t).find((b) => b.name === "Acme")!;
    await t.act(plugin, "tag", { id: billOf(t, "f1").id, book: acme.id });
    await t.mail(plugin, mail({ id: "m2", files: [{ id: "f2", type: "application/pdf", size: 9000 }] }));
    expect(billOf(t, "f2")).toMatchObject({ state: "filed", book: acme.id, tagged: { how: "sender" } });
  });

  it("does not take a mail with no PDF, and keeps one mail once", async () => {
    const t = await settled();
    expect(await t.mail(plugin, mail({ id: "m1", files: [] }))).toBe("not-for-me");
    expect(await t.mail(plugin, mail({ id: "m2" }))).toBe("took");
    expect(await t.mail(plugin, mail({ id: "m2" }))).toBe("took");
    expect(bills(t).filter((b) => b.source === "mail")).toHaveLength(1);
  });
});

describe("invoice-holder: 1.2.1", () => {
  it("a flag, a keycap or a tagged flag can be a folder's emoji, and files by reaction", async () => {
    const t = createTestKit();
    await t.act(plugin, "addBook", { name: "Eetaa Inc", emoji: "🇺🇸" });
    await t.act(plugin, "addBook", { name: "Home", emoji: "1️⃣" });
    await t.act(plugin, "addBook", { name: "London", emoji: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" });
    expect(books(t).map((b) => b.emoji)).toEqual(["🇺🇸", "1️⃣", "🏴󠁧󠁢󠁥󠁮󠁧󠁿"]);
    await send(t, "p1");
    await t.react(plugin, "🇺🇸", refOf(t, "p1"));
    expect(billOf(t, "p1").book).toBe(books(t)[0].id);
    await expect(t.act(plugin, "addBook", { name: "Two", emoji: "🇺🇸🇮🇳" })).rejects.toThrow("one emoji");
  });
});

describe("invoice-holder: 1.3.0", () => {
  const pdf = (id: string) => ({ id, type: "application/pdf" as const, size: 9000 });

  it("each PDF of a mail is its own bill, marked which of how many", async () => {
    const t = createTestKit();
    expect(await t.mail(plugin, mail({ id: "m1", files: [pdf("f1"), pdf("f2"), pdf("f3")] }))).toBe("took");
    const got = bills(t).filter((b) => b.source === "mail").sort((a, b) => (a.mail!.part ?? 0) - (b.mail!.part ?? 0));
    expect(got.map((b) => [b.files[0].id, b.mail!.part, b.mail!.of])).toEqual([["f1", 1, 3], ["f2", 2, 3], ["f3", 3, 3]]);
    expect(new Set(got.map((b) => b.batch)).size).toBe(1);
    expect(await t.mail(plugin, mail({ id: "m1", files: [pdf("f1")] }))).toBe("took");
    expect(bills(t).filter((b) => b.source === "mail")).toHaveLength(3);
    const page = (await t.load(plugin)) as any;
    expect(page.bills[0].mail).toMatchObject({ kind: "company", of: 3 });
  });

  it("a forward is never filed by sender; a company's next bill is", async () => {
    const t = createTestKit();
    await t.act(plugin, "addBook", { name: "Acme" });
    const acme = books(t)[0].id;
    const me = { address: "me@gmail.com", domain: "gmail.com", kind: "mailbox" as const };
    await t.mail(plugin, mail({ id: "a1", from: me, files: [pdf("a1")] }));
    await t.act(plugin, "tag", { ids: [billOf(t, "a1").id], book: acme });
    await t.mail(plugin, mail({ id: "a2", from: me, files: [pdf("a2")] }));
    expect(billOf(t, "a2")).toMatchObject({ state: "to-tag", mail: { kind: "mailbox" } });
    await t.mail(plugin, mail({ id: "c1", files: [pdf("c1")] }));
    await t.act(plugin, "tag", { ids: [billOf(t, "c1").id], book: acme });
    await t.mail(plugin, mail({ id: "c2", files: [pdf("c2")] }));
    expect(billOf(t, "c2")).toMatchObject({ state: "filed", book: acme, tagged: { how: "sender" } });
  });
});

describe("invoice-holder: 1.4.0, a note asked for when a bill comes by mail", () => {
  const pdf = (id: string) => ({ id, type: "application/pdf" as const, size: 9000 });
  const monid = { address: "billing@monid.com", domain: "monid.com", kind: "company" as const };
  const fresh = (t: T, id: string, files = [pdf(`${id}-f`)], from: { address: string; domain: string; kind: "company" | "mailbox" } = monid, extra = {}) => t.mail(plugin, mail({ id, at: t.kit.now, from, files, ...extra }));
  const question = (t: T) => t.sent.filter((s) => (s.ref as any)?.kind === "note");
  const ofMail = (t: T, id: string) => bills(t).filter((b) => b.mail?.id === id);
  const kit10 = () => createTestKit({ today: "2026-11-27", hour: 10 });

  it("1, 15. a company's bill: one message naming the sender; long the first time, short after", async () => {
    const t = kit10();
    await fresh(t, "m1");
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].text).toContain("Monid");
    expect(t.sent[0].text).not.toContain("monid.com");
    expect(t.sent[0].text).toContain("Sorry, I can't read a bill yet");
    expect(t.sent[0].text).toContain("Embarrassing, for a butler.");
    t.setHour(11);
    await fresh(t, "m2");
    expect(t.sent[1].text).toBe("A bill from Monid came by mail. What is it for?");
  });

  it("2, 3. a plain line within 10 minutes is the whole note, never read for a folder or an amount", async () => {
    const t = kit10();
    await t.act(plugin, "addBook", { name: "Acme" });
    await fresh(t, "m1");
    await t.message(plugin, "3 licences for Acme");
    expect(ofMail(t, "m1")[0]).toMatchObject({ note: "3 licences for Acme", amount: null, state: "to-tag", noteBy: "now" });
    expect(t.sent.at(-1)!.text).toContain("Noted on the bill");
    t.setHour(11);
    await fresh(t, "m2");
    await t.message(plugin, "Video generation credits");
    expect(ofMail(t, "m2")[0].note).toBe("Video generation credits");
    expect(t.reactions.at(-1)).toBe("👍");
  });

  it("4, 5. a reply to the question later sets the note, and a second reply replaces it", async () => {
    const t = kit10();
    await fresh(t, "m1");
    const q = question(t)[0].ref;
    await t.message(plugin, "", null, null, undefined, undefined, { photos: [photo("p1")] });
    t.setHour(12);
    await t.message(plugin, "credits", q);
    await t.message(plugin, "credits for the demo", q);
    const b = ofMail(t, "m1")[0];
    expect(b.note).toBe("credits for the demo");
    expect(b.history.filter((h) => h.what === "changed")).toHaveLength(2);
  });

  it("6. no means no note, and the next plain line is not a note", async () => {
    const t = kit10();
    await fresh(t, "m1");
    await t.message(plugin, "No.");
    expect(ofMail(t, "m1")[0]).toMatchObject({ note: null, noteBy: "no" });
    expect(t.reactions.at(-1)).toBe("👍");
    await t.message(plugin, "lunch");
    expect(ofMail(t, "m1")[0].note).toBeNull();
    expect(t.unsures).toHaveLength(1);
  });

  it("7. a folder's emoji on the question files the bill; taking it off unfiles it", async () => {
    const t = kit10();
    await t.act(plugin, "addBook", { name: "Acme" });
    await fresh(t, "m1");
    const q = question(t)[0].ref;
    await t.react(plugin, "🏢", q);
    expect(ofMail(t, "m1")[0]).toMatchObject({ state: "filed", tagged: { how: "reaction" } });
    await t.react(plugin, null, q);
    expect(ofMail(t, "m1")[0].state).toBe("to-tag");
  });

  it("8. a mail with three PDFs: one question, and the note goes on all three", async () => {
    const t = kit10();
    await fresh(t, "m1", [pdf("a"), pdf("b"), pdf("c")]);
    expect(question(t)).toHaveLength(1);
    await t.message(plugin, "team laptops");
    expect(ofMail(t, "m1").map((b) => b.note)).toEqual(["team laptops", "team laptops", "team laptops"]);
  });

  it("9. two questions open at once: a plain line goes to neither; a reply goes to the one replied to", async () => {
    const t = kit10();
    await fresh(t, "m1");
    await fresh(t, "m2", [pdf("m2-f")], { address: "x@airtel.in", domain: "airtel.in", kind: "company" });
    await t.message(plugin, "which one?");
    expect([ofMail(t, "m1")[0].note, ofMail(t, "m2")[0].note]).toEqual([null, null]);
    await t.message(plugin, "broadband", question(t)[1].ref);
    expect(ofMail(t, "m2")[0].note).toBe("broadband");
  });

  it("10. three monthly bills with no notes, then a fourth: no question", async () => {
    const t = kit10();
    for (const [i, day] of ["2026-08-27", "2026-09-27", "2026-10-27"].entries()) {
      t.setToday(day);
      await fresh(t, `m${i}`);
      await t.message(plugin, "no");
    }
    t.setToday("2026-11-27");
    const before = question(t).length;
    await fresh(t, "m4");
    expect(question(t).length).toBe(before);
  });

  it("11. two questions left with no note stop the asking; a note on the page starts it again", async () => {
    const t = kit10();
    await fresh(t, "m1");
    t.setHour(12);
    await fresh(t, "m2");
    t.setHour(14);
    await fresh(t, "m3");
    expect(question(t)).toHaveLength(2);
    await t.act(plugin, "edit", { id: ofMail(t, "m2")[0].id, note: "renewal" });
    t.setHour(16);
    await fresh(t, "m4");
    expect(question(t)).toHaveLength(3);
  });

  it("12, 13, 14. never for old mail, never when the platform says no lines are left, never at night", async () => {
    const t = kit10();
    await t.mail(plugin, mail({ id: "old", at: t.kit.now - 3 * 3600_000, from: monid, files: [pdf("o")] }));
    await fresh(t, "capped", [pdf("c")], monid, { lines: 0 });
    t.setHour(3);
    await fresh(t, "night");
    expect(question(t)).toHaveLength(0);
    expect(bills(t).filter((b) => b.source === "mail")).toHaveLength(3);
  });

  it("a forward is always asked about, by what it is, not who sent it", async () => {
    const t = kit10();
    await t.act(plugin, "setSenderAsk", { from: "me@gmail.com", ask: "no" });
    await fresh(t, "m1", [pdf("f")], { address: "me@gmail.com", domain: "gmail.com", kind: "mailbox" });
    expect(question(t)[0].text).toContain("The bill you forwarded");
  });

  it("the page can stop or force the question for a sender", async () => {
    const t = kit10();
    await t.act(plugin, "setSenderAsk", { from: "Billing@Monid.com", ask: "no" });
    await fresh(t, "m1");
    expect(question(t)).toHaveLength(0);
    await t.act(plugin, "setSenderAsk", { from: "billing@monid.com", ask: "auto" });
    t.setHour(12);
    await fresh(t, "m2");
    expect(question(t)).toHaveLength(1);
    expect(((await t.load(plugin)) as any).senders).toEqual({});
  });
});

describe("invoice-holder: 1.5.0, a name apart from the note", () => {
  it("a long caption is the note, a short one the name; the page sets either, and a note keeps its lines", async () => {
    const t = createTestKit();
    const long = "credits for the video campaign, split across the three client projects we are running this quarter";
    await send(t, "p1", long);
    expect(billOf(t, "p1")).toMatchObject({ name: null, note: long });
    await t.act(plugin, "edit", { id: billOf(t, "p1").id, name: "  Video   credits ", note: "line one\n\n\n\nline   two" });
    expect(billOf(t, "p1")).toMatchObject({ name: "Video credits", note: "line one\n\nline two" });
    await t.act(plugin, "edit", { id: billOf(t, "p1").id, name: "x".repeat(90) });
    expect(billOf(t, "p1").name).toHaveLength(60);
    const page = (await t.load(plugin)) as any;
    expect(page.bills[0].name).toHaveLength(60);
  });

  it("the answer to the note question is the note, however short, never the name", async () => {
    const t = createTestKit({ today: "2026-11-27", hour: 10 });
    await t.mail(plugin, mail({ id: "m1", at: t.kit.now, files: [{ id: "f", type: "application/pdf", size: 9 }] }));
    await t.message(plugin, "credits");
    const b = bills(t).find((x) => x.mail?.id === "m1")!;
    expect(b.note).toBe("credits");
    expect(b.name ?? null).toBeNull();
  });
});

describe("invoice-holder: 1.6.0, an amount in rupees or dollars", () => {
  const B = [{ id: "m", name: "Monid" }];
  it.each([
    ["monid $52.50", 52.5, "USD"],
    ["monid usd 52", 52, "USD"],
    ["monid 52 dollars", 52, "USD"],
    ["monid ₹450", 450, "INR"],
    ["monid rs 1,200", 1200, "INR"],
    ["monid 450/-", 450, "INR"],
    ["monid 450", 450, null],
  ])("%s", (text, amount, currency) => {
    expect(readWords(text, B)).toMatchObject({ book: "m", amount, currency });
  });

  it("a caption's dollars stay dollars; the page can change a bill's currency", async () => {
    const t = createTestKit();
    await send(t, "p1", "$52.50");
    expect(billOf(t, "p1")).toMatchObject({ amount: 52.5, currency: "USD" });
    await t.act(plugin, "edit", { id: billOf(t, "p1").id, currency: "INR" });
    expect(billOf(t, "p1").currency).toBe("INR");
    await t.act(plugin, "edit", { id: billOf(t, "p1").id, currency: "EUR" });
    expect(billOf(t, "p1").currency).toBeNull();
    expect(((await t.load(plugin)) as any).bills[0].currency).toBeNull();
  });

  it("the month's line never adds rupees and dollars together", async () => {
    const t = createTestKit({ today: "2026-11-10" });
    await send(t, "p0");
    await t.message(plugin, "Acme");
    await send(t, "p1", "acme 450");
    await send(t, "p2", "$52.50");
    t.setToday("2026-12-01");
    await t.schedule(plugin, "month");
    expect(t.sent.at(-1)!.text).toBe("November 2026: 3 bills. 2 have an amount: ₹450 and $52.50. All 3 are on your page.");
  });
});

describe("invoice-holder: 1.7.0, what the bill says", () => {
  const monid = { address: "billing@monid.com", domain: "monid.com", kind: "company" as const };
  const pdf = (id: string, read?: Partial<MailRead>) => ({ id, type: "application/pdf" as const, size: 9000, ...(read ? { read: { state: "read", ...read } as MailRead } : {}) });
  const kit = () => createTestKit({ today: "2026-11-27", hour: 10 });
  const bill = (t: T, mailId: string) => bills(t).find((b) => b.mail?.id === mailId)!;

  it("keeps what the reader found as the bill's amount, currency and date, and the rest as facts", async () => {
    const t = kit();
    await t.mail(plugin, mail({ id: "m1", at: t.kit.now, from: monid, files: [pdf("f1", { state: "read", amount: 52.5, currency: "USD", date: "2026-11-26", due: "2026-12-10", number: "MON-1184", gstins: ["29ABCDE1234F1Z5"], seller: "Monid Technologies Pvt Ltd" })] }));
    expect(bill(t, "m1")).toMatchObject({ amount: 52.5, currency: "USD", billDate: "2026-11-26", facts: { number: "MON-1184", due: "2026-12-10", seller: "Monid Technologies Pvt Ltd" } });
    await t.mail(plugin, mail({ id: "m2", at: t.kit.now, from: monid, files: [pdf("f2", { state: "locked" })] }));
    expect(bill(t, "m2")).toMatchObject({ amount: null, facts: null });
  });

  it("files by a GST number that is exactly one folder's, before anything else", async () => {
    const t = kit();
    await t.act(plugin, "addBook", { name: "NVerse", gst: "29ABCDE1234F1Z5" });
    await t.act(plugin, "addBook", { name: "Home", kind: "person" });
    await t.mail(plugin, mail({ id: "m1", at: t.kit.now, from: monid, files: [pdf("f1", { state: "read", gstins: ["29abcde1234f1z5".toUpperCase()] })] }));
    expect(bill(t, "m1")).toMatchObject({ state: "filed", tagged: { how: "gstin" } });
    expect(t.sorts).toHaveLength(0);
  });

  it("then by the seller's name against folder names, in our own code", async () => {
    const t = kit();
    await t.act(plugin, "addBook", { name: "Monid" });
    await t.act(plugin, "addBook", { name: "Home" });
    await t.mail(plugin, mail({ id: "m1", at: t.kit.now, from: monid, files: [pdf("f1", { state: "read", seller: "Monid Technologies Pvt Ltd" })] }));
    expect(bill(t, "m1")).toMatchObject({ state: "filed", tagged: { how: "seller" } });
    expect(t.sorts).toHaveLength(0);
  });

  it("only then asks jev, with the seller's letters alone, and files it as a guess if still unfiled", async () => {
    const t = kit();
    await t.act(plugin, "addBook", { name: "NVerse" });
    await t.act(plugin, "addBook", { name: "Uyir Healthcare" });
    await t.mail(plugin, mail({ id: "m1", at: t.kit.now, from: monid, files: [pdf("f1", { state: "read", amount: 900, seller: "Apollo Pharmacy 24x7 GSTIN 29XYZ" })] }));
    expect(bill(t, "m1").state).toBe("to-tag");
    expect(t.sorts).toHaveLength(1);
    expect(t.sorts[0].text).toBe("Apollo Pharmacy x GSTIN XYZ");
    expect(t.sorts[0].text).not.toMatch(/\d/);
    expect(Object.values(t.sorts[0].choices)).toEqual(["NVerse", "Uyir Healthcare"]);
    const uyir = books(t).find((b) => b.name === "Uyir Healthcare")!.id;
    await t.sorted(plugin, "Apollo Pharmacy x GSTIN XYZ", uyir);
    expect(bill(t, "m1")).toMatchObject({ state: "filed", book: uyir, tagged: { how: "guess" } });
  });

  it("a guess never moves a bill the person filed meanwhile, and no answer changes nothing", async () => {
    const t = kit();
    await t.act(plugin, "addBook", { name: "NVerse" });
    await t.act(plugin, "addBook", { name: "Home" });
    await t.mail(plugin, mail({ id: "m1", at: t.kit.now, from: monid, files: [pdf("f1", { state: "read", seller: "Apollo Pharmacy" })] }));
    const [nverse, home] = books(t);
    await t.act(plugin, "tag", { ids: [bill(t, "m1").id], book: home.id });
    await t.sorted(plugin, "Apollo Pharmacy", nverse.id);
    expect(bill(t, "m1")).toMatchObject({ book: home.id, tagged: { how: "page" } });
  });

  it("no jev without a seller, or with fewer than two folders", async () => {
    const t = kit();
    await t.act(plugin, "addBook", { name: "NVerse" });
    await t.mail(plugin, mail({ id: "m1", at: t.kit.now, from: monid, files: [pdf("f1", { state: "read", seller: "Apollo Pharmacy" })] }));
    await t.act(plugin, "addBook", { name: "Home" });
    await t.mail(plugin, mail({ id: "m2", at: t.kit.now, from: { ...monid, address: "x@y.com" }, files: [pdf("f2", { state: "read", amount: 5 })] }));
    expect(t.sorts).toHaveLength(0);
  });
});

describe("invoice-holder: 1.8.0, read again", () => {
  const monid = { address: "billing@monid.com", domain: "monid.com", kind: "company" as const };
  const kit = () => createTestKit({ today: "2026-11-27", hour: 10 });
  const read = (r: Partial<MailRead>) => ({ state: "read", ...r }) as MailRead;
  const only = (t: T) => bills(t)[0];

  it("reads a bill's PDF again and fills what the person hasn't changed, marked as what the bill says", async () => {
    const t = kit();
    await t.mail(plugin, mail({ id: "m1", at: t.kit.now, from: monid, files: [{ id: "f1", type: "application/pdf", size: 9000 }] }));
    await t.act(plugin, "edit", { id: only(t).id, billDate: "2026-11-01" });
    await t.act(plugin, "reread", { id: only(t).id });
    expect(t.fileReads).toEqual([{ id: "f1", ref: { kind: "reread", bill: only(t).id } }]);
    expect(only(t).reading).toBeTruthy();
    await t.fileRead(plugin, "f1", read({ amount: 1180, currency: "INR", date: "2026-11-20", number: "INV-9" }));
    expect(only(t)).toMatchObject({ amount: 1180, currency: "INR", billDate: "2026-11-01", reading: null, unread: null, facts: { number: "INV-9" } });
  });

  it("replaces what an earlier reading said, but never what the person typed", async () => {
    const t = kit();
    await t.mail(plugin, mail({ id: "m1", at: t.kit.now, from: monid, files: [{ id: "f1", type: "application/pdf", size: 9000, read: read({ amount: 10, date: "2026-11-02" }) }] }));
    await t.act(plugin, "edit", { id: only(t).id, amount: 25 });
    await t.act(plugin, "reread", { id: only(t).id });
    await t.fileRead(plugin, "f1", read({ amount: 99, date: "2026-11-03" }));
    expect(only(t)).toMatchObject({ amount: 25, billDate: "2026-11-03" });
  });

  it("says why when it can't read it, and files an unfiled bill by what it found", async () => {
    const t = kit();
    await t.act(plugin, "addBook", { name: "Apollo" });
    await t.mail(plugin, mail({ id: "m1", at: t.kit.now, from: { ...monid, kind: "mailbox" }, files: [{ id: "f1", type: "application/pdf", size: 9000 }] }));
    await t.act(plugin, "reread", { id: only(t).id });
    await t.fileRead(plugin, "f1", { state: "locked" } as MailRead);
    expect(only(t)).toMatchObject({ unread: "locked", reading: null, state: "to-tag" });
    await t.act(plugin, "reread", { id: only(t).id });
    await t.fileRead(plugin, "f1", read({ seller: "Apollo Pharmacy" }));
    expect(only(t)).toMatchObject({ unread: null, state: "filed", tagged: { how: "seller" } });
  });

  it("only PDFs, and the Gmail link only from the mail's own Message-ID", async () => {
    const t = kit();
    await t.mail(plugin, mail({ id: "m1", at: t.kit.now, from: monid, messageId: "abc@mail.monid.com", files: [{ id: "f1", type: "application/pdf", size: 9000 }] }));
    const page = await t.load(plugin);
    expect((page as { bills: { gmail: string | null }[] }).bills[0].gmail).toBe("https://mail.google.com/mail/u/0/#search/rfc822msgid:abc%40mail.monid.com");
    await t.act(plugin, "add", { files: [{ id: "p1", type: "image/jpeg" }] }).catch(() => {});
    const photo = bills(t).find((b) => b.source !== "mail");
    if (photo) await expect(t.act(plugin, "reread", { id: photo.id })).rejects.toThrow(/PDF/);
  });
});

describe("invoice-holder: 1.9.0, not bills", () => {
  const mmt = { address: "noreply@makemytrip.com", domain: "makemytrip.com", kind: "company" as const };
  const kit = () => createTestKit({ today: "2026-11-27", hour: 10 });
  const pdf = (id: string, read: Partial<MailRead>) => ({ id, type: "application/pdf" as const, size: 9000, read: { state: "read", ...read } as MailRead });
  const byMail = (t: T, id: string) => bills(t).find((b) => b.mail?.id === id)!;

  it("sets a not-bill aside: unfiled, no note question, out of the counts; unsure stays a bill", async () => {
    const t = kit();
    await t.act(plugin, "addBook", { name: "Travel" });
    await t.act(plugin, "addBook", { name: "Home" });
    await t.mail(plugin, mail({ id: "m1", at: t.kit.now, from: mmt, files: [pdf("f1", { kind: "not-bill", sort: "ticket", seller: "MakeMyTrip" })] }));
    expect(byMail(t, "m1")).toMatchObject({ aside: { sort: "ticket", by: "reader" }, book: null });
    expect(t.sorts).toHaveLength(0);
    expect(t.sent.join("\n")).not.toMatch(/What is it for/);
    const page = (await t.load(plugin)) as { toTag: number; notBills: number };
    expect(page).toMatchObject({ toTag: 0, notBills: 1 });
    await t.mail(plugin, mail({ id: "m2", at: t.kit.now, from: { ...mmt, address: "x@y.com", domain: "y.com" }, files: [pdf("f2", { kind: "unsure" })] }));
    expect(byMail(t, "m2").aside ?? null).toBeNull();
  });

  it("brought back twice from one sender stops setting theirs aside", async () => {
    const t = kit();
    for (const id of ["m1", "m2"]) {
      await t.mail(plugin, mail({ id, at: t.kit.now, from: mmt, files: [pdf(`f${id}`, { kind: "not-bill", sort: "ticket" })] }));
      await t.act(plugin, "bringBack", { id: byMail(t, id).id });
      expect(byMail(t, id).aside).toBeNull();
    }
    await t.mail(plugin, mail({ id: "m3", at: t.kit.now, from: mmt, files: [pdf("f3", { kind: "not-bill", sort: "ticket" })] }));
    expect(byMail(t, "m3").aside).toBeNull();
  });

  it("set aside by hand twice sets that sender's aside from then on, by the forward's original domain", async () => {
    const t = kit();
    const me = { address: "me@gmail.com", domain: "gmail.com", kind: "mailbox" as const };
    for (const id of ["m1", "m2"]) {
      await t.mail(plugin, mail({ id, at: t.kit.now, from: me, forwarded: { domain: "Zerodha.com" }, files: [pdf(`f${id}`, { kind: "bill" })] }));
      await t.act(plugin, "setAside", { ids: [byMail(t, id).id] });
    }
    expect(byMail(t, "m1").mail?.forwarded).toBe("zerodha.com");
    await t.mail(plugin, mail({ id: "m3", at: t.kit.now, from: me, forwarded: { domain: "zerodha.com" }, files: [pdf("f3", { kind: "bill" })] }));
    expect(byMail(t, "m3").aside).toMatchObject({ by: "reader" });
    await t.mail(plugin, mail({ id: "m4", at: t.kit.now, from: me, forwarded: { domain: "airtel.com" }, files: [pdf("f4", { kind: "bill" })] }));
    expect(byMail(t, "m4").aside ?? null).toBeNull();
  });

  it("read again re-sorts, unless the person chose", async () => {
    const t = kit();
    await t.mail(plugin, mail({ id: "m1", at: t.kit.now, from: mmt, files: [{ id: "f1", type: "application/pdf", size: 9000 }] }));
    await t.act(plugin, "reread", { id: byMail(t, "m1").id });
    await t.fileRead(plugin, "f1", { state: "read", kind: "not-bill", sort: "ticket" } as MailRead);
    expect(byMail(t, "m1").aside).toMatchObject({ sort: "ticket" });
    await t.act(plugin, "bringBack", { id: byMail(t, "m1").id });
    await t.act(plugin, "reread", { id: byMail(t, "m1").id });
    await t.fileRead(plugin, "f1", { state: "read", kind: "not-bill", sort: "ticket" } as MailRead);
    expect(byMail(t, "m1").aside).toBeNull();
  });
});
