import { describe, expect, it } from "vitest";
import digits, { MAX_LABELS, type Entry, type Label } from "..";
import { createTestKit, photo } from "../../../testing";
import type { Json } from "../../../sdk";
import { copy, PAGE } from "../copy";

const SUN = "2026-11-15";
const MON = "2026-11-16";

const fresh = (today = SUN) => createTestKit({ today, hour: 9 });
type T = ReturnType<typeof fresh>;
/** Past the first keep, so what is said the first time doesn't get in the way. */
const taught = (today = SUN) => {
  const t = fresh(today);
  void t.kit.store.put("state", "taught", 1);
  void t.kit.store.put("state", "firstDay", today);
  void t.kit.store.put("state", "page", 1);
  void t.kit.store.put("state", "recalled", 1);
  return t;
};

const labelsOf = (t: T) =>
  Object.entries(t.dump())
    .filter(([k]) => k.startsWith("labels/"))
    .map(([k, v]) => ({ id: k.slice(7), ...(v as unknown as Label) }));
const label = (t: T, name: string) => labelsOf(t).find((l) => l.name === name)!;
const entries = (t: T, name?: string) =>
  Object.entries(t.dump())
    .filter(([k]) => k.startsWith("entries/") && (!name || k.slice(8).startsWith(`${label(t, name).id}:`)))
    .map(([k, v]) => ({ key: k.slice(8), ...(v as unknown as Entry) }));
const last = (t: T) => t.sent.at(-1)!.text;

describe("the welcome and help", () => {
  it("asks for nothing and names one thing to send", () => {
    expect(digits.welcome).toContain("Amma ring size 14");
    expect(digits.welcome).not.toContain("?");
  });
  it("is unlisted while it is tried", () => {
    expect(digits.unlisted).toBe(true);
  });
});

describe("keeping a number", () => {
  it("says the first keep in words, then answers with a 👍", async () => {
    const t = fresh();
    await t.message(digits, "weight 72.4");
    expect(t.sent).toHaveLength(1);
    expect(last(t)).toBe(copy.firstKept({ name: "weight", value: "72.4" }));
    expect(t.reactions).toEqual([]);
    await t.message(digits, "waist 34");
    expect(t.sent).toHaveLength(1);
    expect(t.reactions).toEqual(["👍"]);
  });

  it("keeps every value under its label, the latest as current", async () => {
    const t = taught();
    await t.message(digits, "weight 80");
    t.setToday(MON);
    await t.message(digits, "Weight 79.5 kg");
    const w = label(t, "weight");
    expect(w.count).toBe(2);
    expect(w.current).toMatchObject({ text: "79.5 kg", day: MON });
    expect(w.first).toMatchObject({ text: "80", day: SUN });
    expect(labelsOf(t)).toHaveLength(1);
  });

  it("takes words in any order as the same label", async () => {
    const t = taught();
    await t.message(digits, "Amma ring size 14");
    await t.message(digits, "ring size amma 15");
    expect(labelsOf(t)).toHaveLength(1);
    expect(label(t, "Amma ring size").count).toBe(2);
  });

  it("keeps several at once from one message", async () => {
    const t = taught();
    await t.message(digits, "waist 34 hips 39 thigh 22");
    expect(labelsOf(t).map((l) => l.name).sort()).toEqual(["hips", "thigh", "waist"]);
    expect(t.reactions).toEqual(["👍"]);
    expect(t.marks.at(-1)).toMatchObject({ k: "m" });
    expect((t.marks.at(-1) as { ids: string[] }).ids).toHaveLength(3);
  });

  it("puts a number said to be yesterday's on yesterday", async () => {
    const t = taught(MON);
    await t.message(digits, "weight 71 yesterday");
    expect(label(t, "weight").current?.day).toBe(SUN);
  });

  it("keeps a value as typed: heights, readings, dates, ids", async () => {
    const t = taught();
    await t.message(digits, "height 5'6\"");
    await t.message(digits, "car number MH 12 AB 1234");
    await t.message(digits, "Riya birthday 12 March");
    expect(label(t, "height").current?.text).toBe("5'6\"");
    expect(entries(t, "height")[0]).toMatchObject({ num: 66, unit: "in", shape: "height" });
    expect(label(t, "car number").current?.text).toBe("MH 12 AB 1234");
    expect(label(t, "Riya birthday").current?.text).toBe("12 March");
  });

  it("says both numbers when a new one is far from the last, with no verdict", async () => {
    const t = taught();
    await t.message(digits, "waist 34");
    await t.message(digits, "waist 340");
    expect(last(t)).toBe(copy.jump({ name: "waist", value: "340", before: "34" }));
    expect(t.reactions).toEqual(["👍"]);
  });

  it("stops at the most labels it keeps, and says so", async () => {
    const t = taught();
    for (let i = 0; i < MAX_LABELS; i++) await t.kit.store.put("labels", `l${i}`, { name: `thing ${i}`, words: [`thing${i}`], count: 1, current: null, first: null, touched: 0 } as unknown as Json);
    await t.message(digits, "brand new 5");
    expect(last(t)).toBe(copy.full({ max: MAX_LABELS }));
  });
});

