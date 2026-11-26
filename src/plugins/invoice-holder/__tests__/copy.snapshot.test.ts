/**
 * Every reply InvoiceHolder can give, captured exactly. A change here is a change people see.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { useRandom } from "../../../copy";
import { createTestKit, mail, photo } from "../../../testing";
import plugin from "../index";

type T = ReturnType<typeof createTestKit>;

beforeAll(() => useRandom(() => 0));
afterAll(() => useRandom());

const said = (t: T) => ({ sent: t.sent.map((s) => s.text), reactions: t.reactions, reactTos: t.reactTos.map((r) => r.emoji), asked: t.asked.map((a) => [a.question, a.options]), unsures: t.unsures });
const send = (t: T, id: string, caption = "") => t.message(plugin, caption, null, null, undefined, undefined, { photos: [photo(id)] });

describe("invoice-holder copy", () => {
  it("welcome, help and group name", () => {
    expect({ welcome: plugin.welcome, help: plugin.help, groupName: plugin.groupName }).toMatchSnapshot();
  });

  it("the first five minutes", async () => {
    const t = createTestKit();
    await send(t, "p1");
    await t.message(plugin, "Acme Traders");
    await send(t, "p2", "acme uber 450");
    await send(t, "p3");
    expect(said(t)).toMatchSnapshot();
  });

  it("the first bill when books were made on the page", async () => {
    const t = createTestKit();
    await t.act(plugin, "addBook", { name: "Acme" });
    await t.act(plugin, "addBook", { name: "Home", kind: "person" });
    await send(t, "p1");
    expect(said(t)).toMatchSnapshot();
  });

  it("books, a poll, a gone bill, and a message it can't read", async () => {
    const t = createTestKit();
    await t.message(plugin, "books");
    await t.act(plugin, "addBook", { name: "Acme" });
    await t.act(plugin, "addBook", { name: "Home" });
    for (let i = 0; i < 7; i++) await t.act(plugin, "addBook", { name: `Extra ${i}` });
    await t.message(plugin, "books");
    await send(t, "p1");
    const ref = { kind: "bill", id: Object.keys(t.dump()).find((k) => k.startsWith("bills/"))!.slice(6) };
    await t.message(plugin, "diesel", ref);
    await t.act(plugin, "remove", { id: ref.id });
    await t.message(plugin, "acme", ref);
    await t.message(plugin, "hello");
    expect(said(t)).toMatchSnapshot();
  });

  it("1.1.0: a deleted photo, the weekly reminder, the month's line", async () => {
    const t = createTestKit({ today: "2026-11-27" });
    await send(t, "p1");
    await t.message(plugin, "Acme");
    await send(t, "p2");
    await send(t, "p3", "1,200");
    await t.deleted(plugin, { kind: "bill", id: Object.keys(t.dump()).find((k) => k.startsWith("bills/"))!.slice(6) });
    t.setToday("2026-11-29");
    await t.schedule(plugin, "waiting");
    t.setToday("2026-12-01");
    await t.schedule(plugin, "month");
    expect(said(t)).toMatchSnapshot();
  });

  it("1.4.0: the note question, first and after, for a company and a forward, and the first note", async () => {
    const t = createTestKit({ today: "2026-11-27", hour: 10 });
    const pdf = (id: string) => ({ id, type: "application/pdf" as const, size: 9000 });
    await t.mail(plugin, mail({ id: "a", at: t.kit.now, from: { address: "b@monid.com", domain: "monid.com", kind: "company" }, files: [pdf("a")] }));
    await t.message(plugin, "Video generation credits");
    t.setHour(12);
    await t.mail(plugin, mail({ id: "b", at: t.kit.now, from: { address: "b@monid.com", domain: "monid.com", kind: "company" }, files: [pdf("b1"), pdf("b2")] }));
    t.setHour(14);
    await t.mail(plugin, mail({ id: "c", at: t.kit.now, from: { address: "me@gmail.com", domain: "gmail.com", kind: "mailbox" }, files: [pdf("c")] }));
    expect(said(t)).toMatchSnapshot();
  });

  it("a first book whose name is already taken", async () => {
    const t = createTestKit();
    await send(t, "p1");
    await t.act(plugin, "addBook", { name: "Acme" });
    await t.message(plugin, "acme", { kind: "bill", id: Object.keys(t.dump()).find((k) => k.startsWith("bills/"))!.slice(6) });
    expect(said(t)).toMatchSnapshot();
  });
});
