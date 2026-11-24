import { describe, expect, it } from "vitest";
import plugin, { LISTED, MAX_EXPENSES, type Expense, type Trip } from "..";
import { createTestKit } from "../../../testing";
import { copy } from "../copy";
import { readAmount, readExpense } from "../money";

type T = ReturnType<typeof createTestKit>;
const expenses = (t: T) => Object.entries(t.dump()).filter(([k]) => k.startsWith("expenses/")).map(([, v]) => v as unknown as Expense);
const trips = (t: T) => Object.entries(t.dump()).filter(([k]) => k.startsWith("trips/")).map(([, v]) => v as unknown as Trip);
const last = (t: T) => t.sent[t.sent.length - 1].text;
const openQuestion = (t: T) => t.asked.filter((a) => a.open);

/** A kit where the first expense was sent and the currency question answered with the first option. */
async function started(opts: Parameters<typeof createTestKit>[0] = {}) {
  const t = createTestKit(opts);
  await t.message(plugin, "lunch 450");
  await t.answer(plugin, t.asked[0].ref, 0);
  return t;
}

describe("reading an expense", () => {
  it("takes what it was and an amount that ends the line", () => {
    expect(readExpense("lunch 450")).toEqual({ what: "lunch", amount: 450, currency: null });
    expect(readExpense("Hotel Taj 4,500.50")).toEqual({ what: "Hotel Taj", amount: 4500.5, currency: null });
    expect(readExpense("2 beers 300")).toEqual({ what: "2 beers", amount: 300, currency: null });
    expect(readExpense("chai 10")).toEqual({ what: "chai", amount: 10, currency: null });
    expect(readExpense("lunch - 450")).toEqual({ what: "lunch", amount: 450, currency: null });
    expect(readExpense("lunch: 450")).toEqual({ what: "lunch", amount: 450, currency: null });
    expect(readExpense("flights 12k")).toEqual({ what: "flights", amount: 12000, currency: null });
    expect(readExpense("villa 1.5 lakh")).toEqual({ what: "villa", amount: 150000, currency: null });
    expect(readExpense("🍕 450")).toEqual({ what: "🍕", amount: 450, currency: null });
  });

  it("takes a currency on either side of the amount", () => {
    expect(readExpense("cab rs 300")).toEqual({ what: "cab", amount: 300, currency: "INR" });
    expect(readExpense("cab ₹300")).toEqual({ what: "cab", amount: 300, currency: "INR" });
    expect(readExpense("cab 300 rs")).toEqual({ what: "cab", amount: 300, currency: "INR" });
    expect(readExpense("dinner $20")).toEqual({ what: "dinner", amount: 20, currency: "USD" });
    expect(readExpense("dinner 20 usd")).toEqual({ what: "dinner", amount: 20, currency: "USD" });
    expect(readExpense("museum 15.50 euros")).toEqual({ what: "museum", amount: 15.5, currency: "EUR" });
    expect(readExpense("taxi 40 AED")).toEqual({ what: "taxi", amount: 40, currency: "AED" });
  });

  it("takes an amount that starts the line", () => {
    expect(readExpense("450 lunch")).toEqual({ what: "lunch", amount: 450, currency: null });
    expect(readExpense("rs 450 lunch")).toEqual({ what: "lunch", amount: 450, currency: "INR" });
    expect(readExpense("$20 cab")).toEqual({ what: "cab", amount: 20, currency: "USD" });
    expect(readExpense("20 usd cab")).toEqual({ what: "cab", amount: 20, currency: "USD" });
  });

  it("leaves a line with no amount, or nothing but an amount", () => {
    for (const line of ["lunch", "lunch was great", "450", "rs 450", "lunch 450 each", "lunch 0", "", "ok 👍"]) expect(readExpense(line), line).toBeNull();
  });

  it("reads an amount on its own", () => {
    expect(readAmount("500")).toEqual({ amount: 500, currency: null });
    expect(readAmount("rs 500")).toEqual({ amount: 500, currency: "INR" });
    expect(readAmount("20 usd")).toEqual({ amount: 20, currency: "USD" });
    expect(readAmount("lunch 500")).toBeNull();
  });
});