describe("a number with no word", () => {
  it("goes under the only label there is", async () => {
    const t = taught();
    await t.message(digits, "weight 72");
    await t.message(digits, "71.6");
    expect(label(t, "weight").count).toBe(2);
    expect(t.reactions).toEqual(["👍", "👍"]);
  });

  it("asks what it is when there is no label or several, and the next words name it", async () => {
    const t = fresh();
    await t.message(digits, "72.4");
    expect(last(t)).toBe(copy.whatIsIt({ value: "72.4" }));
    await t.message(digits, "weight");
    expect(label(t, "weight").current?.text).toBe("72.4");
    expect(last(t)).toBe(copy.firstKept({ name: "weight", value: "72.4" }));
  });

  it("stops waiting after an hour", async () => {
    const t = taught();
    await t.message(digits, "weight 70");
    await t.message(digits, "waist 30");
    await t.message(digits, "72.4");
    t.setHour(11);
    await t.message(digits, "weight");
    expect(label(t, "weight").count).toBe(1);
    expect(last(t)).toContain("*Weight*: 70");
  });
});

describe("asking for a number back", () => {
  it("gives the latest, and the first when there are more", async () => {
    const t = taught();
    await t.message(digits, "weight 80");
    expect((await recall(t, "weight?")).text).toBe("*Weight*: 80, kept today.");
    t.setToday(MON);
    await t.message(digits, "weight 79");
    const r = await recall(t, "what's my weight");
    expect(r.text).toBe("*Weight*: 79, kept today. The first was 80, yesterday. 2 kept.");
    expect(r.ref).toMatchObject({ k: "l" });
  });

  it("finds a label by part of its words, and answers every one that fits", async () => {
    const t = taught();
    await t.message(digits, "ring Amma 14");
    await t.message(digits, "Papa ring 20");
    expect((await recall(t, "what's Amma's ring size")).text).toContain("*Ring Amma*: 14");
    const both = await recall(t, "ring");
    expect(both.text).toContain("*Ring Amma*: 14");
    expect(both.text).toContain("*Papa ring*: 20");
  });

  it("asks the sorting model only when its own matching finds nothing, with no value in what it sends", async () => {
    const t = taught();
    await t.message(digits, "ring Amma 14");
    await t.message(digits, "aadhaar 2341 2341 2346");
    await t.message(digits, "ring Amma?");
    expect(t.sorts).toHaveLength(0);
    await t.message(digits, "mother's ring");
    expect(t.sorts).toHaveLength(1);
    const asked = t.sorts[0];
    expect(asked.after).toBe(0);
    const words = Object.values(asked.choices).join(" ");
    expect(words).toContain("ring Amma: a two digit number");
    expect(words).toContain("aadhaar: a twelve digit number");
    expect(words).not.toMatch(/\d/);
    await t.sorted(digits, "mother's ring", label(t, "ring Amma").id);
    expect(last(t)).toContain("*Ring Amma*: 14");
  });

  it("says nothing is kept when the sorting model finds nothing either", async () => {
    const t = taught();
    await t.message(digits, "weight 70");
    await t.message(digits, "shoe size");
    await t.sorted(digits, "shoe size", null);
    expect(last(t)).toBe(copy.notFound({ words: "shoe size" }));
  });

  it("says nothing is kept yet when nothing is", async () => {
    const t = fresh();
    await t.message(digits, "weight?");
    expect(t.unsures).toEqual([copy.nothingYet()]);
    expect(t.sorts).toHaveLength(0);
  });

  it("sends the photo kept with the latest value", async () => {
    const t = taught();
    await t.message(digits, "meter 4512", null, null, undefined, undefined, { photos: [photo("p1")] });
    await t.message(digits, "meter?");
    expect(t.sent.at(-1)!.photo).toBe("p1");
  });

  it("lists everything, newest first", async () => {
    const t = taught();
    await t.message(digits, "weight 70");
    t.setHour(10);
    await t.message(digits, "waist 30");
    await t.message(digits, "list");
    expect(last(t)).toBe(["What I keep for you:", "", "*Waist*: 30, kept today.", "*Weight*: 70, kept today."].join("\n"));
  });

  it("shows a label's whole history, newest first", async () => {
    const t = taught();
    await t.message(digits, "weight 80");
    t.setToday(MON);
    await t.message(digits, "weight 79");
    await t.message(digits, "history weight");
    expect(last(t)).toBe(["*Weight*, newest first:", "", "79, today", "80, yesterday"].join("\n"));
    await t.message(digits, "weight history");
    expect(last(t)).toContain("80, yesterday");
  });

  it("adds to a label when someone replies to its answer with a number", async () => {
    const t = taught();
    await t.message(digits, "weight 80");
    await t.message(digits, "weight?");
    await t.message(digits, "79", t.sent.at(-1)!.ref);
    expect(label(t, "weight").count).toBe(2);
  });
});

