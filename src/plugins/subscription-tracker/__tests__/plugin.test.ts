import { describe, expect, it } from "vitest";
import plugin, { type Sub } from "..";
import { createTestKit } from "../../../testing";
import { copy } from "../copy";

type T = ReturnType<typeof createTestKit>;
const subs = (t: T) => Object.entries(t.dump()).filter(([k]) => k.startsWith("subs/")).map(([, v]) => v as unknown as Sub);
const sub = (t: T, name: string) => subs(t).find((s) => s.name.toLowerCase() === name.toLowerCase())!;
const idOf = (t: T, name: string) => Object.entries(t.dump()).find(([k, v]) => k.startsWith("subs/") && (v as unknown as Sub).name.toLowerCase() === name.toLowerCase())![0].slice(5);
const last = (t: T) => t.sent[t.sent.length - 1].text;
const open = (t: T) => t.asked.filter((a) => a.open);
const morning = async (t: T, day: string) => {
  t.setToday(day);
  t.setHour(9);
  await t.schedule(plugin, "notices");
};

/** Sunday 15 November 2026, 9pm. The person's currency is known, and the first receipt in words is out of the way. */
/** The same, with the weekly message turned off, so a test about one notice sees only that. */
const quiet = () => started({ settings: { weeklyHour: null } });

async function started(opts: Parameters<typeof createTestKit>[0] = {}) {
  const t = createTestKit({ person: { name: "Priya", timezone: "Asia/Kolkata", currency: "INR" }, ...opts });
  await t.message(plugin, "icloud 75 monthly on the 28th");
  t.sent.length = 0;
  t.reactions.length = 0;
  return t;
}

describe("the first time", () => {
  it("says in words what was kept and what happens next, with no 👍, then a 👍 alone", async () => {
    const t = createTestKit({ person: { name: "Priya", timezone: "Asia/Kolkata", currency: "INR" } });
    await t.message(plugin, "Netflix 649 monthly on the 5th");
    expect(t.sent[0].text).toContain("Kept: Netflix, ₹649 a month, next on 5 December.");
    expect(t.sent[0].text).toContain("on Sunday evening");
    expect(t.sent[0].text).toContain("From now on a 👍 means kept.");
    expect(t.reactions).toEqual([]);
    expect(open(t)).toEqual([]);

    await t.message(plugin, "Spotify 119 monthly on the 20th");
    expect(t.sent).toHaveLength(1);
    expect(t.reactions).toEqual(["👍"]);
    expect(sub(t, "Spotify")).toMatchObject({ kind: "use", next: "2026-11-20", every: "monthly", from: "typed", by: "owner" });
  });

  it("asks the currency once when nobody knows it, and tells Zelfred what the person who added it says", async () => {
    const t = createTestKit();
    await t.message(plugin, "netflix 649 monthly on the 5th");
    expect(open(t).map((a) => a.question)).toEqual([copy.whichCurrency()]);
    expect(open(t)[0].options[0]).toBe("₹ Rupees");
    await t.answer(plugin, open(t)[0].ref, 1);
    expect(last(t)).toBe("Counting in $.");
    expect(t.kit.person.currency).toBe("USD");
    expect(open(t)).toEqual([]);
    await t.message(plugin, "spotify 10 monthly on the 9th");
    expect(open(t)).toEqual([]);
    await t.message(plugin, "list");
    expect(last(t)).toContain("netflix, $649 a month");
  });

  it("takes the currency from the message when it names one, and asks nothing", async () => {
    const t = createTestKit();
    await t.message(plugin, "netflix rs 649 monthly on the 5th");
    expect(t.asked).toEqual([]);
    expect(t.kit.person.currency).toBe("INR");
    expect(t.sent[0].text).toContain("₹649 a month");
  });

  it("does not hand a friend's currency to Zelfred", async () => {
    const t = createTestKit();
    await t.message(plugin, "netflix $15 monthly on the 5th", null, null, "Asha");
    expect(t.kit.person.currency).toBeNull();
    expect(sub(t, "netflix")).toMatchObject({ currency: "USD", by: "asha" });
  });
});

