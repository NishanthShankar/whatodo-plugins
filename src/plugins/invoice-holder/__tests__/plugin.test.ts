import { describe, expect, it } from "vitest";
import plugin, { type Bill, type Book, weekday } from "..";
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
    expect(billOf(t, "p1")).toMatchObject({ state: "filed", amount: 450, note: "uber", tagged: { how: "caption" } });
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

  it("a reply that names no book asks which, and keeps the words as the note", async () => {
    const t = await settled();
    await send(t, "p1");
    await t.message(plugin, "diesel", refOf(t, "p1"));
    expect(billOf(t, "p1").note).toBe("diesel");
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
    expect(readWords(text, B)).toEqual({ book, books, amount, note });
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
    expect(t.sent.at(-1)!.text).toBe("2 bills are waiting for a folder. React to each with a folder's emoji, or file them on your page.");
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
  it("keeps a mail's PDF as a bill waiting for a folder, with its sender, and says nothing", async () => {
    const t = await settled();
    const before = t.sent.length;
    expect(await t.mail(plugin, mail({ id: "m1", label: "hdfc", files: [{ id: "f1", type: "application/pdf", size: 9000 }] }))).toBe("took");
    expect(t.sent.length).toBe(before);
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