describe("the first expense", () => {
  it("explains the group once and asks which currency, the guess first", async () => {
    const t = createTestKit();
    await t.message(plugin, "lunch 450");
    expect(t.reactions).toEqual([]);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].text).toContain("Kept: lunch, 450.");
    expect(t.sent[0].text).toContain("end trip");
    expect(t.sent[0].text).toContain("👍 means kept");
    expect(t.asked).toHaveLength(1);
    expect(t.asked[0].options).toEqual(["₹ Rupees", "$ US dollars", "€ Euros", "£ Pounds", "AED Dirhams"]);
    expect(t.asked[0].confirm).toBe(false);
    expect(expenses(t)).toEqual([expect.objectContaining({ what: "lunch", amount: 450, currency: null, by: "owner" })]);
    expect(t.marks).toHaveLength(1);
  });

  it("records the answer on the trip and on the person, and says so", async () => {
    const t = createTestKit();
    await t.message(plugin, "lunch 450");
    await t.answer(plugin, t.asked[0].ref, 1);
    expect(trips(t)[0].currency).toBe("USD");
    expect(t.kit.person.currency).toBe("USD");
    expect(openQuestion(t)).toHaveLength(0);
    expect(["Counting in $.", "$ it is."]).toContain(last(t));
  });

  it("takes a currency typed instead of picked", async () => {
    const t = createTestKit();
    await t.message(plugin, "lunch 450");
    await t.message(plugin, "sgd");
    expect(trips(t)[0].currency).toBe("SGD");
    expect(t.kit.person.currency).toBe("SGD");
    expect(openQuestion(t)).toHaveLength(0);
    expect(last(t)).toContain("S$");
  });

  it("learns the currency from the message and does not ask", async () => {
    const t = createTestKit();
    await t.message(plugin, "lunch rs 450");
    expect(t.asked).toHaveLength(0);
    expect(trips(t)[0].currency).toBe("INR");
    expect(t.kit.person.currency).toBe("INR");
    expect(t.sent[0].text).toContain("Kept: lunch, ₹450.");
    expect(t.sent[0].text).toContain("I'm counting this trip in ₹.");
  });

  it("answers the next ones with a 👍 and nothing else", async () => {
    const t = await started();
    const sent = t.sent.length;
    await t.message(plugin, "cab 300");
    await t.message(plugin, "dinner 20 usd");
    expect(t.reactions).toEqual(["👍", "👍"]);
    expect(t.sent).toHaveLength(sent);
    expect(t.asked).toHaveLength(1);
  });

  it("counts with the guess while nobody has answered, and a later named currency settles it", async () => {
    const t = createTestKit();
    await t.message(plugin, "lunch 450");
    await t.message(plugin, "total");
    expect(last(t)).toContain("*Total: ₹450*");
    await t.message(plugin, "cab 20 usd");
    expect(trips(t)[0].currency).toBe("USD");
    expect(openQuestion(t)).toHaveLength(0);
    await t.message(plugin, "total");
    expect(last(t)).toContain("*Total: $470*");
  });

  it("keeps what Zelfred already knew about the person", async () => {
    const t = createTestKit({ person: { name: "Asha", timezone: "Asia/Kolkata", currency: "EUR" } });
    await t.message(plugin, "lunch 45");
    expect(t.asked[0].options[0]).toBe("€ Euros");
    expect(t.asked[0].options).toHaveLength(5);
    await t.answer(plugin, t.asked[0].ref, 1);
    expect(trips(t)[0].currency).toBe("INR");
    expect(t.kit.person.currency).toBe("EUR");
  });
});