describe("adding", () => {
  it("says the date back when it had to guess one", async () => {
    const t = await started();
    await t.message(plugin, "Netflix 649");
    expect(last(t)).toBe("Kept: Netflix, ₹649 a month, next on 15 December. You gave no date, so I took that one. Reply to this with the date if it's another.");
    expect(t.reactions).toEqual([]);
    await t.message(plugin, "on the 5th", t.sent[0].ref);
    expect(sub(t, "Netflix").next).toBe("2026-12-05");
    expect(t.reactions).toEqual(["👍"]);
  });

  it("asks how to treat something it doesn't know, and the answer is the receipt", async () => {
    const t = await started();
    await t.message(plugin, "Milkman 1800 monthly on the 1st");
    expect(t.reactions).toEqual([]);
    expect(open(t)[0]).toMatchObject({ question: "How do I treat Milkman?", options: ["I'd drop it if I stopped using it", "It keeps things running", "It's a free trial"] });
    expect(sub(t, "Milkman").kind).toBeNull();
    await t.answer(plugin, open(t)[0].ref, 1);
    expect(sub(t, "Milkman").kind).toBe("keeps");
    expect(last(t)).toBe("Milkman: I'll say the date and the amount, and leave it at that.");
    expect(open(t)).toEqual([]);
  });

  it("offers 'it runs out' too when nothing says it renews", async () => {
    const t = await started();
    await t.message(plugin, "club membership 20 March");
    expect(open(t)[0].options).toHaveLength(4);
    await t.answer(plugin, open(t)[0].ref, 3);
    expect(sub(t, "club membership")).toMatchObject({ kind: "expires", every: "once", first: 14 });
    expect(last(t)).toBe("club membership: I'll say so in good time before it runs out.");
  });

  it("knows a passport runs out, and asks about insurance, which can do either", async () => {
    const t = await started();
    await t.message(plugin, "Amma's passport 3 March 2031");
    expect(t.reactions).toEqual(["👍"]);
    expect(sub(t, "Amma's passport")).toMatchObject({ kind: "expires", months: 120, first: 270, middle: 90, amount: null });
    await t.message(plugin, "car insurance 14 Feb");
    expect(open(t)[0].options).toEqual(["It keeps things running", "It runs out unless I renew it"]);
    await t.answer(plugin, open(t)[0].ref, 1);
    expect(sub(t, "car insurance")).toMatchObject({ kind: "expires", months: 12, first: 14, middle: null });
    await t.message(plugin, "health insurance 12000 yearly 1 April");
    expect(sub(t, "health insurance").kind).toBe("keeps");
  });

  it("says so at once when the time the thing takes has already gone", async () => {
    const t = await started();
    await t.message(plugin, "passport expires 27 December");
    expect(last(t)).toBe("Kept: passport, expires on 27 December. That's in 6 weeks, and it can take longer than that to renew.");
  });

  it("wants a date for something that runs out, and a date that has not passed", async () => {
    const t = await started();
    await t.message(plugin, "passport expires 1500");
    expect(last(t)).toBe(copy.needDate({ name: "passport" }));
    await t.message(plugin, "warranty expires 2 Jan 2024");
    expect(last(t)).toContain("has passed");
    expect(subs(t)).toHaveLength(1);
  });

  it("changes the one it has when the same name is sent again", async () => {
    const t = await started();
    await t.message(plugin, "icloud 219 on the 3rd");
    expect(subs(t)).toHaveLength(1);
    expect(sub(t, "icloud")).toMatchObject({ amount: 219, next: "2026-12-03" });
    expect(t.reactions).toEqual(["👍"]);
  });

  it("keeps a trial, and answers a message it can't read with how to send one", async () => {
    const t = await started();
    await t.message(plugin, "Spotify trial ends 5 Dec 119");
    expect(sub(t, "Spotify")).toMatchObject({ kind: "trial", next: "2026-12-05", amount: 119 });
    await t.message(plugin, "what a week");
    expect(t.unsures).toHaveLength(1);
    expect(t.unsures[0]).toContain("help");
  });
});

