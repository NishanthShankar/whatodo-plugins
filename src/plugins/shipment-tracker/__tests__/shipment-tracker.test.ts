import { describe, expect, it } from "vitest";
import plugin, { MAX_WATCHED, readParcel, SILENT_AFTER, STALE_DAYS, type Pack } from "..";
import { createTestKit, parcel } from "../../../testing";
import { copy } from "../copy";

type T = ReturnType<typeof createTestKit>;
const LINK = "https://www.fedex.com/fedextrack/?trknbr=880154928525&trkqual=2461369000~880154928525~FX";
const packs = (t: T) => Object.entries(t.dump()).filter(([k]) => k.startsWith("parcels/")).map(([k, v]) => ({ id: k.slice(8), ...(v as unknown as Pack) }));
const last = (t: T) => t.sent[t.sent.length - 1].text;
const hourLater = async (t: T, hour: number) => {
  t.setHour(hour);
  await t.schedule(plugin, "look");
};

/** One FedEx parcel being watched, in transit, with the first status already said. */
async function watching(what = "880154928525", found = parcel({ status: "Departed FedEx hub", place: "Memphis, TN, US", due: "2026-11-17" })) {
  const t = createTestKit({ today: "2026-11-15", hour: 9 });
  await t.message(plugin, what);
  await t.parcel(plugin, t.parcelReads[0].what, found);
  t.sent.length = 0;
  t.reactions.length = 0;
  t.reactTos.length = 0;
  return t;
}

describe("reading a message", () => {
  it("takes a link, and the words around it as the name", () => {
    expect(readParcel(LINK)).toEqual({ what: LINK, name: null, more: false });
    expect(readParcel(`track this: ${LINK} new shoes`)).toEqual({ what: LINK, name: "new shoes", more: false });
  });
  it("takes a bare number, also written in groups, and a name after it", () => {
    expect(readParcel("880154928525")).toEqual({ what: "880154928525", name: null, more: false });
    expect(readParcel("8801 5492 8525 new shoes")).toEqual({ what: "880154928525", name: "new shoes", more: false });
    expect(readParcel("1Z999AA10123456784, the lamp")).toEqual({ what: "1Z999AA10123456784", name: "the lamp", more: false });
  });
  it("says when there was a second one, and reads nothing from plain words", () => {
    expect(readParcel("880154928525 1Z999AA10123456784")?.more).toBe(true);
    expect(readParcel("where are my shoes")).toBeNull();
    expect(readParcel("order 12345")).toBeNull();
  });
});