describe("adding up", () => {
  it("shows the list and the sum", async () => {
    const t = await started();
    await t.message(plugin, "cab 300");
    await t.message(plugin, "Total");
    expect(last(t)).toBe("*Trip 1, so far*\n\n1. lunch ₹450\n2. cab ₹300\n\n*Total: ₹750* · 2 expenses");
  });

  it("keeps each currency apart, the trip's own first", async () => {
    const t = await started();
    await t.message(plugin, "dinner 20 usd");
    await t.message(plugin, "cab 300");
    await t.message(plugin, "sum");
    expect(last(t)).toContain("*Total: ₹750 + $20* · 3 expenses");
  });

  it("takes several lines as several expenses", async () => {
    const t = await started();
    await t.message(plugin, "cab 300\nchai 20\n\nsnacks 80");
    expect(expenses(t)).toHaveLength(4);
    expect(t.reactions).toEqual(["👍"]);
  });

  it("keeps the lines with an amount and names the others", async () => {
    const t = await started();
    await t.message(plugin, "cab 300\nthat was a lot");
    expect(expenses(t)).toHaveLength(2);
    expect(t.reactions).toEqual([]);
    expect(last(t)).toContain("Kept 1.");
    expect(last(t)).toContain("- that was a lot");
  });

  it("says there is nothing yet", async () => {
    const t = createTestKit();
    await t.message(plugin, "total");
    expect(last(t)).toBe(copy.nothingYet());
  });

  it("shows the newest of a long list", async () => {
    const t = await started();
    for (let i = 0; i < LISTED + 4; i++) await t.message(plugin, `thing ${i + 1}`);
    await t.message(plugin, "total");
    expect(last(t)).toContain("_5 expenses before these._");
    expect(last(t)).toContain(`${LISTED + 5}. thing`);
    expect(last(t)).not.toContain("1. lunch");
  });

  it("stops at the most one trip holds", async () => {
    const t = await started();
    const trip = Object.keys(t.dump()).find((k) => k.startsWith("trips/"))!.slice(6);
    for (let i = 1; i < MAX_EXPENSES; i++) await t.kit.store.put("expenses", `${trip}:x${i}`, { what: "x", amount: 1, currency: null, by: "owner", name: null, at: i }, i + 1);
    await t.message(plugin, "one more 5");
    expect(last(t)).toContain(`${MAX_EXPENSES} expenses`);
    expect(expenses(t)).toHaveLength(MAX_EXPENSES);
  });
});

describe("a message with no amount", () => {
  it("is not kept, and the person is told the format every time when they are alone", async () => {
    const t = createTestKit();
    await t.message(plugin, "lunch");
    await t.message(plugin, "had a big lunch");
    expect(t.unsures).toHaveLength(2);
    expect(t.unsures[0]).toContain("lunch 450");
    expect(t.sent).toHaveLength(0);
    expect(expenses(t)).toHaveLength(0);
  });

  it("is told once in a group with friends, until something is kept", async () => {
    const t = await started();
    await t.message(plugin, "where are we eating", null, null, "Ravi");
    await t.message(plugin, "the place by the beach");
    await t.message(plugin, "ok", null, null, "Ravi");
    expect(t.unsures).toHaveLength(1);
    await t.message(plugin, "beach lunch 900", null, null, "Ravi");
    await t.message(plugin, "worth it");
    expect(t.unsures).toHaveLength(2);
  });
});