describe("a group with friends in it", () => {
  it("says how to send one once, then stays quiet while people talk, until something is kept", async () => {
    const t = await started();
    await t.message(plugin, "who paid for dinner", null, null, "Asha");
    await t.message(plugin, "not me", null, null, "Ravi");
    await t.message(plugin, "ok ok");
    expect(t.unsures).toHaveLength(1);
    await t.message(plugin, "Netflix 649 monthly on the 5th", null, null, "Asha");
    await t.message(plugin, "great", null, null, "Ravi");
    expect(t.unsures).toHaveLength(2);
  });

  it("answers every unreadable message while the person is alone", async () => {
    const t = await started();
    await t.message(plugin, "hmm");
    await t.message(plugin, "what now");
    expect(t.unsures).toHaveLength(2);
  });
});

describe("a forwarded bank message", () => {
  it("keeps the name, the amount, how it is paid and the account's last four, as monthly", async () => {
    const t = await started();
    await t.message(plugin, "Rs.649.00 debited from A/c XX4321 on 05-11-26 to NETFLIX via UPI AutoPay. Avl Bal Rs 12,345.10 -HDFC Bank");
    expect(last(t)).toBe("Kept: Netflix, ₹649, paid by UPI AutoPay from HDFC xx4321. I've taken it as monthly, next on 5 December. Reply to this to correct it.");
    expect(sub(t, "Netflix")).toMatchObject({ amount: 649, currency: "INR", via: "upi", account: "HDFC xx4321", from: "forwarded", next: "2026-12-05", kind: "use" });
    expect(JSON.stringify(t.dump())).not.toContain("12,345");
    expect(JSON.stringify(t.dump())).not.toContain("12345");
  });

  it("asks what it is for when the name can't be read, and keeps it once told", async () => {
    const t = await started();
    await t.message(plugin, "Rs 499.00 debited from your account XX1111 on 12-11-26. Ref 4455667788.");
    expect(last(t)).toBe("I read ₹499 on 12 November. What is it for? Reply to this with its name.");
    expect(subs(t)).toHaveLength(1);
    await t.message(plugin, "Cult.fit", t.sent[0].ref);
    expect(sub(t, "Cult.fit")).toMatchObject({ amount: 499, account: "xx1111", next: "2026-12-12", kind: "use" });
  });

  it("moves the date on when the same charge is forwarded again", async () => {
    const t = await started();
    await t.message(plugin, "netflix 599 monthly on the 5th");
    await t.message(plugin, "Rs.649.00 debited from A/c XX4321 on 05-12-26 to NETFLIX via UPI AutoPay.");
    expect(subs(t)).toHaveLength(2);
    expect(sub(t, "netflix")).toMatchObject({ amount: 649, via: "upi" });
  });
});

describe("showing", () => {
  it("lists what is paid for and what expires, with the sum by month and by year", async () => {
    const t = await started();
    await t.message(plugin, "Netflix 649 monthly on the 5th");
    await t.message(plugin, "Google One 1300 yearly 14 March");
    await t.message(plugin, "passport 3 March 2031");
    await t.message(plugin, "list");
    expect(last(t)).toBe(
      ["*What you pay for*", "1. icloud, ₹75 a month, next on 28 November", "2. Netflix, ₹649 a month, next on 5 December", "3. Google One, ₹1,300 a year, next on 14 March 2027", "", "*₹832 a month*, ₹9,984 a year", "", "*Expires*", "4. passport, expires on 3 March 2031"].join("\n"),
    );
  });

  it("says so when there is nothing", async () => {
    const t = createTestKit();
    await t.message(plugin, "list");
    expect(last(t)).toBe(copy.nothingYet());
    await t.message(plugin, "this week");
    expect(last(t)).toBe(copy.nothingThisWeek());
  });

  it("shows the week ahead when asked", async () => {
    const t = await started();
    await t.message(plugin, "Netflix 649 monthly on the 20th");
    await t.message(plugin, "this week");
    expect(last(t)).toBe("This week:\n• Netflix, Friday, ₹649");
  });
});