/** Ask, and return what was sent. */
async function recall(t: T, text: string) {
  await t.message(digits, text);
  return t.sent.at(-1)!;
}

describe("the page, named once after the first day", () => {
  it("is named with the first answer on a later day, and never again", async () => {
    const t = fresh();
    await t.message(digits, "weight 80");
    await t.message(digits, "weight?");
    expect(last(t)).not.toContain(PAGE);
    t.setToday(MON);
    await t.message(digits, "weight?");
    expect(last(t)).toContain(PAGE);
    await t.message(digits, "weight?");
    expect(last(t)).not.toContain(PAGE);
  });

  it("is named in place of the 👍 when a label gets its second value on a later day", async () => {
    const t = fresh();
    await t.message(digits, "weight 80");
    t.setToday(MON);
    await t.message(digits, "weight 79");
    expect(last(t)).toBe(copy.keptWithPage({ name: "weight", count: 2 }));
    await t.message(digits, "waist 30");
    await t.message(digits, "waist 32");
    expect(t.reactions).toEqual(["👍", "👍"]);
  });
});

describe("correcting and taking out", () => {
  it("corrects a value when the person replies to their own message with the right one", async () => {
    const t = taught();
    await t.message(digits, "weight 82");
    await t.message(digits, "72", t.marks.at(-1)!);
    expect(label(t, "weight")).toMatchObject({ count: 1, current: { text: "72" } });
  });

  it("takes a message's numbers out on undo, a reply of remove, or ❌", async () => {
    const t = taught();
    await t.message(digits, "weight 80");
    await t.message(digits, "weight 79");
    await t.message(digits, "undo");
    expect(last(t)).toBe(copy.takenOut({ what: "weight, 79" }));
    expect(label(t, "weight").count).toBe(1);
    expect(t.reactTos.at(-1)?.emoji).toBe("");

    await t.message(digits, "waist 30 hips 40");
    const ref = t.marks.at(-1)!;
    await t.react(digits, "❌", ref);
    expect(labelsOf(t).map((l) => l.name)).toEqual(["weight"]);

    await t.message(digits, "neck 14");
    await t.message(digits, "wrong", t.marks.at(-1)!);
    expect(labelsOf(t).map((l) => l.name)).toEqual(["weight"]);
  });

  it("says there is nothing to undo when there isn't", async () => {
    const t = taught();
    await t.message(digits, "undo");
    expect(last(t)).toBe(copy.nothingToUndo());
  });

  it("forgets a message's numbers, and their photos, when it is deleted for everyone", async () => {
    const t = taught();
    await t.message(digits, "card 4111 1111 1111 1111", null, null, undefined, undefined, { photos: [photo("p9")] });
    await t.deleted(digits, t.marks.at(-1)!);
    expect(labelsOf(t)).toHaveLength(0);
    expect(t.removedFiles).toEqual(["p9"]);
  });

  it("removes a whole label after asking, or keeps it", async () => {
    const t = taught();
    await t.message(digits, "weight 80");
    await t.message(digits, "weight 79");
    await t.message(digits, "remove weight");
    expect(t.asked.at(-1)).toMatchObject({ question: copy.askRemove({ name: "weight", count: 2 }), options: ["Remove", "Keep it"] });
    await t.answer(digits, t.asked.at(-1)!.ref, 1);
    expect(last(t)).toBe(copy.keptLabel({ name: "weight" }));
    expect(labelsOf(t)).toHaveLength(1);
    await t.message(digits, "delete weight");
    await t.answer(digits, t.asked.at(-1)!.ref, 0);
    expect(last(t)).toBe(copy.removedLabel({ name: "weight" }));
    expect(labelsOf(t)).toHaveLength(0);
    expect(entries(t)).toHaveLength(0);
  });

  it("does nothing with a stale or foreign ref", async () => {
    const t = taught();
    await t.react(digits, "❌", { k: "m", ids: ["gone:gone"] } as Json);
    await t.react(digits, "❌", { kind: "something else" } as Json);
    await t.deleted(digits, { k: "m", ids: ["gone:gone"] } as Json);
    await t.message(digits, "72", { k: "l", id: "gone" } as Json);
    expect(labelsOf(t)).toHaveLength(0);
  });
});