describe("ending a trip", () => {
  it("sends the list and the total, and the next expense starts a new trip that asks again", async () => {
    const t = await started();
    await t.message(plugin, "cab 300");
    await t.message(plugin, "end trip");
    expect(last(t)).toBe("*Trip 1* · 15 Nov\n\n1. lunch ₹450\n2. cab ₹300\n\n*Total: ₹750* · 2 expenses\n\nThis list is closed. The next expense starts a new trip.");
    expect(trips(t)[0]).toMatchObject({ count: 2, sums: { INR: 750 }, currency: "INR" });
    expect(trips(t)[0].endedAt).not.toBeNull();

    t.setToday("2026-11-20");
    await t.message(plugin, "ferry 40");
    expect(trips(t)).toHaveLength(2);
    expect(t.asked).toHaveLength(2);
    expect(t.asked[1].question).toContain("A new trip.");
    // The person's own currency, learnt on the first trip, is the first choice.
    expect(t.asked[1].options[0]).toBe("₹ Rupees");
    expect(last(t)).not.toContain("From now on");
    await t.answer(plugin, t.asked[1].ref, 2);
    await t.message(plugin, "total");
    expect(last(t)).toBe("*Trip 2, so far*\n\n1. ferry €40\n\n*Total: €40* · 1 expense");
    // Learnt once: the second trip's answer doesn't change the person's own.
    expect(t.kit.person.currency).toBe("INR");
  });

  it("understands the other ways of saying it", async () => {
    for (const words of ["end it", "End", "end the trip", "trip over", "close trip", "End trip."]) {
      const t = await started();
      await t.message(plugin, words);
      expect(last(t), words).toContain("This list is closed.");
    }
  });

  it("does not ask a new trip whose first expense names its currency", async () => {
    const t = await started();
    await t.message(plugin, "end trip");
    await t.message(plugin, "ferry 40 eur");
    expect(t.asked).toHaveLength(1);
    expect(t.reactions).toEqual(["👍"]);
    expect(trips(t).find((x) => x.n === 2)!.currency).toBe("EUR");
  });

  it("has nothing to end before the first expense", async () => {
    const t = createTestKit();
    await t.message(plugin, "end trip");
    expect(last(t)).toBe(copy.nothingToEnd());
  });

  it("takes the open question away and fixes the guess", async () => {
    const t = createTestKit();
    await t.message(plugin, "lunch 450");
    await t.message(plugin, "end");
    expect(openQuestion(t)).toHaveLength(0);
    expect(trips(t)[0].currency).toBe("INR");
    expect(t.kit.person.currency).toBeNull();
  });

  it("lists the trips, newest first", async () => {
    const t = await started();
    await t.message(plugin, "name Goa");
    await t.message(plugin, "end trip");
    t.setToday("2026-11-20");
    await t.message(plugin, "ferry 40 eur");
    await t.message(plugin, "trips");
    expect(last(t)).toBe("*Your trips*\n\nTrip 2 · 20 Nov · 1 expense · €40 · open\nGoa · 15 Nov · 1 expense · ₹450");
  });

  it("has no trips to list at first", async () => {
    const t = createTestKit();
    await t.message(plugin, "trips");
    expect(last(t)).toBe(copy.noTrips());
  });

  it("says the days a trip ran over", async () => {
    const t = await started({ today: "2026-11-28" });
    t.setToday("2026-12-02");
    await t.message(plugin, "end trip");
    expect(last(t)).toContain("*Trip 1* · 28 Nov to 2 Dec");
  });
});

describe("friends in the group", () => {
  it("adds up what everyone sends and says who sent what", async () => {
    const t = await started({ person: { name: "Asha", timezone: "Asia/Kolkata" } });
    await t.message(plugin, "cab 300", null, null, "Ravi");
    await t.message(plugin, "chai 50", null, null, "Ravi");
    expect(t.reactions).toEqual(["👍", "👍"]);
    await t.message(plugin, "total", null, null, "Ravi");
    expect(last(t)).toBe("*Trip 1, so far*\n\n1. lunch ₹450 · Asha\n2. cab ₹300 · Ravi\n3. chai ₹50 · Ravi\n\n*Total: ₹800* · 3 expenses\nAsha ₹450 · Ravi ₹350");
  });

  it("takes a friend's answer for the trip, but learns nothing about the owner from it", async () => {
    const t = createTestKit();
    await t.message(plugin, "lunch 450", null, null, "Ravi");
    await t.answer(plugin, t.asked[0].ref, 3, "Ravi");
    expect(trips(t)[0].currency).toBe("GBP");
    expect(t.kit.person.currency).toBeNull();
    expect(openQuestion(t)).toHaveLength(0);
    // A second answer has nothing left to change.
    expect(last(t)).toContain("£");
  });

  it("removes only the sender's own last expense on undo", async () => {
    const t = await started();
    await t.message(plugin, "cab 300", null, null, "Ravi");
    await t.message(plugin, "undo");
    expect(last(t)).toBe("Removed: lunch ₹450.");
    expect(expenses(t).map((e) => e.what)).toEqual(["cab"]);
    await t.message(plugin, "undo");
    expect(last(t)).toBe(copy.nothingToUndo());
  });
});