describe("changing", () => {
  it("removes by name, and by a reply", async () => {
    const t = await started();
    await t.message(plugin, "Netflix 649");
    await t.message(plugin, "remove netflix");
    expect(sub(t, "Netflix")).toBeUndefined();
    await t.message(plugin, "remove", { kind: "sub", id: idOf(t, "icloud") });
    expect(subs(t)).toEqual([]);
    expect(t.reactions).toEqual(["👍", "👍"]);
    await t.message(plugin, "remove netflix");
    expect(last(t)).toBe(copy.notFound({ name: "netflix" }));
    await t.message(plugin, "540", { kind: "sub", id: "gone" });
    expect(last(t)).toBe(copy.gone());
  });

  it("asks which one when a name fits several", async () => {
    const t = await started();
    await t.message(plugin, "car insurance expires 14 Feb");
    await t.message(plugin, "bike insurance expires 20 Feb");
    await t.message(plugin, "remove insurance");
    expect(last(t)).toBe("Which one: car insurance, bike insurance? Send it again with the full name.");
  });

  it("corrects the amount, the date or how often from a reply, and says how otherwise", async () => {
    const t = await started();
    const ref = { kind: "sub", id: idOf(t, "icloud") };
    await t.message(plugin, "219", ref);
    await t.message(plugin, "yearly", ref);
    await t.message(plugin, "3 jan", ref);
    expect(sub(t, "icloud")).toMatchObject({ amount: 219, every: "yearly", next: "2027-01-03" });
    expect(t.reactions).toEqual(["👍", "👍", "👍"]);
    await t.message(plugin, "hmm", ref);
    expect(last(t)).toBe(copy.replyHow());
  });

  it("turns the usage question off and on", async () => {
    const t = await started();
    await t.message(plugin, "Netflix 649 monthly on the 5th");
    await t.message(plugin, "don't ask netflix");
    expect(sub(t, "Netflix").ask).toBe(false);
    await t.message(plugin, "ask netflix");
    expect(sub(t, "Netflix").ask).toBe(true);
    await t.message(plugin, "dont ask me about this one", { kind: "notice", id: idOf(t, "Netflix") });
    expect(sub(t, "Netflix").ask).toBe(false);
  });

  it("asks the kind again on request, and the person's choice wins", async () => {
    const t = await started();
    await t.message(plugin, "kind icloud");
    expect(open(t)[0].options).toHaveLength(4);
    await t.answer(plugin, open(t)[0].ref, 0);
    expect(sub(t, "icloud").kind).toBe("use");
  });

  it("changes the currency, and refuses one it doesn't know", async () => {
    const t = await started();
    await t.message(plugin, "currency");
    expect(last(t)).toBe(copy.countingNow({ currency: "₹" }));
    await t.message(plugin, "currency sgd");
    expect(last(t)).toBe("Counting in S$.");
    await t.message(plugin, "currency moon rocks");
    expect(last(t)).toBe(copy.currencyUnknown());
  });
});

describe("the weekly message", () => {
  it("goes on Sunday evening, only when something is in the week ahead, and once", async () => {
    const t = await started();
    t.setHour(19);
    await t.schedule(plugin, "weekly");
    expect(t.sent).toEqual([]);

    await t.message(plugin, "Netflix 649 monthly on the 20th");
    await t.message(plugin, "car insurance expires 22 November");
    t.sent.length = 0;
    await t.kit.store.delete("state", "weekly");
    await t.schedule(plugin, "weekly");
    expect(last(t)).toBe("This week:\n• Netflix, Friday, ₹649\n• car insurance expires Sunday");
    await t.schedule(plugin, "weekly");
    expect(t.sent).toHaveLength(1);
  });

  it("is not sent on another day, and follows the day set on the page", async () => {
    const t = await started();
    await t.message(plugin, "Netflix 649 monthly on the 20th");
    t.sent.length = 0;
    t.setToday("2026-11-16");
    await t.schedule(plugin, "weekly");
    expect(t.sent).toEqual([]);
    await t.act(plugin, "setWeekly", { day: 1, hour: 8 });
    await t.schedule(plugin, "weekly");
    expect(last(t)).toContain("• Netflix, Friday, ₹649");
  });

  it("is made up the next morning when its evening was missed", async () => {
    const t = await started();
    await t.message(plugin, "Netflix 649 monthly on the 20th");
    t.sent.length = 0;
    await morning(t, "2026-11-16");
    expect(t.sent.map((s) => s.text)).toEqual(["This week:\n• Netflix, Friday, ₹649"]);
    await morning(t, "2026-11-16");
    expect(t.sent).toHaveLength(1);
  });
});

