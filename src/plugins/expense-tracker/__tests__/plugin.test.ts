import { describe, expect, it } from "vitest";
import plugin, { LISTED, MAX_EXPENSES, type Expense, type Trip } from "..";
import { createTestKit, photo } from "../../../testing";
import { copy } from "../copy";
import { readAmount, readExpense, takeTags } from "../money";

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

describe("the amount first", () => {
  it("reads it with a mark or a joining word after it", () => {
    expect(readExpense("450: lunch")).toEqual({ what: "lunch", amount: 450, currency: null });
    expect(readExpense("450 - lunch")).toEqual({ what: "lunch", amount: 450, currency: null });
    expect(readExpense("450 for lunch")).toEqual({ what: "lunch", amount: 450, currency: null });
    expect(readExpense("rs 450 for lunch")).toEqual({ what: "lunch", amount: 450, currency: "INR" });
    expect(readExpense("20 usd: dinner")).toEqual({ what: "dinner", amount: 20, currency: "USD" });
    expect(readExpense("300 on 2 beers")).toEqual({ what: "2 beers", amount: 300, currency: null });
    // A thing that starts with such a word but isn't one keeps it.
    expect(readExpense("450 forks")).toEqual({ what: "forks", amount: 450, currency: null });
  });

  it("is told to people wherever the format is", () => {
    for (const text of [plugin.welcome, plugin.help, copy.joinedGroup(), copy.format()]) expect(text).toMatch(/450 lunch|either order/);
  });
});

describe("the page", () => {
  type Page = { groups: { key: string | null; name: string | null; open: PageTrip | null; past: PageTrip[] }[]; trip: PageTrip | null };
  type PageTrip = { id: string; title: string; days: string; count: number; total: string; people: string[]; open: boolean; rows?: { id: string; n: number; what: string; amount: string; who: string | null }[] };
  const load = async (t: T, args: Record<string, string> = {}) => (await t.load(plugin, args)) as unknown as Page;

  it("shows the open trip with its expenses, and who sent what once several did", async () => {
    const t = await started();
    await t.message(plugin, "cab 300", null, null, "Asha");
    const p = await load(t);
    expect(p.groups).toHaveLength(1);
    expect(p.groups[0]).toMatchObject({ key: null, past: [] });
    expect(p.groups[0].open).toMatchObject({ title: "Trip 1", count: 2, total: "₹750", open: true });
    expect(p.groups[0].open!.rows!.map((r) => [r.n, r.what, r.amount])).toEqual([[1, "lunch", "₹450"], [2, "cab", "₹300"]]);
    expect(p.groups[0].open!.rows![1].who).toBe("Asha");
    expect(p.groups[0].open!.people).toHaveLength(2);
  });

  it("lists ended trips with their totals, and gives one in full when asked", async () => {
    const t = await started();
    await t.message(plugin, "end trip");
    await t.message(plugin, "ferry 40 eur");
    const p = await load(t);
    expect(p.groups[0].open).toMatchObject({ title: "Trip 2", total: "€40" });
    expect(p.groups[0].past).toMatchObject([{ title: "Trip 1", count: 1, total: "₹450", open: false }]);
    expect(p.groups[0].past[0].rows).toBeUndefined();
    const one = await load(t, { trip: p.groups[0].past[0].id });
    expect(one.trip!.rows!.map((r) => r.what)).toEqual(["lunch"]);
  });

  it("keeps each group's trips apart, and shows nothing for a trip that was only named", async () => {
    const t = createTestKit();
    await t.groupInfo(plugin, "description", "Coorg");
    await t.group(plugin, "joined", "x-flat", "Flat 4B");
    await t.message(plugin, "milk 60 rs", null, "x-flat");
    const p = await load(t);
    expect(p.groups.map((g) => [g.key, g.name, g.open?.count ?? 0])).toEqual([[null, null, 0], ["x-flat", "Flat 4B", 1]]);
  });

  it("takes an expense out of the open trip, and leaves a closed trip alone", async () => {
    const t = await started();
    await t.message(plugin, "cab 300");
    let p = await load(t);
    const trip = p.groups[0].open!;
    await t.act(plugin, "remove", { trip: trip.id, id: trip.rows![0].id });
    p = await load(t);
    expect(p.groups[0].open).toMatchObject({ count: 1, total: "₹300" });
    await t.message(plugin, "end trip");
    await expect(t.act(plugin, "remove", { trip: trip.id, id: trip.rows![1].id })).rejects.toThrow(/closed/);
  });
});