describe("numbers people may not want in a chat", () => {
  it("keeps it, and offers a way to delete the message", async () => {
    const t = taught();
    await t.message(digits, "aadhaar 2341 2341 2346");
    expect(label(t, "aadhaar").current?.text).toBe("2341 2341 2346");
    expect(last(t)).toBe(copy.secret({ what: "aadhaar" }));
    expect(t.reactions).toEqual([]);
  });

  it("locks a PIN or a card: kept whole, shown masked everywhere, whole only through reveal", async () => {
    const t = fresh();
    await t.kit.store.put("state", "recalled", 1);
    await t.message(digits, "atm pin 4821");
    expect(last(t)).toContain(copy.firstKept({ name: "atm pin", value: "••••" }));
    expect(last(t)).toContain(copy.locked({ what: "pin" }));
    expect(last(t)).not.toContain("4821");
    expect(t.reactions.at(-1)).toBe("🔒");
    const said = t.sent.length;
    await t.message(digits, "card 4111 1111 1111 1111");
    // Explained once: the second hidden value gets the 🔒 alone.
    expect(t.sent.length).toBe(said);
    expect(t.reactions.at(-1)).toBe("🔒");
    await t.message(digits, "card?");
    expect(last(t)).toBe("*Card*: •••• 1111, kept today.");
    await t.message(digits, "list");
    expect(last(t)).not.toMatch(/4821|4111/);
    const page = JSON.stringify(await t.load(digits));
    expect(page).not.toMatch(/4821|4111/);
    const pin = label(t, "atm pin");
    const one = (await t.load(digits, { label: pin.id })) as { entries: { id: string; text: string; locked: boolean }[] };
    expect(one.entries[0]).toMatchObject({ text: "••••", locked: true });
    expect(await t.act(digits, "reveal", { label: pin.id, entry: one.entries[0].id })).toEqual({ text: "4821" });
    await t.message(digits, "undo");
    expect(last(t)).toBe(copy.takenOut({ what: "card, •••• 1111" }));
  });
});