describe("a renewal", () => {
  it("asks three days before whether it was used, says so the day before, and moves on", async () => {
    const t = await quiet();
    await t.message(plugin, "Netflix 649 monthly on the 5th");
    await morning(t, "2026-12-01");
    expect(t.sent).toEqual([]);
    await morning(t, "2026-12-02");
    expect(open(t)[0]).toMatchObject({ question: "Netflix renews Saturday, ₹649. Did you use it this month?", options: ["A lot", "A little", "Not at all"] });
    await morning(t, "2026-12-03");
    expect(t.asked).toHaveLength(1);
    await t.answer(plugin, open(t)[0].ref, 1);
    t.sent.length = 0;
    await morning(t, "2026-12-04");
    expect(t.sent.map((s) => s.text)).toEqual(["Netflix renews tomorrow, ₹649."]);
    await morning(t, "2026-12-04");
    expect(t.sent).toHaveLength(1);
    await morning(t, "2026-12-06");
    expect(sub(t, "Netflix")).toMatchObject({ next: "2027-01-05", misses: 0 });
  });

  it("says where to cancel after two renewals in a row with 'Not at all'", async () => {
    const t = await quiet();
    await t.message(plugin, "netflix 649 monthly on the 5th by upi autopay");
    await morning(t, "2026-12-02");
    await t.answer(plugin, open(t)[0].ref, 2);
    t.sent.length = 0;
    await morning(t, "2026-12-04");
    expect(last(t)).toBe("netflix renews tomorrow, ₹649. You said you didn't use it this month.");
    await morning(t, "2027-01-02");
    await t.answer(plugin, open(t)[0].ref, 2);
    await morning(t, "2027-01-04");
    expect(last(t)).toBe("netflix renews tomorrow, ₹649.\n\nTwo months without netflix. That's ₹1,298. It's paid by UPI AutoPay: stop it in your UPI app, and cancel on netflix too.");
    // Using it again ends the run.
    await morning(t, "2027-02-02");
    await t.answer(plugin, open(t)[0].ref, 0);
    await morning(t, "2027-02-04");
    expect(last(t)).toBe("netflix renews tomorrow, ₹649.");
    expect(sub(t, "netflix").misses).toBe(0);
  });

  it("takes the highest answer when several people answer, and nobody's silence counts", async () => {
    const t = await quiet();
    await t.message(plugin, "Netflix 649 monthly on the 5th");
    await morning(t, "2026-12-02");
    const ref = open(t)[0].ref;
    await t.answer(plugin, ref, 2, "Asha");
    await t.answer(plugin, ref, 0);
    await morning(t, "2026-12-04");
    expect(last(t)).toBe("Netflix renews tomorrow, ₹649.");
    expect(sub(t, "Netflix").misses).toBe(0);
    expect(open(t)).toEqual([]);

    // The next month nobody answers: the run stays as it was.
    await morning(t, "2027-01-02");
    await morning(t, "2027-01-04");
    expect(last(t)).toBe("Netflix renews tomorrow, ₹649.");
    expect(sub(t, "Netflix").misses).toBe(0);
  });

  it("only tells the date and the amount for one that keeps things running, or one not to be asked about", async () => {
    const t = await quiet();
    await t.message(plugin, "Netflix 649 monthly on the 28th");
    await t.message(plugin, "don't ask netflix");
    t.sent.length = 0;
    await morning(t, "2026-11-25");
    expect(t.asked).toEqual([]);
    await morning(t, "2026-11-27");
    expect(t.sent.map((s) => s.text).sort()).toEqual(["Netflix renews tomorrow, ₹649.", "icloud renews tomorrow, ₹75."]);
  });

  it("gives a week's notice of a yearly one, with the question when it is one to use or lose", async () => {
    const t = await quiet();
    await t.message(plugin, "Google One 1300 yearly 14 March");
    await t.message(plugin, "Audible 2999 yearly 14 March");
    t.sent.length = 0;
    await morning(t, "2027-03-07");
    expect(t.sent.map((s) => s.text)).toContain("Google One renews on 14 March, ₹1,300 for the year.");
    expect(open(t)[0].question).toBe("Audible renews on 14 March, ₹2,999 for the year. Did you use it this year?");
  });

  it("still says it on the day itself when the day before was missed, and never after", async () => {
    const t = await quiet();
    t.setToday("2026-11-28");
    t.setHour(9);
    await t.schedule(plugin, "notices");
    expect(last(t)).toBe("icloud renews today, ₹75.");
    t.sent.length = 0;
    await morning(t, "2026-12-10");
    expect(t.sent).toEqual([]);
    expect(sub(t, "icloud").next).toBe("2026-12-28");
  });

  it("warns two days before a trial ends, and treats it as a subscription after", async () => {
    const t = await quiet();
    await t.message(plugin, "Spotify trial ends 5 Dec 119");
    t.sent.length = 0;
    await morning(t, "2026-12-03");
    expect(last(t)).toBe("Spotify's free trial ends Saturday. It charges ₹119 after that.");
    await morning(t, "2026-12-04");
    expect(last(t)).toBe("Spotify's free trial ends tomorrow. It charges ₹119 after that.");
    await morning(t, "2026-12-07");
    expect(sub(t, "Spotify")).toMatchObject({ kind: "use", next: "2027-01-05" });
  });
});