describe("labels", () => {
  it("are read off a line and kept with the expense", async () => {
    expect(takeTags("lunch 450 #Food #client")).toEqual({ rest: "lunch 450", tags: ["food", "client"] });
    const t = await started();
    await t.message(plugin, "cab 300 #travel");
    await t.message(plugin, "#food dinner 900");
    expect(expenses(t).map((e) => [e.what, e.tags ?? []])).toEqual([["lunch", []], ["cab", ["travel"]], ["dinner", ["food"]]]);
    await t.message(plugin, "total");
    expect(last(t)).toContain("2. cab ₹300 #travel");
    expect(last(t)).toContain("#food ₹900 · #travel ₹300");
  });

  it("are added by a reply, also after the trip closed", async () => {
    const t = await started();
    await t.message(plugin, "#food", t.marks[0]);
    expect(expenses(t)[0].tags).toEqual(["food"]);
    await t.message(plugin, "end trip");
    await t.message(plugin, "#client", t.marks[0]);
    expect(expenses(t)[0].tags).toEqual(["food", "client"]);
  });
});

describe("a photo of the bill", () => {
  const withPhoto = (id: string) => ({ photos: [photo(id)] });

  it("sent with the expense as its caption is kept with it, and how bills work is said once", async () => {
    const t = await started();
    await t.message(plugin, "dinner 900", null, null, undefined, undefined, withPhoto("p1"));
    expect(expenses(t)[1]).toMatchObject({ what: "dinner", bill: "p1" });
    expect(last(t)).toContain("Kept the bill with dinner.");
    await t.message(plugin, "cab 300", null, null, undefined, undefined, withPhoto("p2"));
    expect(expenses(t)[2].bill).toBe("p2");
    expect(t.reactions.at(-1)).toBe("👍");
    await t.message(plugin, "total");
    expect(last(t)).toContain("2. dinner ₹900 📎");
  });

  it("sent as a reply to an expense becomes its bill, and replaces the one before", async () => {
    const t = await started();
    await t.message(plugin, "", t.marks[0], null, undefined, undefined, withPhoto("p1"));
    expect(expenses(t)[0].bill).toBe("p1");
    await t.message(plugin, "", t.marks[0], null, undefined, undefined, withPhoto("p2"));
    expect(expenses(t)[0].bill).toBe("p2");
    expect(t.removedFiles).toEqual(["p1"]);
  });

  it("comes back when asked for", async () => {
    const t = await started();
    await t.message(plugin, "bill", t.marks[0]);
    expect(last(t)).toContain("No bill is kept");
    await t.message(plugin, "", t.marks[0], null, undefined, undefined, withPhoto("p1"));
    await t.message(plugin, "bill", t.marks[0]);
    expect(t.sent.at(-1)).toMatchObject({ text: "lunch ₹450", photo: "p1" });
  });

  it("is not kept when it is just a photo: nothing is said and the file is deleted", async () => {
    const t = await started();
    const said = t.sent.length;
    await t.message(plugin, "", null, null, "Asha", undefined, withPhoto("p1"));
    await t.message(plugin, "sunset at the beach", null, null, "Asha", undefined, withPhoto("p2"));
    expect(t.sent).toHaveLength(said);
    expect(t.unsures).toEqual([]);
    expect(t.removedFiles).toEqual(["p1", "p2"]);
    expect(expenses(t)).toHaveLength(1);
  });

  it("goes when its expense goes", async () => {
    const t = await started();
    await t.message(plugin, "", t.marks[0], null, undefined, undefined, withPhoto("p1"));
    await t.message(plugin, "delete", t.marks[0]);
    expect(t.removedFiles).toEqual(["p1"]);
    expect(expenses(t)).toEqual([]);
  });
});