describe("a new parcel", () => {
  it("puts a clock on the message, asks Zelfred, then says the first status in words and how it works, once", async () => {
    const t = createTestKit({ today: "2026-11-15", hour: 9 });
    await t.message(plugin, LINK);
    expect(t.reactions).toEqual(["🕐"]);
    expect(t.sent).toEqual([]);
    expect(t.parcelReads.map((r) => r.what)).toEqual([LINK]);
    const id = packs(t)[0].id;
    expect(t.marks).toEqual([{ p: id }]);

    await t.parcel(plugin, LINK, parcel({ status: "Departed FedEx hub", place: "Memphis, TN, US", due: "2026-11-17" }));
    expect(t.reactTos).toEqual([{ ref: { p: id }, emoji: "" }]);
    expect(t.sent[0].text).toBe(
      "Watching *FedEx 880154928525*.\nDeparted FedEx hub, Memphis, TN, US\nExpected Tuesday 17 November.\n\nI look every hour and write only when this changes. Send _updates_ to hear where things stand.",
    );
    expect(t.sent[0].ref).toEqual({ p: id });
    expect(packs(t)[0]).toMatchObject({ carrier: "fedex", number: "880154928525", stage: "transit", told: true });

    await t.message(plugin, "1Z999AA10123456784 the lamp");
    await t.parcel(plugin, "1Z999AA10123456784", parcel({ carrier: "ups", carrierName: "UPS", number: "1Z999AA10123456784", status: "Label created", stage: "label" }));
    expect(last(t)).toBe("Watching *the lamp (UPS 1Z999AA10123456784)*.\nLabel created");
  });

  it("says it can't track what Zelfred has no way to track, and keeps nothing", async () => {
    const t = createTestKit();
    await t.message(plugin, "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223197428490");
    await t.parcel(plugin, t.parcelReads[0].what, parcel({ found: false, reason: "unsupported", carrier: "usps", carrierName: "USPS", number: "9400111899223197428490" }));
    expect(last(t)).toBe("I can't track USPS parcels. FedEx and UPS are the ones I can.");
    expect(packs(t)).toEqual([]);
    expect(t.reactTos.at(-1)?.emoji).toBe("");

    await t.message(plugin, "https://example.com/orders/12345678");
    await t.parcel(plugin, t.parcelReads[0].what, parcel({ found: false, reason: "unsupported" }));
    expect(last(t)).toBe(copy.cantTrack({ carrier: null }));
    expect(packs(t)).toEqual([]);
  });

  it("says when the carrier doesn't know the number, and keeps nothing", async () => {
    const t = createTestKit();
    await t.message(plugin, "880154928525");
    await t.parcel(plugin, "880154928525", parcel({ found: false, reason: "unknown", carrier: "fedex", carrierName: "FedEx", number: "880154928525" }));
    expect(last(t)).toContain("FedEx 880154928525: the carrier doesn't know that number.");
    expect(packs(t)).toEqual([]);
  });

  it("keeps a parcel the carrier couldn't be asked about, says so once, and gives up after a day", async () => {
    const t = createTestKit({ today: "2026-11-15", hour: 9 });
    const down = parcel({ found: false, reason: "unavailable", carrier: "fedex", carrierName: "FedEx", number: "880154928525" });
    await t.message(plugin, "880154928525");
    await t.parcel(plugin, "880154928525", down);
    expect(t.sent.map((s) => s.text)).toEqual(["I couldn't reach FedEx just now. I've kept it and will look again within the hour."]);
    expect(packs(t)).toHaveLength(1);

    await hourLater(t, 10);
    await t.parcel(plugin, "880154928525", down);
    expect(t.sent).toHaveLength(1);

    // It answers after all: the first status is said like any other.
    await hourLater(t, 11);
    await t.parcel(plugin, "880154928525", parcel({ status: "Picked up" }));
    expect(last(t)).toContain("Watching *FedEx 880154928525*.\nPicked up");

    const u = createTestKit({ today: "2026-11-15", hour: 9 });
    await u.message(plugin, "880154928525");
    for (let i = 0; i < SILENT_AFTER; i++) {
      if (i) await u.schedule(plugin, "look");
      await u.parcel(plugin, "880154928525", down);
    }
    expect(last(u)).toBe("I can't track FedEx 880154928525. I tried for a day and never got an answer, so I've stopped.");
    expect(packs(u)).toEqual([]);
  });

  it("doesn't keep one that is already delivered", async () => {
    const t = createTestKit();
    await t.message(plugin, "880154928525");
    await t.parcel(plugin, "880154928525", parcel({ stage: "delivered", status: "Delivered", place: "Austin, TX, US" }));
    expect(last(t)).toBe("*FedEx 880154928525* is already delivered.\nDelivered, Austin, TX, US\n\nNothing left to watch, so I haven't kept it.");
    expect(packs(t)).toEqual([]);
  });

  it("spots the same parcel sent twice, before asking and after", async () => {
    const t = await watching();
    await t.message(plugin, "880154928525");
    expect(last(t)).toContain("I'm already watching *FedEx 880154928525*.");
    expect(t.parcelReads).toEqual([]);

    await t.message(plugin, LINK);
    await t.parcel(plugin, LINK, parcel({ status: "Departed FedEx hub" }));
    expect(last(t)).toContain("I'm already watching *FedEx 880154928525*.");
    expect(packs(t)).toHaveLength(1);
  });

  it("takes one at a time and says so", async () => {
    const t = createTestKit();
    await t.message(plugin, "880154928525 1Z999AA10123456784");
    expect(t.parcelReads.map((r) => r.what)).toEqual(["880154928525"]);
    expect(last(t)).toBe("One at a time. I took the first one.");
  });

  it("stops at the most it watches", async () => {
    const t = createTestKit();
    for (let i = 0; i < MAX_WATCHED; i++) await t.message(plugin, `8801549285${String(i).padStart(2, "0")}`);
    await t.message(plugin, "880154928599");
    expect(last(t)).toContain(`I'm watching ${MAX_WATCHED} already`);
    expect(packs(t)).toHaveLength(MAX_WATCHED);
  });
});