describe("something that expires", () => {
  async function insured() {
    const t = await quiet();
    await t.message(plugin, "car insurance expires 14 Feb");
    t.sent.length = 0;
    t.reactions.length = 0;
    return t;
  }

  it("is told early by how far away it was, the day before, and after the date for five weeks", async () => {
    const t = await insured();
    await morning(t, "2027-01-30");
    expect(t.sent).toEqual([]);
    await morning(t, "2027-01-31");
    expect(last(t)).toBe("car insurance expires on 14 February. That's in 2 weeks.");
    await morning(t, "2027-02-05");
    expect(t.sent).toHaveLength(1);
    await morning(t, "2027-02-13");
    expect(last(t)).toBe("car insurance expires tomorrow.");
    await morning(t, "2027-02-15");
    expect(last(t)).toBe("car insurance expired yesterday.");
    await morning(t, "2027-02-16");
    expect(t.sent).toHaveLength(3);
    await morning(t, "2027-02-22");
    expect(last(t)).toBe("car insurance expired a week ago.");
    await morning(t, "2027-03-15");
    expect(last(t)).toBe("car insurance expired 4 weeks ago.");
    const n = t.sent.length;
    await morning(t, "2027-03-22");
    await morning(t, "2027-06-01");
    expect(t.sent).toHaveLength(n);
  });

  it("gives a passport nine months, then three, then the day before", async () => {
    const t = await quiet();
    await t.message(plugin, "passport 3 March 2031");
    t.sent.length = 0;
    await morning(t, "2030-06-06");
    expect(last(t)).toBe("passport expires on 3 March 2031. That's in 9 months.");
    await morning(t, "2030-12-03");
    expect(last(t)).toBe("passport expires on 3 March 2031. That's in 3 months.");
    await morning(t, "2031-03-02");
    expect(last(t)).toBe("passport expires tomorrow.");
    expect(t.sent).toHaveLength(3);
  });

  it("says a late early notice once, with how near it really is", async () => {
    const t = await insured();
    await morning(t, "2027-02-08");
    expect(t.sent.map((s) => s.text)).toEqual(["car insurance expires on 14 February. That's in 6 days."]);
  });

  it("asks what a 👍 means the first time, learns it, and takes the next one that way", async () => {
    const t = await insured();
    await morning(t, "2027-02-13");
    const notice = t.sent[0].ref;
    await t.react(plugin, "👍", notice);
    expect(open(t)[0]).toMatchObject({ question: "Is car insurance done, or did you mean okay?", options: ["Done", "Just okay"] });
    // Someone else can't say what the person meant.
    await t.answer(plugin, open(t)[0].ref, 1, "Asha");
    expect(t.dump()["thumbs/owner"]).toBeUndefined();
    await t.answer(plugin, open(t)[0].ref, 0);
    expect(t.dump()["thumbs/owner"]).toBe("done");
    expect(t.sent.map((s) => s.text)).toContain("Got it. From now on, a 👍 from you on one of these means done.");
    expect(open(t)[0]).toMatchObject({ question: "Until 14 February 2028?", options: ["Yes", "Another date", "It's not renewed again"] });
    await t.answer(plugin, open(t)[0].ref, 0);
    expect(last(t)).toBe("car insurance: until 14 February 2028.");
    expect(sub(t, "car insurance")).toMatchObject({ next: "2028-02-14", done: false, sent: {}, first: 30 });

    // The next time, no question about the 👍.
    await morning(t, "2028-02-13");
    await t.react(plugin, "👍", t.sent[t.sent.length - 1].ref);
    expect(open(t).map((a) => a.question)).toEqual(["Until 14 February 2029?"]);
  });

  it("leaves it open when a 👍 means okay, and takes the word done", async () => {
    const t = await insured();
    await morning(t, "2027-02-13");
    await t.react(plugin, "👍", t.sent[0].ref);
    await t.answer(plugin, open(t)[0].ref, 1);
    expect(last(t)).toContain("means okay");
    expect(sub(t, "car insurance").done).toBeFalsy();
    await t.react(plugin, "👍", t.sent[0].ref);
    expect(open(t)).toEqual([]);
    await t.message(plugin, "done", t.sent[0].ref);
    expect(open(t)[0].question).toBe("Until 14 February 2028?");
    // Marked done: nothing more is said about the old date.
    const n = t.sent.length;
    await morning(t, "2027-02-15");
    expect(t.sent).toHaveLength(n);
  });

  it("takes another date, or that it is not renewed again", async () => {
    const t = await insured();
    await t.message(plugin, "done car insurance");
    await t.answer(plugin, open(t)[0].ref, 1);
    expect(last(t)).toBe(copy.nextDate({ name: "car insurance" }));
    await t.message(plugin, "1 March 2028", t.sent[t.sent.length - 1].ref);
    expect(last(t)).toBe("car insurance: until 1 March 2028.");
    expect(sub(t, "car insurance").next).toBe("2028-03-01");

    await t.message(plugin, "car insurance renewed");
    await t.answer(plugin, open(t)[0].ref, 2);
    expect(last(t)).toBe("car insurance is off the list.");
    expect(sub(t, "car insurance")).toBeUndefined();
  });

  it("asks for the next date in words when there is no usual length, and a ✅ always means done", async () => {
    const t = await quiet();
    await t.message(plugin, "driving licence expires 10 Jan 2027");
    t.sent.length = 0;
    await morning(t, "2027-01-09");
    await t.react(plugin, "✅", t.sent[0].ref);
    expect(t.asked).toEqual([]);
    expect(last(t)).toBe(copy.nextDate({ name: "driving licence" }));
    await t.message(plugin, "not renewed again", t.sent[t.sent.length - 1].ref);
    expect(last(t)).toBe("driving licence is off the list.");
  });

  it("does nothing for a reaction it has no use for", async () => {
    const t = await insured();
    await t.react(plugin, "👍", { kind: "notice", id: "gone" });
    await t.react(plugin, "👍", { kind: "notice", id: idOf(t, "icloud") });
    await t.react(plugin, null, { kind: "notice", id: idOf(t, "car insurance") });
    await t.react(plugin, "👍", { some: "old ref" });
    expect(t.asked).toEqual([]);
    expect(t.sent).toEqual([]);
    await t.message(plugin, "done icloud");
    expect(last(t)).toContain("renews by itself");
  });
});