describe("changing things", () => {
  const refOf = (t: T, n = 0) => t.marks[n];

  it("corrects an amount by reply", async () => {
    const t = await started();
    await t.message(plugin, "540", refOf(t));
    expect(expenses(t)[0]).toMatchObject({ what: "lunch", amount: 540 });
    expect(t.reactions).toEqual(["👍"]);
  });

  it("replaces the whole line by reply", async () => {
    const t = await started();
    await t.message(plugin, "brunch 20 usd", refOf(t));
    expect(expenses(t)).toEqual([expect.objectContaining({ what: "brunch", amount: 20, currency: "USD" })]);
  });

  it("removes one by reply", async () => {
    const t = await started();
    await t.message(plugin, "delete", refOf(t));
    expect(expenses(t)).toHaveLength(0);
    expect(t.reactions).toEqual(["👍"]);
  });

  it("says how when the reply is neither", async () => {
    const t = await started();
    await t.message(plugin, "hmm", refOf(t));
    expect(last(t)).toBe(copy.replyHow());
    expect(expenses(t)).toHaveLength(1);
  });

  it("removes every expense of a message with several, and won't guess which one a correction is for", async () => {
    const t = await started();
    await t.message(plugin, "cab 300\nchai 20");
    await t.message(plugin, "350", refOf(t, 1));
    expect(last(t)).toBe(copy.several());
    await t.message(plugin, "remove", refOf(t, 1));
    expect(expenses(t).map((e) => e.what)).toEqual(["lunch"]);
  });

  it("leaves a closed trip alone, and an expense that is gone", async () => {
    const t = await started();
    await t.message(plugin, "undo");
    await t.message(plugin, "500", refOf(t));
    expect(last(t)).toBe(copy.gone());
    await t.message(plugin, "cab 300");
    await t.message(plugin, "end trip");
    await t.message(plugin, "delete", refOf(t, 1));
    expect(last(t)).toBe(copy.closed());
    expect(expenses(t)).toHaveLength(1);
  });

  it("ignores a ref that isn't an expense's", async () => {
    const t = await started();
    await t.message(plugin, "cab 300", { kind: "other" });
    expect(expenses(t)).toHaveLength(2);
  });

  it("changes the trip's currency, and what plain amounts are shown in", async () => {
    const t = await started();
    await t.message(plugin, "currency usd");
    expect(["Counting in $.", "$ it is."]).toContain(last(t));
    await t.message(plugin, "total");
    expect(last(t)).toContain("*Total: $450*");
    await t.message(plugin, "currency");
    expect(last(t)).toContain("I'm counting this trip in $.");
    await t.message(plugin, "currency nonsense words");
    expect(last(t)).toBe(copy.currencyUnknown());
  });

  it("settles the currency before the first expense, so nothing is asked", async () => {
    const t = createTestKit();
    await t.message(plugin, "currency eur");
    await t.message(plugin, "ferry 40");
    expect(t.asked).toHaveLength(0);
    expect(t.kit.person.currency).toBe("EUR");
    expect(last(t)).toContain("Kept: ferry, €40.");
  });

  it("names the trip", async () => {
    const t = await started();
    await t.message(plugin, "name Goa with Ravi");
    expect(t.reactions).toEqual(["👍"]);
    await t.message(plugin, "total");
    expect(last(t)).toContain("*Goa with Ravi, so far*");
  });

  it("keeps an expense that starts with the word name", async () => {
    const t = await started();
    await t.message(plugin, "name board 300");
    expect(expenses(t).map((e) => e.what)).toEqual(["lunch", "name board"]);
  });
});

describe("what it says about itself", () => {
  it("answers help with the list of messages", async () => {
    const t = createTestKit();
    await t.message(plugin, "help");
    expect(t.sent[0].text).toBe(plugin.help);
    expect(plugin.help).toContain("end trip");
  });

  it("asks nothing in its welcome", () => {
    expect(plugin.welcome).not.toContain("?");
  });
});