describe("changing an expense on the page", () => {
  type P = { groups: { open: { id: string; labels: string[]; rows: { id: string; day: string; tags: string[]; bill: string | null }[] } | null; past: { id: string }[] }[]; trip: { rows: { id: string; day: string; tags: string[] }[] } | null };
  const load = async (t: T, args: Record<string, string> = {}) => (await t.load(plugin, args)) as unknown as P;

  it("sets the day it was paid, and refuses a day that hasn't come", async () => {
    const t = await started();
    let p = await load(t);
    const trip = p.groups[0].open!;
    const sent = trip.rows[0].day;
    expect(sent).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await t.act(plugin, "setDay", { trip: trip.id, id: trip.rows[0].id, day: "2026-01-05" });
    p = await load(t);
    expect(p.groups[0].open!.rows[0].day).toBe("2026-01-05");
    await expect(t.act(plugin, "setDay", { trip: trip.id, id: trip.rows[0].id, day: "2999-01-01" })).rejects.toThrow(/hasn't come/);
    await expect(t.act(plugin, "setDay", { trip: trip.id, id: trip.rows[0].id, day: "2026-02-31" })).rejects.toThrow(/Pick a date/);
  });

  it("sets labels, and the trip adds each one up", async () => {
    const t = await started();
    let p = await load(t);
    const trip = p.groups[0].open!;
    await t.act(plugin, "setTags", { trip: trip.id, id: trip.rows[0].id, tags: ["#Food", "food", "client lunch"] });
    p = await load(t);
    expect(p.groups[0].open!.rows[0].tags).toEqual(["food", "clientlunch"]);
    expect(p.groups[0].open!.labels).toEqual(["clientlunch ₹450", "food ₹450"]);
  });

  it("keeps a bill added on the page, takes it away again, and works on a closed trip", async () => {
    const t = await started();
    let p = await load(t);
    const trip = p.groups[0].open!;
    await expect(t.act(plugin, "setBill", { trip: trip.id, id: trip.rows[0].id, photo: "nope" })).rejects.toThrow(/didn't arrive/);
    const id = t.addFile("page-1");
    await t.act(plugin, "setBill", { trip: trip.id, id: trip.rows[0].id, photo: id });
    p = await load(t);
    expect(p.groups[0].open!.rows[0].bill).toBe(id);
    await t.message(plugin, "end trip");
    await t.act(plugin, "setTags", { trip: trip.id, id: trip.rows[0].id, tags: ["food"] });
    await t.act(plugin, "setBill", { trip: trip.id, id: trip.rows[0].id, photo: null });
    expect(t.removedFiles).toEqual([id]);
    const closed = await load(t, { trip: trip.id });
    expect(closed.trip!.rows[0].tags).toEqual(["food"]);
  });
});

describe("an emoji's group", () => {
  it("takes an expense when someone reacts to it, and the list adds each group up", async () => {
    const t = await started();
    await t.message(plugin, "pizza 600");
    await t.message(plugin, "cab 300");
    await t.react(plugin, "🍕", t.marks[0]);
    await t.react(plugin, "🍕", t.marks[1], null, "Asha");
    await t.react(plugin, "🚕", t.marks[2]);
    expect(expenses(t).map((e) => e.mark)).toEqual(["🍕", "🍕", "🚕"]);
    await t.message(plugin, "total");
    expect(last(t)).toContain("1. lunch ₹450 🍕");
    expect(last(t)).toContain("🍕 ₹1,050 · 🚕 ₹300");
    const p = (await t.load(plugin, {})) as unknown as { groups: { open: { marks: { mark: string; total: string; count: number }[]; rows: { mark: string | null }[] } }[] };
    expect(p.groups[0].open.marks).toEqual([{ mark: "🍕", total: "₹1,050", count: 2 }, { mark: "🚕", total: "₹300", count: 1 }]);
  });

  it("is left by taking the reaction away, and a thumbs up is no group", async () => {
    const t = await started();
    await t.react(plugin, "👍", t.marks[0]);
    expect(expenses(t)[0].mark ?? null).toBeNull();
    await t.react(plugin, "🍕", t.marks[0]);
    await t.react(plugin, null, t.marks[0]);
    expect(expenses(t)[0].mark).toBeNull();
  });

  it("can be set and cleared on the page", async () => {
    const t = await started();
    const p = (await t.load(plugin, {})) as unknown as { groups: { open: { id: string; rows: { id: string }[] } }[] };
    const where = { trip: p.groups[0].open.id, id: p.groups[0].open.rows[0].id };
    await t.act(plugin, "setMark", { ...where, mark: "🏨" });
    expect(expenses(t)[0].mark).toBe("🏨");
    await expect(t.act(plugin, "setMark", { ...where, mark: "hotel" })).rejects.toThrow(/one emoji/);
    await t.act(plugin, "setMark", { ...where, mark: null });
    expect(expenses(t)[0].mark).toBeNull();
  });
});

describe("who spent it", () => {
  const refOf = (t: T, n = 0) => t.marks[n];
  const tag = (...who: string[]) => ({ mentions: who });

  it("gives an expense to the person tagged in a reply, and says how once", async () => {
    const t = await started({ person: { name: "Asha", timezone: "Asia/Kolkata" } });
    await t.message(plugin, "", refOf(t), null, undefined, undefined, tag("Ravi"));
    expect(expenses(t)[0]).toMatchObject({ what: "lunch", by: "ravi", name: "Ravi" });
    expect(last(t)).toBe(copy.firstWho({ what: "lunch", who: "Ravi" }));
    await t.message(plugin, "cab 300");
    const before = t.reactions.length;
    await t.message(plugin, "", refOf(t, 1), null, "Ravi", undefined, tag("Ravi"));
    expect(expenses(t)[1]).toMatchObject({ what: "cab", by: "ravi" });
    expect(t.reactions.slice(before)).toEqual(["👍"]);
  });

  it("is taken with mine, me or I paid", async () => {
    for (const words of ["mine", "Me", "I paid", "it's mine!", "that was me"]) {
      const t = await started({ person: { name: "Asha", timezone: "Asia/Kolkata" } });
      await t.message(plugin, words, refOf(t), null, "Ravi");
      expect(expenses(t)[0], words).toMatchObject({ by: "ravi", name: "Ravi" });
    }
  });

  it("adds it to that person's sum", async () => {
    const t = await started({ person: { name: "Asha", timezone: "Asia/Kolkata" } });
    await t.message(plugin, "cab 300");
    await t.message(plugin, "mine", refOf(t, 1), null, "Ravi");
    await t.message(plugin, "total");
    expect(last(t)).toContain("Asha ₹450 · Ravi ₹300");
  });

  it("asks for one person when two are tagged", async () => {
    const t = await started();
    await t.message(plugin, "", refOf(t), null, undefined, undefined, tag("Ravi", "Meena"));
    expect(last(t)).toBe(copy.whoOne());
    expect(expenses(t)[0].by).toBe("owner");
  });

  it("still reads an amount beside a tag as a correction", async () => {
    const t = await started();
    await t.message(plugin, "540", refOf(t), null, undefined, undefined, tag("Ravi"));
    expect(expenses(t)[0]).toMatchObject({ amount: 540, by: "owner" });
  });

  it("works on a closed trip, and leaves a tag that answers nothing alone", async () => {
    const t = await started();
    await t.message(plugin, "end trip");
    const sent = t.sent.length;
    await t.message(plugin, "", null, null, undefined, undefined, tag("Ravi"));
    expect(t.sent).toHaveLength(sent);
    await t.message(plugin, "mine", refOf(t), null, "Ravi");
    expect(expenses(t)[0].by).toBe("ravi");
  });

  it("names someone tagged before they ever wrote, as soon as they are heard", async () => {
    const t = await started({ person: { name: "Asha", timezone: "Asia/Kolkata" } });
    await t.message(plugin, "cab 300");
    await t.message(plugin, "", refOf(t, 1), null, undefined, undefined, { mentions: [{ id: "ravi", name: null }] });
    expect(last(t)).toBe(copy.firstWho({ what: "cab", who: null }));
    await t.message(plugin, "total");
    expect(last(t)).toContain("2. cab ₹300\n");
    expect(last(t)).toContain("Asha ₹450 · Someone ₹300");
    // Anything they do here is enough: a line that is no expense, or a reaction.
    await t.message(plugin, "thanks all", null, null, { id: "ravi", name: "Ravi", owner: false });
    await t.message(plugin, "total");
    expect(last(t)).toContain("2. cab ₹300 · Ravi");
    expect(last(t)).toContain("Asha ₹450 · Ravi ₹300");
    const p = (await t.load(plugin)) as unknown as { groups: { open: { rows: { who: string | null }[]; dash: { people: { name: string }[] } } }[] };
    expect(p.groups[0].open.dash.people.map((x) => x.name)).toEqual(["Asha", "Ravi"]);
  });

  it("can be set on the page, among the people on the trip", async () => {
    const t = await started({ person: { name: "Asha", timezone: "Asia/Kolkata" } });
    await t.message(plugin, "cab 300", null, null, "Ravi");
    const p = (await t.load(plugin)) as unknown as { groups: { open: { id: string; rows: { id: string; by: string }[]; dash: { people: { key: string; name: string; value: number }[] } } }[] };
    const trip = p.groups[0].open;
    await t.act(plugin, "setBy", { trip: trip.id, id: trip.rows[0].id, by: "ravi" });
    expect(expenses(t)[0]).toMatchObject({ by: "ravi", name: "Ravi" });
    await expect(t.act(plugin, "setBy", { trip: trip.id, id: trip.rows[0].id, by: "nobody" })).rejects.toThrow("Pick someone who is on this trip.");
  });
});

describe("the page's numbers", () => {
  it("adds up each day, emoji, label and person in the trip's currency", async () => {
    const t = await started({ person: { name: "Asha", timezone: "Asia/Kolkata" } });
    await t.message(plugin, "cab 300 #commute", null, null, "Ravi");
    await t.message(plugin, "dinner 20 usd #food");
    const lunch = t.marks[0];
    await t.react(plugin, "🍕", lunch);
    const p = (await t.load(plugin)) as unknown as { groups: { open: { rows: { value: number | null; by: string }[]; dash: Record<string, unknown> } }[]; known: { labels: string[]; marks: string[] } };
    const trip = p.groups[0].open;
    expect(trip.rows.map((r) => r.value).sort()).toEqual([300, 450, null]);
    expect(trip.dash).toMatchObject({
      days: [{ total: "₹750 + $20", value: 750, count: 3 }],
      marks: [{ key: "🍕", total: "₹450", value: 450, count: 1 }],
      labels: [{ key: "commute", total: "₹300", value: 300, count: 1 }, { key: "food", total: "$20", value: 0, count: 1 }],
      people: [{ key: "owner", name: "Asha", total: "₹450 + $20", value: 450, count: 2 }, { key: "ravi", name: "Ravi", total: "₹300", value: 300, count: 1 }],
      perDay: "₹750",
      span: 1,
      top: { what: "lunch", amount: "₹450" },
      outside: "$20",
    });
    expect(p.known).toEqual({ labels: ["commute", "food"], marks: ["🍕"] });
  });

  it("remembers a closed trip's labels and emoji", async () => {
    const t = await started();
    await t.message(plugin, "cab 300 #commute");
    await t.react(plugin, "🍕", t.marks[0]);
    await t.message(plugin, "end trip");
    expect(trips(t)[0].used).toEqual({ labels: ["commute"], marks: ["🍕"] });
    const p = (await t.load(plugin)) as unknown as { known: { labels: string[]; marks: string[] } };
    expect(p.known).toEqual({ labels: ["commute"], marks: ["🍕"] });
  });
});

describe("who owes whom", () => {
  const two = async () => {
    const t = await started({ person: { name: "Asha", timezone: "Asia/Kolkata" } });
    await t.message(plugin, "cab 300", null, null, "Ravi");
    return t;
  };

  it("shares the trip equally and says the payment that settles it", async () => {
    const t = await two();
    await t.message(plugin, "split");
    expect(last(t)).toBe("*Trip 1, shared equally by 2*\n₹375 each.\n\nRavi pays Asha ₹75");
    for (const words of ["who owes whom?", "settle up", "tally"]) {
      await t.message(plugin, words);
      expect(last(t), words).toContain("Ravi pays Asha ₹75");
    }
  });

  it("counts in someone who only wrote, and someone who was only tagged", async () => {
    const t = await two();
    await t.message(plugin, "thanks all", null, null, "Meena");
    await t.message(plugin, "split");
    expect(last(t)).toBe("*Trip 1, shared equally by 3*\n₹250 each.\n\nMeena pays Asha ₹200\nMeena pays Ravi ₹50");
    await t.message(plugin, "", t.marks[0], null, undefined, undefined, { mentions: ["Kiran"] });
    await t.message(plugin, "split");
    // lunch is Kiran's now: Kiran 450, Ravi 300, Asha and Meena nothing. 187.50 each.
    expect(last(t)).toBe("*Trip 1, shared equally by 4*\n₹187.50 each.\n\nAsha pays Kiran ₹187.50\nMeena pays Kiran ₹75\nMeena pays Ravi ₹112.50");
  });

  it("says so when everyone has paid their share, and when there is one person", async () => {
    const t = await two();
    await t.message(plugin, "tea 150", null, null, "Ravi");
    await t.message(plugin, "split");
    expect(last(t)).toBe("*Trip 1, shared equally by 2*\n₹450 each.\n\nEveryone has paid their share.");
    const alone = await started();
    await alone.message(plugin, "split");
    expect(last(alone)).toBe(copy.splitAlone());
  });

  it("settles each currency on its own", async () => {
    const t = await two();
    await t.message(plugin, "dinner 20 usd", null, null, "Ravi");
    await t.message(plugin, "split");
    expect(last(t)).toBe("*Trip 1, shared equally by 2*\n₹375 + $10 each.\n\nRavi pays Asha ₹75\nAsha pays Ravi $10");
  });

  it("closes the list with it, and hands it to the page", async () => {
    const t = await two();
    const p = (await t.load(plugin)) as unknown as { groups: { open: { dash: { owes: unknown } } }[] };
    expect(p.groups[0].open.dash.owes).toEqual({ n: 2, each: "₹375", pays: [{ from: "Ravi", to: "Asha", amount: "₹75" }] });
    await t.message(plugin, "end trip");
    expect(last(t)).toContain("Asha ₹450 · Ravi ₹300\n\nShared equally by 2, that is ₹375 each:\nRavi pays Asha ₹75\n\nThis list is closed.");
    // The next trip starts with nobody on it.
    await t.message(plugin, "chai 40");
    await t.message(plugin, "split");
    expect(last(t)).toBe(copy.splitAlone());
  });
});