describe("plain words", () => {
  it("offers what it keeps as the things a message could be about", async () => {
    const t = await started();
    expect(Object.values(await t.targets(plugin))).toEqual(["icloud"]);
  });

  it("keeps what was meant as an add, and says how when it still can't read it", async () => {
    const t = await started();
    await t.intent(plugin, "i pay 649 for netflix every month", "add");
    expect(sub(t, "netflix")).toMatchObject({ amount: 649, every: "monthly" });
    await t.intent(plugin, "i have a new subscription", "add");
    expect(last(t)).toContain("_help_");
  });

  it("lists, shows the week, removes and marks done", async () => {
    const t = await started();
    await t.message(plugin, "passport expires 3 March 2031");
    await t.intent(plugin, "what am i paying for", "list");
    expect(last(t)).toContain("*What you pay for*");
    await t.intent(plugin, "anything coming up", "this_week");
    expect(last(t)).toBe(copy.nothingThisWeek());
    await t.intent(plugin, "i renewed something", "done");
    expect(last(t)).toContain("Which one?");
    await t.intent(plugin, "got the passport renewed", "done", idOf(t, "passport"));
    expect(open(t)[0].question).toBe("Until 3 March 2041?");
    await t.intent(plugin, "the cloud thing is done", "done", idOf(t, "icloud"));
    expect(last(t)).toContain("renews by itself");
    await t.intent(plugin, "i cancelled icloud", "remove", idOf(t, "icloud"));
    expect(sub(t, "icloud")).toBeUndefined();
  });
});