describe("a new description or name for the group", () => {
  it("closes the open trip, shows it, and starts one called what was written", async () => {
    const t = await started();
    await t.groupInfo(plugin, "description", "Goa with Ravi\nDec 2026");
    expect(last(t)).toContain("1. lunch ₹450");
    expect(last(t)).toContain("This list is closed. A new trip starts: *Goa with Ravi*.");
    expect(trips(t).map((x) => [x.name, x.endedAt !== null])).toEqual([[null, true], ["Goa with Ravi", false]]);
    await t.message(plugin, "cab 300");
    expect(openQuestion(t)).toHaveLength(1);
    await t.message(plugin, "total");
    expect(last(t)).toContain("*Goa with Ravi, so far*");
    expect(last(t)).not.toContain("lunch");
  });

  it("names the trip when nothing was sent yet, and does not start two for two changes", async () => {
    const t = createTestKit();
    await t.groupInfo(plugin, "name", "Coorg");
    expect(last(t)).toBe("A new trip starts: *Coorg*. Send its first expense.");
    await t.groupInfo(plugin, "description", "Coorg, the long weekend");
    expect(trips(t).map((x) => x.name)).toEqual(["Coorg, the long weekend"]);
  });

  it("starts an unnamed trip when the description is removed", async () => {
    const t = await started();
    await t.groupInfo(plugin, "description", "");
    expect(last(t)).toContain("A new trip starts: *Trip 2*.");
  });

  it("tells people about the description, and not about renaming the group", () => {
    for (const text of [plugin.welcome, plugin.help, copy.joinedGroup()]) {
      expect(text).toContain("description");
      expect(text).not.toMatch(/rename|group's name/);
    }
  });
});

describe("a group the person already had", () => {
  it("says once how it works, and keeps its own trips", async () => {
    const t = await started();
    await t.group(plugin, "joined", "x-flat", "Flat 4B");
    expect(t.sent.at(-1)).toMatchObject({ group: "x-flat", text: copy.joinedGroup() });
    await t.message(plugin, "milk 60 rs", null, "x-flat", "Asha");
    expect(last(t)).toContain("Kept: milk, ₹60.");
    await t.message(plugin, "total", null, "x-flat");
    expect(last(t)).toContain("1. milk ₹60");
    expect(last(t)).not.toContain("lunch");
    await t.message(plugin, "total");
    expect(last(t)).toContain("1. lunch ₹450");
    expect(last(t)).not.toContain("milk");
    await t.message(plugin, "trips", null, "x-flat");
    expect(last(t)).not.toContain("450");
  });

  it("stays quiet when people there just talk", async () => {
    const t = createTestKit();
    await t.group(plugin, "joined", "x-flat", "Flat 4B");
    await t.message(plugin, "who is home tonight", null, "x-flat", "Asha");
    expect(t.unsures).toEqual([]);
  });

  it("starts a new trip there when its description changes", async () => {
    const t = createTestKit();
    await t.group(plugin, "joined", "x-flat", "Flat 4B");
    await t.message(plugin, "milk 60 rs", null, "x-flat");
    await t.groupInfo(plugin, "description", "December", "x-flat");
    expect(t.sent.at(-1)).toMatchObject({ group: "x-flat" });
    expect(trips(t).map((x) => [x.name, x.home, x.endedAt !== null])).toEqual([[null, "x-flat", true], ["December", "x-flat", false]]);
  });

  it("closes what was open when the group is taken back", async () => {
    const t = createTestKit();
    await t.group(plugin, "joined", "x-flat", "Flat 4B");
    await t.message(plugin, "milk 60 rs", null, "x-flat");
    const said = t.sent.length;
    await t.group(plugin, "left", "x-flat", "Flat 4B");
    expect(t.sent).toHaveLength(said);
    expect(trips(t)[0].endedAt).not.toBeNull();
    expect(Object.keys(t.dump()).filter((k) => k.includes("x-flat"))).toEqual([]);
  });
});