describe("every hour", () => {
  it("asks about each watched parcel and says nothing when nothing changed", async () => {
    const t = await watching();
    await hourLater(t, 10);
    expect(t.parcelReads.map((r) => r.what)).toEqual(["880154928525"]);
    await t.parcel(plugin, "880154928525", parcel({ status: "Departed FedEx hub", place: "Memphis, TN, US", due: "2026-11-17" }));
    expect(t.sent).toEqual([]);
  });

  it("says a change once, with the new status", async () => {
    const t = await watching();
    const out = parcel({ status: "On FedEx vehicle for delivery", stage: "out", place: "Austin, TX, US", due: "2026-11-15" });
    await hourLater(t, 10);
    await t.parcel(plugin, "880154928525", out);
    expect(t.sent.map((s) => s.text)).toEqual(["*FedEx 880154928525*\nOn FedEx vehicle for delivery, Austin, TX, US\nExpected today."]);
    expect(t.sent[0].ref).toEqual({ p: packs(t)[0].id });
    await hourLater(t, 11);
    await t.parcel(plugin, "880154928525", out);
    expect(t.sent).toHaveLength(1);
  });

  it("says a new expected day too", async () => {
    const t = await watching();
    await hourLater(t, 10);
    await t.parcel(plugin, "880154928525", parcel({ status: "Departed FedEx hub", place: "Memphis, TN, US", due: "2026-11-19" }));
    expect(last(t)).toContain("Expected Thursday 19 November.");
  });

  it("says delivered, stops asking, and drops it from updates after a few days", async () => {
    const t = await watching("880154928525 new shoes");
    await hourLater(t, 10);
    await t.parcel(plugin, "880154928525", parcel({ status: "Delivered", stage: "delivered", place: "Austin, TX, US" }));
    expect(last(t)).toBe("*new shoes* is delivered.\nDelivered, Austin, TX, US\n\nI've stopped looking.");
    await hourLater(t, 11);
    expect(t.parcelReads).toEqual([]);

    await t.message(plugin, "updates");
    expect(last(t)).toBe("1. *new shoes (FedEx 880154928525)*\nDelivered. Delivered, Austin, TX, US");
    t.setToday("2026-11-19");
    await t.message(plugin, "updates");
    expect(last(t)).toBe(copy.nothing());
    t.setToday("2026-12-20");
    await t.schedule(plugin, "look");
    expect(packs(t)).toEqual([]);
  });

  it("stays quiet through a bad answer, and says once when a day passes with none", async () => {
    const t = await watching();
    const down = parcel({ found: false, reason: "unavailable", carrier: "fedex", carrierName: "FedEx", number: "880154928525" });
    for (let i = 0; i < SILENT_AFTER + 2; i++) {
      await t.schedule(plugin, "look");
      await t.parcel(plugin, "880154928525", down);
    }
    expect(t.sent.map((s) => s.text)).toEqual(["I haven't been able to reach FedEx about *FedEx 880154928525* for a day. I'm still trying.\nLast I knew: Departed FedEx hub, Memphis, TN, US\nExpected Tuesday 17 November."]);
    expect(packs(t)).toHaveLength(1);
  });

  it("stops looking when nothing has moved for a long time", async () => {
    const t = await watching();
    t.setToday("2026-12-20");
    await t.schedule(plugin, "look");
    expect(last(t)).toBe(`*FedEx 880154928525* hasn't moved in ${STALE_DAYS} days, so I've stopped looking. Send it again to start over.`);
    expect(t.parcelReads).toEqual([]);
    expect(packs(t)[0].over).toBe("stale");
  });

  it("does nothing with nothing to watch, or an answer about a parcel that is gone", async () => {
    const t = createTestKit();
    await t.schedule(plugin, "look");
    expect(t.sent).toEqual([]);
    expect(t.parcelReads).toEqual([]);

    const u = await watching();
    await u.schedule(plugin, "look");
    await u.message(plugin, "remove 1");
    await u.parcel(plugin, "880154928525", parcel({ status: "Out for delivery", stage: "out" }));
    expect(u.sent).toEqual([]);
    await plugin.onParcel!({ parcel: parcel(), ref: "junk" }, u.kit);
    await plugin.onParcel!({ parcel: parcel(), ref: { p: "nope" } }, u.kit);
    expect(u.sent).toEqual([]);
  });
});