describe("the page", () => {
  it("loads both sections, the sums and the settings", async () => {
    const t = await started();
    await t.message(plugin, "passport expires 3 March 2031");
    expect(await t.load(plugin)).toMatchObject({
      subscriptions: [{ name: "icloud", amount: "₹75", every: "monthly", next: "2026-11-28", kind: "keeps", ask: true }],
      expires: [{ name: "passport", amount: null, next: "2031-03-03", kind: "expires", done: false }],
      perMonth: "₹75",
      perYear: "₹900",
      currency: "INR",
      weeklyDay: 0,
      weeklyHour: 19,
      thumb: null,
    });
  });

  it("removes, turns the question off, and sets what a 👍 means", async () => {
    const t = await started();
    const id = idOf(t, "icloud");
    await t.act(plugin, "setAsk", { id, ask: false });
    expect(sub(t, "icloud").ask).toBe(false);
    await t.act(plugin, "setThumb", { means: "okay" });
    expect(((await t.load(plugin)) as { thumb: string }).thumb).toBe("okay");
    await t.act(plugin, "remove", { id });
    expect(subs(t)).toEqual([]);
  });

  it("refuses what it can't do, in a plain sentence", async () => {
    const t = await started();
    await expect(t.act(plugin, "remove", { id: "nope" })).rejects.toThrow("already off the list");
    await expect(t.act(plugin, "setAsk", { id: "nope", ask: true })).rejects.toThrow("off the list");
    await expect(t.act(plugin, "setWeekly", { day: 9, hour: 8 })).rejects.toThrow("day of the week");
    await expect(t.act(plugin, "setWeekly", { day: 1, hour: 30 })).rejects.toThrow("hour");
    await expect(t.act(plugin, "setThumb", { means: "maybe" })).rejects.toThrow("done or okay");
  });

  it("turns the weekly message off, and then nothing is made up for it", async () => {
    const t = await started();
    await t.message(plugin, "Netflix 649 monthly on the 20th");
    await t.act(plugin, "setWeekly", { day: 0, hour: null });
    t.sent.length = 0;
    await morning(t, "2026-11-16");
    expect(t.sent).toEqual([]);
  });
});

describe("what it says about itself", () => {
  it("answers help with the list of messages, and asks nothing in its welcome", async () => {
    const t = createTestKit();
    await t.message(plugin, "help");
    expect(t.sent[0].text).toBe(plugin.help);
    expect(plugin.welcome).not.toContain("?");
  });

  it("is not sold as a WhatsApp app, and never claims to read a bank account", () => {
    for (const text of [plugin.tagline, plugin.listing!.title, plugin.listing!.h1, plugin.listing!.description]) expect(text).not.toMatch(/whatsapp/i);
    expect(plugin.description).toContain("never sees your bank account");
  });
});