describe("dates", () => {
  it("says a date back in words, day first, and how it will be reminded", async () => {
    const t = taught();
    await t.message(digits, "Riya birthday 12/03");
    expect(last(t)).toBe(copy.keptDate({ name: "Riya birthday", date: "12 March", remind: "yearly" }));
    await t.message(digits, "Riya birthday 12/03/2015");
    expect(last(t)).toBe(copy.keptDate({ name: "Riya birthday", date: "12 March 2015", remind: "yearly" }));
    await t.message(digits, "passport expires 3/3/2031");
    expect(last(t)).toBe(copy.keptDate({ name: "passport expires", date: "3 March 2031", remind: "once" }));
    await t.message(digits, "joined office 1/6/2019");
    expect(last(t)).toBe(copy.keptDate({ name: "joined office", date: "1 June 2019", remind: null }));
    await t.message(digits, "Riya birthday?");
    expect(last(t)).toBe("*Riya birthday*: 12 March 2015, kept today. The first was 12 March, today. 2 kept.");
    await t.message(digits, "bangle 2/4");
    expect(label(t, "bangle").current?.text).toBe("2/4");
  });

  it("reminds a birthday on the day, every year, once", async () => {
    const t = taught("2026-03-01");
    await t.message(digits, "Riya birthday 12 March 2015");
    t.setToday("2026-03-11");
    await t.schedule(digits, "dates");
    const before = t.sent.length;
    t.setToday("2026-03-12");
    await t.schedule(digits, "dates");
    await t.schedule(digits, "dates");
    expect(t.sent.length).toBe(before + 1);
    expect(last(t)).toBe(copy.reminder({ name: "Riya birthday", date: "12 March 2015", due: "today", kind: "yearly" }));
    t.setToday("2027-03-12");
    await t.schedule(digits, "dates");
    expect(t.sent.length).toBe(before + 2);
  });

  it("reminds a date still to come a week before and on the day, and a past one never", async () => {
    const t = taught("2026-11-01");
    await t.message(digits, "visa interview 20 November 2026");
    await t.message(digits, "joined office 13/11/2019");
    const before = t.sent.length;
    t.setToday("2026-11-13");
    await t.schedule(digits, "dates");
    expect(t.sent.slice(before).map((m) => m.text)).toEqual([copy.reminder({ name: "visa interview", date: "20 November 2026", due: "soon", kind: "once" })]);
    t.setToday("2026-11-20");
    await t.schedule(digits, "dates");
    expect(last(t)).toBe(copy.reminder({ name: "visa interview", date: "20 November 2026", due: "today", kind: "once" }));
    t.setToday("2027-11-20");
    await t.schedule(digits, "dates");
    expect(t.sent.length).toBe(before + 2);
  });
});

describe("two names for one person", () => {
  it("asks once, after the sorting model put one name for another, and remembers the answer", async () => {
    const t = taught();
    await t.message(digits, "ring Amma 14");
    await t.message(digits, "ring Mom");
    await t.sorted(digits, "ring Mom", label(t, "ring Amma").id);
    expect(t.asked.at(-1)).toMatchObject({ question: copy.samePerson({ asked: "mom", kept: "amma" }), options: ["Yes", "No"] });
    await t.answer(digits, t.asked.at(-1)!.ref, 0);
    expect(last(t)).toBe(copy.sameKept({ asked: "mom", kept: "amma" }));
    await t.message(digits, "Mom's ring?");
    expect(t.sorts).toHaveLength(0);
    expect(last(t)).toContain("*Ring Amma*: 14");
  });

  it("never asks the same pair twice", async () => {
    const t = taught();
    await t.message(digits, "ring Amma 14");
    await t.message(digits, "ring Mom");
    await t.sorted(digits, "ring Mom", label(t, "ring Amma").id);
    await t.answer(digits, t.asked.at(-1)!.ref, 1);
    const asked = t.asked.length;
    await t.message(digits, "ring Mom");
    await t.sorted(digits, "ring Mom", label(t, "ring Amma").id);
    expect(t.asked.length).toBe(asked);
  });
});

describe("photos", () => {
  it("keeps a photo sent with a number, with it", async () => {
    const t = taught();
    await t.message(digits, "meter 4512", null, null, undefined, undefined, { photos: [photo("p1")] });
    expect(entries(t, "meter")[0].photos).toEqual(["p1"]);
  });

  it("puts a photo with no number with what was kept just now", async () => {
    const t = taught();
    await t.message(digits, "meter 4512");
    await t.message(digits, "", null, null, undefined, undefined, { photos: [photo("p2")] });
    expect(entries(t, "meter")[0].photos).toEqual(["p2"]);
    expect(t.reactions).toEqual(["👍", "👍"]);
  });

  it("puts a photo under the label its caption names", async () => {
    const t = taught();
    await t.message(digits, "meter 4512");
    t.setHour(15);
    await t.message(digits, "meter", null, null, undefined, undefined, { photos: [photo("p3")] });
    expect(entries(t, "meter")[0].photos).toEqual(["p3"]);
  });

  it("turns a photo away when there is nothing to put it with, and lets it go", async () => {
    const t = taught();
    await t.message(digits, "", null, null, undefined, undefined, { photos: [photo("p4")] });
    expect(last(t)).toBe(copy.photoAlone());
    expect(t.removedFiles).toEqual(["p4"]);
  });
});