describe("updates", () => {
  it("lists what is watched, numbered, with how long ago it was looked at", async () => {
    const t = await watching("880154928525 new shoes");
    await t.message(plugin, "1Z999AA10123456784");
    await t.parcel(plugin, "1Z999AA10123456784", parcel({ carrier: "ups", carrierName: "UPS", number: "1Z999AA10123456784", status: "Label created", stage: "label" }));
    t.sent.length = 0;
    t.setHour(10);
    for (const word of ["updates", "Update", "status?", "any updates", "where is it"]) {
      await t.message(plugin, word);
      expect(last(t)).toBe("1. *new shoes (FedEx 880154928525)*\nDeparted FedEx hub, Memphis, TN, US\nExpected Tuesday 17 November.\n\n2. *UPS 1Z999AA10123456784*\nLabel created\n\nLast looked an hour ago.");
    }
  });

  it("asks the carrier again when the last answer is old, and not when it is fresh", async () => {
    const t = await watching();
    await t.message(plugin, "updates");
    expect(t.parcelReads).toEqual([]);
    t.setHour(10);
    await t.message(plugin, "updates");
    expect(t.parcelReads.map((r) => r.what)).toEqual(["880154928525"]);
  });

  it("says when nothing is watched", async () => {
    const t = createTestKit();
    await t.message(plugin, "updates");
    expect(last(t)).toBe("I'm not watching anything. Send me a FedEx or UPS tracking link or number.");
  });
});

describe("remove and name", () => {
  it("removes by number, by name, or as a reply, with a 👍", async () => {
    const t = await watching("880154928525 new shoes");
    await t.message(plugin, "remove 1");
    expect(t.reactions).toEqual(["👍"]);
    expect(packs(t)).toEqual([]);

    const u = await watching("880154928525 new shoes");
    await u.message(plugin, "stop watching shoes");
    expect(packs(u)).toEqual([]);

    const v = await watching();
    await v.message(plugin, "remove", { p: packs(v)[0].id });
    expect(packs(v)).toEqual([]);
    expect(v.sent).toEqual([]);
  });

  it("asks which one when it can't tell", async () => {
    const t = await watching();
    await t.message(plugin, "remove");
    expect(last(t)).toBe(copy.whichOne());
    await t.message(plugin, "remove 7");
    expect(last(t)).toBe(`I'm not watching anything called "7". Send _updates_ to see what I have.`);
    await t.message(plugin, "remove", { p: "gone" });
    expect(last(t)).toBe(copy.whichOne());
    expect(packs(t)).toHaveLength(1);
  });

  it("names one by its number in the list, or as a reply", async () => {
    const t = await watching();
    await t.message(plugin, "name 1 new shoes");
    expect(t.reactions).toEqual(["👍"]);
    expect(packs(t)[0].name).toBe("new shoes");
    await t.message(plugin, "the red ones", { p: packs(t)[0].id });
    expect(packs(t)[0].name).toBe("the red ones");
    await t.message(plugin, "name it boots", { p: packs(t)[0].id });
    expect(packs(t)[0].name).toBe("boots");
    await t.message(plugin, "name boots");
    expect(last(t)).toBe(copy.nameHow());
    await t.message(plugin, "name 9 boots");
    expect(last(t)).toContain(`anything called "9"`);
  });
});

describe("words it can't read", () => {
  it("hands them to Zelfred, and acts on what comes back", async () => {
    const t = await watching("880154928525 new shoes");
    await t.message(plugin, "has anything moved since yesterday");
    expect(t.unsures).toEqual([copy.unsure()]);
    expect(t.sent).toEqual([]);

    await t.intent(plugin, "has anything moved since yesterday", "updates");
    expect(last(t)).toContain("1. *new shoes (FedEx 880154928525)*");
    await t.intent(plugin, "call the first one something else", "rename");
    expect(last(t)).toBe(copy.nameHow());
    await t.intent(plugin, "i don't need to follow one anymore", "remove");
    expect(last(t)).toBe(copy.whichOne());
    expect(await t.targets(plugin)).toEqual({ [packs(t)[0].id]: "new shoes" });
    await t.intent(plugin, "the shoes came, forget them", "remove", packs(t)[0].id);
    expect(packs(t)).toEqual([]);
  });

  it("answers help with what it can do", async () => {
    const t = createTestKit();
    await t.message(plugin, "help");
    expect(last(t)).toContain("Send me a FedEx or UPS tracking link or number");
  });
});