describe("the page", () => {
  it("loads every label with its current value and a series for its graph", async () => {
    const t = taught();
    await t.message(digits, "weight 80");
    t.setToday(MON);
    await t.message(digits, "weight 79");
    t.setHour(10);
    await t.message(digits, "car MH12AB1234");
    const page = (await t.load(digits)) as { labels: { name: string; count: number; series: unknown[] }[] };
    expect(page.labels.map((l) => [l.name, l.count, l.series.length])).toEqual([
      ["car", 1, 0],
      ["weight", 2, 2],
    ]);
  });

  it("loads one label's entries, newest first", async () => {
    const t = taught();
    await t.message(digits, "weight 80");
    t.setToday(MON);
    await t.message(digits, "weight 79");
    const one = (await t.load(digits, { label: label(t, "weight").id })) as { entries: { text: string }[] };
    expect(one.entries.map((e) => e.text)).toEqual(["79", "80"]);
  });

  it("adds, edits, moves and removes entries", async () => {
    const t = taught(MON);
    const { label: id, entry } = (await t.act(digits, "add", { name: "weight", value: "80", day: SUN })) as { label: string; entry: string };
    await t.act(digits, "add", { label: id, value: "79" });
    expect(label(t, "weight").current?.text).toBe("79");
    // Moved to the same day as 79, it stays behind it: on one day the one kept later is current.
    await t.act(digits, "edit", { label: id, entry, value: "81", day: MON });
    expect(entries(t, "weight").find((e) => e.key.endsWith(entry))).toMatchObject({ text: "81", day: MON });
    expect(label(t, "weight").current?.text).toBe("79");
    await t.act(digits, "remove", { label: id, entry });
    expect(label(t, "weight").count).toBe(1);
    await expect(t.act(digits, "remove", { label: id, entry })).rejects.toThrow("That one is gone.");
    await expect(t.act(digits, "add", { label: id, value: "eighty" })).rejects.toThrow();
    await expect(t.act(digits, "add", { label: id, value: "80", day: "2027-01-01" })).rejects.toThrow();
    await expect(t.act(digits, "edit", { label: id, entry: "nope", value: "80" })).rejects.toThrow();
  });

  it("renames a label, but not onto another", async () => {
    const t = taught();
    await t.message(digits, "weight 80");
    await t.message(digits, "waist 30");
    await t.act(digits, "rename", { label: label(t, "weight").id, name: "body weight" });
    expect(label(t, "body weight")).toBeTruthy();
    await expect(t.act(digits, "rename", { label: label(t, "waist").id, name: "weight body" })).rejects.toThrow("There is already body weight.");
  });

  it("removes a label, and everything", async () => {
    const t = taught();
    await t.message(digits, "weight 80", null, null, undefined, undefined, { photos: [photo("p1")] });
    await t.message(digits, "waist 30");
    await t.act(digits, "removeLabel", { label: label(t, "weight").id });
    expect(t.removedFiles).toEqual(["p1"]);
    await t.act(digits, "removeAll");
    expect(labelsOf(t)).toHaveLength(0);
    expect(entries(t)).toHaveLength(0);
  });
});

describe("counting up by name", () => {
  it("a bare label gives its number back when it isn't counted", async () => {
    const t = taught();
    await t.message(digits, "Amma ring size 14");
    await t.message(digits, "Amma ring size");
    expect(last(t)).toBe("*Amma ring size*: 14, kept today.");
    expect(label(t, "Amma ring size").count).toBe(1);
  });

  it("starts counting once it sees one added at a time twice in a row, and says so once", async () => {
    const t = taught();
    await t.message(digits, "waist 30");
    await t.message(digits, "waist 31");
    expect(label(t, "waist").counter).toBeUndefined();
    await t.message(digits, "gym 11");
    await t.message(digits, "gym 12");
    await t.message(digits, "gym 13");
    expect(last(t)).toBe(copy.nowCounting({ name: "gym" }));
    expect(label(t, "gym").counter).toBe(true);
    await t.message(digits, "gym 15");
    expect(t.sent.filter((m) => m.text === copy.nowCounting({ name: "gym" }))).toHaveLength(1);
  });

  it("adds one for its name alone, or with today, and says the new count", async () => {
    const t = taught();
    await t.message(digits, "gym 11");
    await t.message(digits, "gym 12");
    await t.message(digits, "gym 13");
    await t.message(digits, "gym");
    expect(last(t)).toBe(copy.counted({ name: "gym", count: 14 }));
    await t.message(digits, "Gym today");
    expect(last(t)).toBe(copy.counted({ name: "gym", count: 15 }));
    expect(label(t, "gym")).toMatchObject({ count: 5, current: { text: "15" } });
  });

  it("gives the count, without adding, when it is asked for", async () => {
    const t = taught();
    await t.message(digits, "gym 11");
    await t.message(digits, "gym 12");
    await t.message(digits, "gym 13");
    for (const q of ["gym?", "gym count", "get gym", "show gym", "what's gym"]) {
      await t.message(digits, q);
      expect(last(t)).toContain("*Gym*: 13");
    }
    expect(label(t, "gym").count).toBe(3);
  });

  it("takes a count back on undo", async () => {
    const t = taught();
    await t.message(digits, "gym 11");
    await t.message(digits, "gym 12");
    await t.message(digits, "gym 13");
    await t.message(digits, "gym");
    await t.message(digits, "undo");
    expect(label(t, "gym").current?.text).toBe("13");
    expect(last(t)).toBe(copy.takenOutCount({ name: "gym", count: "13" }));
    await t.message(digits, "gym");
    await t.react(digits, "❌", t.marks.at(-1)!);
    expect(last(t)).toBe(copy.takenOutCount({ name: "gym", count: "13" }));
  });

  it("never counts a decimal, a unit or a jump", async () => {
    const t = taught();
    await t.message(digits, "weight 72");
    await t.message(digits, "weight 73 kg");
    await t.message(digits, "steps 100");
    await t.message(digits, "steps 102");
    expect(label(t, "weight").counter).toBeUndefined();
    expect(label(t, "steps").counter).toBeUndefined();
  });

  it("can be turned off on the page, and stays off", async () => {
    const t = taught();
    await t.message(digits, "gym 11");
    await t.message(digits, "gym 12");
    await t.message(digits, "gym 13");
    await t.act(digits, "setCounter", { label: label(t, "gym").id, on: false });
    await t.message(digits, "gym 14");
    expect(label(t, "gym").counter).toBe(false);
    await t.message(digits, "gym");
    expect(last(t)).toContain("*Gym*: 14");
    expect(label(t, "gym").count).toBe(4);
  });
});

describe("the first answer", () => {
  it("says once that it will still be here next year", async () => {
    const t = fresh();
    await t.message(digits, "Amma ring size 14");
    await t.message(digits, "Amma ring size?");
    expect(last(t)).toBe(`*Amma ring size*: 14, kept today.\n\n${copy.stillHere()}`);
    await t.message(digits, "Amma ring size?");
    expect(last(t)).toBe("*Amma ring size*: 14, kept today.");
  });
});

describe("removing one value by its words", () => {
  it("takes out the newest value that matches, and never keeps a label called remove", async () => {
    const t = taught();
    await t.message(digits, "weight 72.4");
    await t.message(digits, "weight 71.8");
    await t.message(digits, "weight 72.4");
    await t.message(digits, "remove weight 72.4");
    expect(last(t)).toBe(copy.takenOut({ what: "weight, 72.4" }));
    expect(label(t, "weight")).toMatchObject({ count: 2, current: { text: "71.8" } });
    await t.message(digits, "delete weight 99");
    expect(last(t)).toBe(copy.notFound({ words: "weight 99" }));
    expect(labelsOf(t).map((l) => l.name)).toEqual(["weight"]);
  });
});

