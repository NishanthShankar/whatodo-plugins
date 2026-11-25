import { describe, expect, it } from "vitest";
import chores, { MAX_JOBS, type Job, type Person } from "..";
import { createTestKit } from "../../../testing";
import type { Json } from "../../../sdk";
import { copy, IDEA_JOBS, sayRhythm } from "../copy";
import { readJob } from "../read";
import { dueOn, nextAfter, readBack, readHour } from "../when";

// 2026-11-15 is a Sunday.
const SUN = "2026-11-15";
const MON = "2026-11-16";
const TUE = "2026-11-17";

/** A brand new home: Ravi has just added the app. */
const fresh = (opts: { today?: string; hour?: number; name?: string } = {}) => createTestKit({ today: opts.today ?? SUN, hour: opts.hour ?? 21, person: { name: opts.name ?? "Ravi Kumar", timezone: "Asia/Kolkata" } });
type T = ReturnType<typeof fresh>;
/** A home that is past its first job, so what is said the first time doesn't get in the way of what a test is about. */
const home = (opts: { today?: string; hour?: number } = {}) => {
  const t = fresh(opts);
  void t.kit.store.put("homes", "main", { name: null, hour: 8, turns: "move", weekly: false, taught: 1, offered: 1, toldPeople: 1, made: 1 }, 1);
  return t;
};

const jobs = (t: T) =>
  Object.entries(t.dump())
    .filter(([k]) => k.startsWith("jobs/"))
    .map(([, v]) => v as unknown as Job);
const job = (t: T, name: string) => jobs(t).find((j) => j.name === name)!;
const people = (t: T) =>
  Object.entries(t.dump())
    .filter(([k]) => k.startsWith("people/"))
    .map(([k, v]) => ({ id: k.split(":")[1], ...(v as unknown as Person) }));
const done = (t: T) =>
  Object.entries(t.dump())
    .filter(([k]) => k.startsWith("done/"))
    .map(([, v]) => v as unknown as { name: string; who: string | null; by: string | null });
const last = (t: T) => t.sent.at(-1)!.text;
/** The next morning: the day moves on and the hourly schedule fires at 8. */
async function morning(t: T, day: string) {
  t.setToday(day);
  t.setHour(8);
  await t.schedule(chores, "day");
}
const openList = (t: T) => t.asked.filter((a) => a.open && (a.ref as { kind?: string })?.kind === "day").at(-1)!;

describe("reading a job", () => {
  it("reads the rhythms people write", () => {
    const r = (text: string) => readJob(text, SUN)?.rhythm;
    expect(r("bins every day")).toEqual({ kind: "daily" });
    expect(r("bins daily")).toEqual({ kind: "daily" });
    expect(r("bathroom every Sunday")).toEqual({ kind: "weekdays", days: [0] });
    expect(r("dishes every mon, wed and fri")).toEqual({ kind: "weekdays", days: [1, 3, 5] });
    expect(r("dishes on weekdays")).toEqual({ kind: "weekdays", days: [1, 2, 3, 4, 5] });
    expect(r("mopping weekly")).toEqual({ kind: "weekdays", days: [0] });
    expect(r("sweeping every 3 days")).toEqual({ kind: "every", n: 3, from: SUN });
    expect(r("sheets every other week")).toEqual({ kind: "every", n: 14, from: SUN });
    expect(r("plants every other day")).toEqual({ kind: "every", n: 2, from: SUN });
    expect(r("society bill monthly on the 5th")).toEqual({ kind: "monthly", date: 5 });
    expect(r("rent on the 1st of every month")).toEqual({ kind: "monthly", date: 1 });
    expect(r("pay the help monthly")).toEqual({ kind: "monthly", date: 15 });
    expect(r("gas when needed")).toEqual({ kind: "asked" });
  });

  it("reads the name and who takes turns", () => {
    expect(readJob("bins every day, Ravi Asha Kiran", SUN)).toEqual({ name: "Bins", rhythm: { kind: "daily" }, rota: ["Ravi", "Asha", "Kiran"] });
    expect(readJob("Bathroom every Sunday, take turns", SUN)?.rota).toBe("everyone");
    expect(readJob("book the gas when needed", SUN)).toEqual({ name: "Book the gas", rhythm: { kind: "asked" }, rota: null });
    expect(readJob("bins every day: ravi, asha and mary ann", SUN)?.rota).toEqual(["Ravi", "Asha", "Mary Ann"]);
    expect(readJob("add job bins daily, anyone", SUN)).toEqual({ name: "Bins", rhythm: { kind: "daily" }, rota: null });
  });

  it("leaves ordinary talk alone", () => {
    expect(readJob("see you on sunday", SUN)).toBeNull();
    expect(readJob("every day", SUN)).toBeNull();
    expect(readJob("we argue about the bins every day and it is 2 much", SUN)).toBeNull();
    expect(readJob("who is cooking tonight", SUN)).toBeNull();
  });

  it("knows when a rhythm falls", () => {
    expect(dueOn({ kind: "weekdays", days: [0] }, SUN)).toBe(true);
    expect(dueOn({ kind: "weekdays", days: [0] }, MON)).toBe(false);
    expect(dueOn({ kind: "every", n: 3, from: SUN }, "2026-11-18")).toBe(true);
    expect(dueOn({ kind: "every", n: 3, from: SUN }, TUE)).toBe(false);
    expect(dueOn({ kind: "monthly", date: 31 }, "2026-11-30")).toBe(true);
    expect(dueOn({ kind: "asked" }, SUN)).toBe(false);
    expect(nextAfter({ kind: "monthly", date: 5 }, SUN)).toBe("2026-12-05");
    expect(nextAfter({ kind: "asked" }, SUN)).toBeNull();
  });

  it("reads the day someone is back", () => {
    expect(readBack("till the 20th", SUN)).toBe("2026-11-20");
    expect(readBack("till the 12th", SUN)).toBe("2026-12-12");
    expect(readBack("until friday", SUN)).toBe("2026-11-20");
    expect(readBack("till 3 dec", SUN)).toBe("2026-12-03");
    expect(readBack("until jan 2", SUN)).toBe("2027-01-02");
    expect(readBack("for 3 days", SUN)).toBe("2026-11-18");
    expect(readBack("for a week", SUN)).toBe("2026-11-22");
    expect(readBack("", SUN)).toBe("open");
    expect(readBack("because of the wedding", SUN)).toBeNull();
  });

  it("reads an hour and says a rhythm", () => {
    expect(readHour("7am")).toBe(7);
    expect(readHour("7 pm")).toBe(19);
    expect(readHour("12am")).toBe(0);
    expect(readHour("19:00")).toBe(19);
    expect(readHour("25")).toBeNull();
    expect(sayRhythm({ kind: "weekdays", days: [1, 3, 5] })).toBe("every Mon, Wed and Fri");
    expect(sayRhythm({ kind: "every", n: 14, from: SUN })).toBe("every 2 weeks");
    expect(sayRhythm({ kind: "monthly", date: 22 })).toBe("monthly on the 22nd");
  });
});

describe("the first five minutes", () => {
  const ideas = (t: T) => t.asked.find((a) => (a.ref as { kind?: string })?.kind === "ideas");

  it("teaches the tick by doing it: the first job is today's, a 👍 does it, and the rest follows once", async () => {
    const t = fresh({ hour: 15 });
    await t.message(chores, "bins every day, Ravi Asha Kiran");
    // One message: what was understood, and the one thing to do now.
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].text).toBe("*Bins*, every day. Ravi, Asha and Kiran take turns, Ravi first.\n\nIt is due today, so try it now. React 👍 to this message when it's done.");
    expect(t.asked).toHaveLength(0);

    await t.react(chores, "👍", t.sent[0].ref);
    expect(t.sent).toHaveLength(2);
    expect(t.sent[1].text).toBe(
      "*Bins*: done by Ravi. Next time it is Asha's.\n\nThat is all there is to it. Each morning at 8am I send the day's jobs here as one list. Whoever ticks a job did it, and the turn moves on.\n\nFrom now on a ✅ means done.\n\nAsha and Kiran need to be in this group to tick their jobs. Add them here if they aren't yet. They install nothing.",
    );
    // Then, once, the usual jobs to pick from. Bins is left out: the home has it.
    expect(ideas(t)).toMatchObject({ intro: copy.ideasOffer(), multiple: true });
    expect(ideas(t)!.options).toHaveLength(IDEA_JOBS.length - 1);
    expect(ideas(t)!.options[0]).toBe("Dishes, every day");
    await t.answer(chores, ideas(t)!.ref, [0]);
    expect(jobs(t).map((j) => j.name).sort()).toEqual(["Bins", "Dishes"]);

    // That message was today's list: nothing more goes out today. Tomorrow's needs no explaining.
    t.setHour(16);
    await t.schedule(chores, "day");
    expect(t.sent).toHaveLength(2);
    await morning(t, MON);
    expect(openList(t).options).toEqual(["Bins (Asha)", "Dishes (anyone)"]);
    expect(openList(t).intro).toBeNull();

    // From here on a job that is added, and a tick, get the short answer.
    await t.message(chores, "bathroom every sunday, Ravi Asha");
    expect(last(t)).toBe("*Bathroom*, every Sunday. Ravi and Asha take turns, Ravi first.");
    await t.message(chores, "dishes done");
    expect(t.reactions).toEqual(["✅"]);
    expect(t.asked.filter((a) => (a.ref as { kind?: string })?.kind === "ideas")).toHaveLength(1);
  });

  it("asks which name is theirs when their WhatsApp name doesn't say, before anything else", async () => {
    const t = fresh({ hour: 15, name: "Nishanth" });
    await t.message(chores, "bins every day, Nish Asha");
    expect(t.sent.map((s) => s.text)).toEqual(["*Bins*, every day. Nish and Asha take turns, Nish first."]);
    expect(t.asked[0]).toMatchObject({ question: "Which of these is you?", options: ["Nish", "Asha", "None of them"], confirm: false });
    // Someone else tapping it changes nothing.
    await t.answer(chores, t.asked[0].ref, 1, "Asha");
    expect(t.sent).toHaveLength(1);
    await t.answer(chores, t.asked[0].ref, 0);
    expect(t.asked[0].open).toBe(false);
    expect(last(t)).toBe("Noted: you are Nish in the rotas.\n\nIt is due today, so try it now. React 👍 to this message when it's done.");
    await t.react(chores, "👍", t.sent.at(-1)!.ref);
    expect(done(t)[0].who).toBe("Nish");
    expect(people(t).map((p) => p.name)).toEqual(["Nish", "Asha"]);
    // His own turn, done by him: nothing is said about someone covering.
    expect(last(t)).toContain("*Bins*: done by Nish. Next time it is Asha's.");
  });

  it("takes a typed 'I'm Nish' as the answer too, and 'None of them' as nobody", async () => {
    const t = fresh({ hour: 15, name: "Nishanth" });
    await t.message(chores, "bins every day, Nish Asha");
    await t.message(chores, "I'm Nish");
    expect(t.asked[0].open).toBe(false);
    expect(last(t)).toContain("Noted: you are Nish in the rotas.");

    const u = fresh({ hour: 15, name: "Nishanth" });
    await u.message(chores, "bins every day, Meera Asha");
    await u.answer(chores, u.asked[0].ref, 2);
    expect(last(u)).toBe("It is due today, so try it now. React 👍 to this message when it's done.");
    expect(people(u).map((p) => p.name)).toEqual(["Meera", "Asha", "Nishanth"]);
  });

  it("says when the first job comes up when that isn't today, and offers the usual jobs then", async () => {
    const t = fresh();
    await t.message(chores, "bathroom every saturday, Ravi Asha");
    expect(t.sent[0].text).toBe(
      "*Bathroom*, every Saturday. Ravi and Asha take turns, Ravi first.\n\nIt first comes up on Sat 21 Nov. That morning at 8am I send it here to tick. Whoever ticks a job did it, and the turn moves on.\n\nAsha needs to be in this group to tick a job. Add them here if they aren't yet. They install nothing.",
    );
    expect(t.sent[0].ref).toBeNull();
    expect(ideas(t)!.options).toHaveLength(IDEA_JOBS.length - 1);

    const u = fresh();
    await u.message(chores, "gas when needed");
    expect(u.sent[0].text).toBe("*Gas*, when needed. Anyone can do it.\n\nIt has no fixed day. Say _gas needed_ when it is, and it joins the day's list.");
  });

  it("explains credit and turns the first time someone does another person's job, once", async () => {
    const t = home({ hour: 7 });
    await t.message(chores, "bins daily, Ravi Asha Kiran");
    await t.message(chores, "dishes daily, Asha Ravi");
    await morning(t, SUN);
    await t.answer(chores, openList(t).ref, [0], "Asha");
    expect(last(t)).toBe("Asha did *Bins*, which was Ravi's turn. The credit is Asha's, and the turn moves on to Asha all the same. Ravi can change that with _turns stay_.");
    const said = t.sent.length;
    await morning(t, MON);
    await t.answer(chores, openList(t).ref, [0, 1], "Kiran");
    expect(t.sent).toHaveLength(said);
  });

  it("takes people tagged with an @ as the rota, and knows them from then on", async () => {
    const t = fresh({ hour: 15 });
    const tagged = { mentions: [{ id: "asha", name: "Asha Rao", owner: false }, { id: "kiran", name: "Kiran", owner: false }] };
    await t.message(chores, "bins every day", null, null, undefined, undefined, tagged);
    expect(t.sent[0].text).toContain("*Bins*, every day. Asha and Kiran take turns, Asha first.");
    expect(people(t).map((p) => [p.name, p.sender])).toEqual([["Asha", "asha"], ["Kiran", "kiran"]]);
    // Ravi isn't in it and everyone in it is known, so nothing is asked.
    expect(t.asked).toHaveLength(0);
    await t.message(chores, "dishes daily");
    await t.message(chores, "dishes rota", null, null, undefined, undefined, tagged);
    expect(last(t)).toBe("*Dishes*, every day. Asha and Kiran take turns, Asha first.");
  });

  it("says the same in a group the home already had, to whoever starts", async () => {
    const t = fresh({ hour: 15 });
    await t.group(chores, "joined", "x-flat", "Flat 4B");
    expect(last(t)).not.toContain("?");
    await t.message(chores, "bins every day, Ravi Asha", null, "x-flat", "Asha");
    expect(t.sent.at(-1)).toMatchObject({ group: "x-flat", text: "*Bins*, every day. Ravi and Asha take turns, Ravi first.\n\nIt is due today, so try it now. React 👍 to this message when it's done." });
    await t.react(chores, "✅", t.sent.at(-1)!.ref, "x-flat", "Asha");
    // Everyone is in such a group already: nobody is told to add anyone.
    expect(last(t)).not.toContain("Add them");
    expect(last(t)).toContain("*Bins*: done by Asha.");
  });
});

describe("jobs", () => {
  it("keeps a job and says what it understood", async () => {
    const t = home();
    await t.message(chores, "bins every day, Ravi Asha Kiran");
    expect(last(t)).toBe("*Bins*, every day. Ravi, Asha and Kiran take turns, Ravi first.");
    expect(job(t, "Bins").rota).toHaveLength(3);
    expect(people(t).map((p) => p.name)).toEqual(["Ravi", "Asha", "Kiran"]);

    await t.message(chores, "book the gas when needed");
    expect(last(t)).toBe("*Book the gas*, when needed. Anyone can do it.");
    expect(t.reactions).toEqual([]);
  });

  it("changes the job that has that name instead of keeping a second one", async () => {
    const t = home();
    await t.message(chores, "bins every day, Ravi Asha");
    await t.message(chores, "bins every monday");
    expect(jobs(t)).toHaveLength(1);
    expect(job(t, "Bins").rhythm).toEqual({ kind: "weekdays", days: [1] });
    expect(job(t, "Bins").rota).toHaveLength(2);
    await t.message(chores, "bins rota Kiran, Asha");
    expect(last(t)).toContain("Kiran and Asha take turns, Kiran first.");
  });

  it("asks who takes turns when it knows fewer than two people", async () => {
    const t = home();
    await t.message(chores, "bathroom every sunday, take turns");
    expect(last(t)).toContain("*Bathroom* is kept, for anyone to do.");
    expect(last(t)).toContain("bathroom rota Ravi Asha Kiran");
    await t.message(chores, "bins daily, Ravi Asha");
    await t.message(chores, "bathroom every sunday, take turns");
    expect(last(t)).toContain("Ravi and Asha take turns");
  });

  it("lists, renames and removes", async () => {
    const t = home();
    await t.message(chores, "jobs");
    expect(last(t)).toBe(copy.noJobs());
    await t.message(chores, "bins every day, Ravi Asha");
    await t.message(chores, "gas when needed");
    await t.message(chores, "jobs");
    expect(last(t)).toBe("*Jobs*\n\n1. Bins · every day · Ravi next (Ravi, Asha)\n2. Gas · when needed · anyone");
    await t.message(chores, "rename bins to trash");
    expect(job(t, "Trash")).toBeTruthy();
    await t.message(chores, "remove trash");
    expect(jobs(t).map((j) => j.name)).toEqual(["Gas"]);
    expect(t.reactions).toEqual(["👍", "👍"]);
  });

  it("stops at the most jobs a home keeps", async () => {
    const t = home();
    for (let i = 0; i < MAX_JOBS; i++) await t.message(chores, `job${String.fromCharCode(97 + (i % 26))}${i > 25 ? "x" : ""} daily`);
    expect(jobs(t)).toHaveLength(MAX_JOBS);
    await t.message(chores, "one more daily");
    expect(last(t)).toBe(copy.jobsFull({ max: MAX_JOBS }));
  });
});

describe("the morning list", () => {
  async function two(t: T) {
    await t.message(chores, "bins every day, Ravi Asha Kiran");
    await t.message(chores, "dishes every day, Asha Ravi");
  }

  it("sends the day's jobs as one tick list at the home's hour, once", async () => {
    const t = home();
    await two(t);
    t.setToday(MON);
    t.setHour(7);
    await t.schedule(chores, "day");
    expect(t.asked).toHaveLength(0);
    t.setHour(8);
    await t.schedule(chores, "day");
    expect(t.asked).toHaveLength(1);
    expect(t.asked[0]).toMatchObject({ question: "Today's jobs. Tick what you did.", options: ["Bins (Ravi)", "Dishes (Asha)"], multiple: true, intro: copy.teachList() });
    t.setHour(9);
    await t.schedule(chores, "day");
    expect(t.asked).toHaveLength(1);
  });

  it("still sends it later the same day when the hour was missed", async () => {
    const t = home();
    await two(t);
    t.setToday(MON);
    t.setHour(11);
    await t.schedule(chores, "day");
    expect(t.asked).toHaveLength(1);
  });

  it("sends nothing on a day with nothing due", async () => {
    const t = home();
    await t.message(chores, "bathroom every sunday, Ravi Asha");
    const before = t.sent.length;
    await morning(t, MON);
    expect(t.asked).toHaveLength(0);
    expect(t.sent).toHaveLength(before);
  });

  it("gives the credit to whoever ticks, and moves the turn on", async () => {
    const t = home();
    await two(t);
    await morning(t, MON);
    // Asha ticks Ravi's bins.
    await t.answer(chores, openList(t).ref, [0], "Asha");
    expect(done(t)).toEqual([expect.objectContaining({ name: "Bins", who: "Asha" })]);
    expect(job(t, "Bins").open).toBeNull();
    await morning(t, TUE);
    // The turn moved on from Ravi all the same. Dishes wasn't ticked and stays with Asha.
    expect(openList(t).options).toEqual(["Bins (Asha)", "Dishes (Asha)"]);
    expect(openList(t).intro).toBe(copy.missed({ names: ["Dishes"] }));
    expect(t.asked[0].open).toBe(false);
  });

  it("keeps the turn with you under the other rule, and says the change in the group", async () => {
    const t = home();
    await two(t);
    await t.message(chores, "turns stay", null, null, "Asha");
    expect(last(t)).toBe(copy.ownerOnly({ owner: "Ravi" }));
    await t.message(chores, "turns stay");
    expect(last(t)).toBe(copy.turnsChanged({ turns: "stay" }));
    await morning(t, MON);
    await t.answer(chores, openList(t).ref, [0], "Asha");
    expect(done(t)[0].who).toBe("Asha");
    await morning(t, TUE);
    expect(openList(t).options[0]).toBe("Bins (Ravi)");
    // Ravi does it himself: now it moves on.
    await t.answer(chores, openList(t).ref, [0]);
    await morning(t, "2026-11-18");
    expect(openList(t).options[0]).toBe("Bins (Asha)");
  });

  it("takes a tick back when it is unticked, by the one who ticked", async () => {
    const t = home();
    await two(t);
    await morning(t, MON);
    const ref = openList(t).ref;
    await t.answer(chores, ref, [0], "Asha");
    await t.answer(chores, ref, [0, 1], "Kiran");
    expect(done(t).map((d) => d.who)).toEqual(expect.arrayContaining(["Asha", "Kiran"]));
    // Kiran can't untick what Asha ticked.
    await t.answer(chores, ref, [], "Kiran");
    expect(done(t).map((d) => d.name)).toEqual(["Bins"]);
    await t.answer(chores, ref, [], "Asha");
    expect(done(t)).toEqual([]);
    expect(job(t, "Bins")).toMatchObject({ open: MON, at: 0, last: null });
  });

  it("sends a single job as a line to react to", async () => {
    const t = home();
    await t.message(chores, "bins every day, Ravi Asha");
    await morning(t, MON);
    expect(t.asked).toHaveLength(0);
    const line = t.sent.at(-1)!;
    expect(line.text).toBe("Today: *Bins* (Ravi). React 👍 when it's done. Whoever reacts did it, and the turn moves on to the next person.");
    await t.react(chores, "😂", line.ref);
    expect(done(t)).toEqual([]);
    await t.react(chores, "👍", line.ref, null, "Asha");
    expect(done(t)[0].who).toBe("Asha");
    // The first tick in a home is answered in words, once.
    expect(last(t)).toContain("*Bins*: done by Asha. Next time it is Asha's.");
    expect(t.reactions).toEqual([]);
    await t.react(chores, null, line.ref, null, "Asha");
    expect(done(t)).toEqual([]);
    // A reaction on a line about a job that is gone does nothing.
    await t.react(chores, "👍", { kind: "one", home: "main", day: MON, job: "nope" });
    await morning(t, TUE);
    expect(last(t)).toBe("*Bins* (Ravi) wasn't ticked yesterday, so it is today's job again. React 👍 when it's done.");
  });

  it("splits more than twelve jobs evenly over two lists", async () => {
    const t = home();
    for (let i = 0; i < 13; i++) await t.message(chores, `job${String.fromCharCode(97 + i)} daily`);
    await morning(t, MON);
    expect(t.asked.map((a) => a.options.length)).toEqual([7, 6]);
    expect(t.asked[0].question).toBe("Today's jobs, 1 of 2. Tick what you did.");
    expect(t.asked[1].intro).toBeNull();
  });

  it("counts every 3 days from the day it was last done", async () => {
    const t = home({ hour: 7 });
    await t.message(chores, "sweeping every 3 days");
    await t.message(chores, "bins daily");
    await morning(t, SUN);
    expect(openList(t).options).toEqual(["Sweeping (anyone)", "Bins (anyone)"]);
    await morning(t, MON);
    // Done a day late: the next one is three days after that.
    await t.answer(chores, openList(t).ref, [0]);
    expect(job(t, "Sweeping").rhythm).toEqual({ kind: "every", n: 3, from: MON });
    await morning(t, "2026-11-18");
    expect(t.sent.at(-1)!.text).toContain("*Bins*");
    await morning(t, "2026-11-19");
    expect(openList(t).options).toContain("Sweeping (anyone)");
  });

  it("sends the count on Mondays only when the home asked for it", async () => {
    const t = home({ hour: 7 });
    await t.message(chores, "bins daily, Ravi Asha");
    await t.message(chores, "dishes daily, Ravi Asha");
    await morning(t, SUN);
    await t.answer(chores, openList(t).ref, [0, 1], "Asha");
    await morning(t, MON);
    expect(t.sent.some((s) => s.text.includes("Who did what"))).toBe(false);
    await t.answer(chores, openList(t).ref, [0, 1], "Asha");
    await t.message(chores, "weekly count on");
    expect(last(t)).toBe(copy.weeklyOn());
    await morning(t, "2026-11-23");
    expect(t.sent.find((s) => s.text.includes("Who did what"))!.text).toBe("*Who did what, last week*\n\nAsha 2\n\n2 jobs in all.");
  });
});

describe("ticking with words", () => {
  it("explains the first time, then answers with a ✅", async () => {
    const t = home({ hour: 7 });
    await t.message(chores, "bins daily, Ravi Asha");
    await t.message(chores, "dishes daily, Asha Ravi");
    // Before the list has gone out, a job due today can already be ticked.
    await t.message(chores, "bins done", null, null, "Asha");
    expect(last(t)).toBe("*Bins*: done by Asha. Next time it is Asha's.\n\nThat is all there is to it. Each morning at 8am I send the day's jobs here as one list. Whoever ticks a job did it, and the turn moves on.\n\nFrom now on a ✅ means done.");
    await t.message(chores, "did the dishes", null, null, "Asha");
    expect(t.reactions).toEqual(["✅"]);
    await t.message(chores, "bins done");
    expect(last(t)).toBe("*Bins* is already ticked, by Asha.");
    // The morning list doesn't ask again for what was done.
    await morning(t, SUN);
    expect(t.asked).toHaveLength(0);
    await t.message(chores, "today");
    expect(last(t)).toBe("*Today*\n\n✅ Bins · Asha\n✅ Dishes · Asha");
  });

  it("says when a job isn't on today's list", async () => {
    const t = home();
    await t.message(chores, "bathroom every saturday, Ravi Asha");
    await t.message(chores, "bathroom done");
    expect(last(t)).toBe("*Bathroom* isn't on today's list. It is next due on Sat 21 Nov, with Ravi.");
    await t.message(chores, "whose turn is the bathroom?");
    expect(last(t)).toBe("*Bathroom*: Ravi, next on Sat 21 Nov.");
    await t.message(chores, "bathroom?");
    expect(last(t)).toBe("*Bathroom*: Ravi, next on Sat 21 Nov.");
  });

  it("takes a job with no fixed day when it is needed", async () => {
    const t = home();
    await t.message(chores, "book the gas when needed, Ravi Asha");
    await t.message(chores, "today");
    expect(last(t)).toBe(copy.nothingToday());
    await t.message(chores, "gas finished");
    expect(last(t)).toBe("*Book the gas* is on the list, with Ravi. Say _book the gas done_ when it is.");
    await t.message(chores, "today");
    expect(last(t)).toBe("*Today*\n\n☐ Book the gas (Ravi)");
    await morning(t, MON);
    // It stays on the list, and nobody is told off about it.
    expect(last(t)).toBe("Today: *Book the gas* (Ravi). React 👍 when it's done. Whoever reacts did it, and the turn moves on to the next person.");
    await t.message(chores, "gas booked");
    expect(job(t, "Book the gas")).toMatchObject({ open: null, at: 1 });
    await t.message(chores, "gas not done");
    expect(job(t, "Book the gas")).toMatchObject({ open: MON, at: 0 });
  });
});

describe("people", () => {
  it("skips someone who is away until they are back", async () => {
    const t = home({ hour: 7 });
    await t.message(chores, "bins daily, Asha Ravi Kiran");
    await t.message(chores, "dishes daily, Kiran Asha");
    await t.message(chores, "Asha away till the 17th");
    expect(last(t)).toBe("Asha is away until Tue 17 Nov. I skip Asha in every rota till then.");
    await morning(t, SUN);
    expect(openList(t).options).toEqual(["Bins (Ravi)", "Dishes (Kiran)"]);
    await morning(t, TUE);
    expect(openList(t).options[0]).toBe("Bins (Asha)");
    await t.message(chores, "I'm away", null, null, "Kiran");
    expect(last(t)).toBe("Kiran is away. I skip Kiran in every rota until someone says _Kiran back_.");
    await t.message(chores, "today");
    expect(last(t)).toContain("☐ Dishes (Asha)");
    await t.message(chores, "kiran is back");
    expect(people(t).find((p) => p.name === "Kiran")!.back).toBeNull();
    await t.message(chores, "Asha away because of things");
    expect(last(t)).toBe(copy.awayWhen());
  });

  it("swaps two turns, once", async () => {
    const t = home({ hour: 7 });
    await t.message(chores, "bins daily, Ravi Asha Kiran");
    await t.message(chores, "dishes daily");
    await t.message(chores, "swap bins with Kiran");
    expect(last(t)).toBe("Swapped, once: Kiran takes Ravi's next turn at Bins, and Ravi takes Kiran's.");
    const who = async (day: string) => {
      await morning(t, day);
      const label = openList(t).options[0];
      await t.answer(chores, openList(t).ref, [0]);
      return label;
    };
    expect(await who(SUN)).toBe("Bins (Kiran)");
    expect(await who(MON)).toBe("Bins (Asha)");
    expect(await who(TUE)).toBe("Bins (Ravi)");
    expect(await who("2026-11-18")).toBe("Bins (Ravi)");
    await t.message(chores, "swap bins Ravi with Meera");
    await t.message(chores, "swap dishes with Asha");
    expect(last(t)).toBe(copy.notInRota({ name: "Ravi", job: "Dishes" }));
  });

  it("joins a WhatsApp name to the name in the rota, and takes 'I'm Ravi' when they differ", async () => {
    const t = home({ hour: 7 });
    await t.message(chores, "bins daily, Ravi Asha Kiran");
    await t.message(chores, "dishes daily");
    await morning(t, SUN);
    // "Kiran Rao" is the Kiran of the rota. "KK" is nobody yet.
    await t.answer(chores, openList(t).ref, [1], "Kiran Rao");
    expect(people(t).find((p) => p.name === "Kiran")!.sender).toBe("kiran-rao");
    await t.answer(chores, openList(t).ref, [0], "AK");
    expect(people(t).map((p) => p.name)).toEqual(["Ravi", "Asha", "Kiran", "AK"]);
    await t.message(chores, "I'm Asha", null, null, "AK");
    expect(t.reactions.at(-1)).toBe("👍");
    expect(people(t).map((p) => p.name)).toEqual(["Ravi", "Asha", "Kiran"]);
    expect(done(t).find((d) => d.name === "Bins")!.who).toBe("Asha");
    await t.message(chores, "I'm Asha", null, null, "Someone Else");
    expect(last(t)).toBe(copy.nameTaken({ name: "Asha" }));
  });

  it("counts nothing for a child, and only the person who added the app can say who is one", async () => {
    const t = home({ hour: 7 });
    await t.message(chores, "bins daily, Ravi Mia");
    await t.message(chores, "dishes daily, Mia Ravi");
    await t.message(chores, "Mia is a child", null, null, "Asha");
    expect(last(t)).toBe(copy.ownerOnly({ owner: "Ravi" }));
    await t.message(chores, "Mia is a child");
    await morning(t, SUN);
    await t.answer(chores, openList(t).ref, [0, 1], "Mia");
    expect(done(t).map((d) => d.by)).toEqual([null, null]);
    await t.message(chores, "who did what");
    expect(last(t)).toBe("*Who did what, November*\n\n2 jobs in all.");
    // The turn still moves on.
    expect(job(t, "Dishes").at).toBe(1);
  });

  it("removes a person from the home and from every rota", async () => {
    const t = home();
    await t.message(chores, "bins daily, Ravi Asha Kiran");
    await t.message(chores, "remove Asha");
    expect(people(t).map((p) => p.name)).toEqual(["Ravi", "Kiran"]);
    expect(job(t, "Bins").rota).toHaveLength(2);
  });
});

describe("the count", () => {
  it("shows who did how many this month, only when asked", async () => {
    const t = home({ hour: 7 });
    await t.message(chores, "bins daily, Ravi Asha");
    await t.message(chores, "dishes daily, Ravi Asha");
    await t.message(chores, "who did what");
    expect(last(t)).toBe("Nothing was ticked in November.");
    await morning(t, SUN);
    await t.answer(chores, openList(t).ref, [0, 1], "Asha");
    await morning(t, MON);
    await t.answer(chores, openList(t).ref, [0]);
    await t.message(chores, "who did what this month?");
    expect(last(t)).toBe("*Who did what, November*\n\nAsha 2\nRavi 1\n\n3 jobs in all.");
    await t.message(chores, "who did what last month");
    expect(last(t)).toBe("Nothing was ticked in October.");
  });
});

describe("settings", () => {
  it("changes the hour, for the person who added the app", async () => {
    const t = home();
    await t.message(chores, "bins daily");
    await t.message(chores, "dishes daily");
    await t.message(chores, "list at 7am", null, null, "Asha");
    expect(last(t)).toBe(copy.ownerOnly({ owner: "Ravi" }));
    await t.message(chores, "list at 7am");
    expect(last(t)).toBe("I'll send the day's list at 7am.");
    t.setToday(MON);
    t.setHour(7);
    await t.schedule(chores, "day");
    expect(t.asked).toHaveLength(1);
    await t.message(chores, "list at teatime");
    expect(last(t)).toBe(copy.hourHow());
    await t.message(chores, "turns");
    expect(last(t)).toBe(copy.turnsNow({ turns: "move" }));
  });
});

describe("ideas", () => {
  it("adds each job that is ticked, and takes it back when unticked", async () => {
    const t = home();
    await t.message(chores, "ideas");
    const q = t.asked[0];
    expect(q.options).toHaveLength(IDEA_JOBS.length);
    expect(q.options[0]).toBe("Bins, every day");
    expect(q.options.at(-1)).toBe("Water filter, every 90 days");
    await t.answer(chores, q.ref, [0, 5, 8]);
    expect(jobs(t).map((j) => j.name).sort()).toEqual(["Bins", "Book the gas", "Water filter"]);
    expect(job(t, "Water filter").rhythm).toEqual({ kind: "every", n: 90, from: SUN });
    await t.message(chores, "bins rota Ravi Asha");
    // Bins has a rota now, so unticking leaves it. The gas goes.
    await t.answer(chores, q.ref, [8]);
    expect(jobs(t).map((j) => j.name).sort()).toEqual(["Bins", "Water filter"]);
  });
});

describe("a group the home already had", () => {
  it("keeps that home apart, sends its list there, and stays out of the talk", async () => {
    const t = home({ hour: 7 });
    await t.message(chores, "plants daily");
    await t.group(chores, "joined", "x-flat", "Flat 4B");
    expect(t.sent.at(-1)).toMatchObject({ group: "x-flat", text: copy.joinedGroup() });
    await t.message(chores, "bins every day, Ravi Asha", null, "x-flat", "Asha");
    await t.message(chores, "dishes every day, Asha Ravi", null, "x-flat");
    await t.message(chores, "jobs", null, "x-flat");
    expect(last(t)).not.toContain("Plants");

    // People talk in such a group.
    const before = t.sent.length;
    await t.message(chores, "who is coming for dinner", null, "x-flat", "Asha");
    await t.message(chores, "I'm tired", null, "x-flat", "Asha");
    await t.message(chores, "ok done", null, "x-flat", "Asha");
    expect(t.sent).toHaveLength(before);
    expect(t.unsures).toEqual([]);
    // Unless the message names a job.
    await t.message(chores, "ugh the bins again", null, "x-flat", "Asha");
    expect(t.unsures).toEqual([copy.unsure()]);

    // The group's first job was due that day, so its line to react to was that day's list.
    await morning(t, SUN);
    expect(t.asked).toHaveLength(0);
    expect(t.sent.at(-1)).toMatchObject({ group: null });
    expect(t.sent.at(-1)!.text).toContain("*Plants*");
    await morning(t, MON);
    expect(openList(t)).toMatchObject({ group: "x-flat", options: ["Bins (Ravi)", "Dishes (Asha)"] });

    await t.group(chores, "left", "x-flat", "Flat 4B");
    const asked = t.asked.length;
    await morning(t, TUE);
    expect(t.asked).toHaveLength(asked);
  });

  it("answers what it can't read when the person is alone with it", async () => {
    const t = home();
    await t.message(chores, "what is all this");
    expect(t.unsures).toEqual([copy.unsure()]);
    expect(t.sent).toEqual([]);
  });
});

describe("unclear messages", () => {
  it("handles each intent", async () => {
    const t = home({ hour: 7 });
    await t.intent(chores, "can you add taking the bins out every day, Ravi Asha", "add_job");
    expect(job(t, "Taking the bins out")).toBeTruthy();
    await t.message(chores, "rename taking the bins out to bins");
    await t.intent(chores, "we should do bins only on weekdays", "add_job");
    expect(job(t, "Bins").rhythm).toEqual({ kind: "weekdays", days: [1, 2, 3, 4, 5] });
    await t.intent(chores, "add something", "add_job");
    expect(last(t)).toBe(copy.addHow());
    await t.message(chores, "bins daily");
    const target = (await t.targets(chores)) as Record<string, string>;
    const key = Object.keys(target)[0];
    expect(target[key]).toBe("Bins");

    await t.intent(chores, "whose go is it", "whose_turn");
    expect(last(t)).toBe(copy.whichJob());
    await t.intent(chores, "whose go is it", "whose_turn", key);
    expect(last(t)).toBe("*Bins*: Ravi, today.");
    await t.intent(chores, "I took the bins out", "done", null, 1, "Asha");
    expect(done(t)[0].who).toBe("Asha");
    await t.intent(chores, "oops I didn't do the bins", "undo", key, 1, "Asha");
    expect(done(t)).toEqual([]);
    await t.intent(chores, "what do we have today", "today");
    expect(last(t)).toBe("*Today*\n\n☐ Bins (Ravi)");
    await t.intent(chores, "show me everything", "list_jobs");
    expect(last(t)).toContain("*Jobs*");
    await t.intent(chores, "who is doing the most", "count");
    expect(last(t)).toBe("Nothing was ticked in November.");
    await t.intent(chores, "asha is travelling until friday", "away");
    expect(last(t)).toBe("Asha is away until Fri 20 Nov. I skip Asha in every rota till then.");
    await t.intent(chores, "asha has returned", "back");
    expect(people(t).find((p) => p.name === "Asha")!.back).toBeNull();
    await t.intent(chores, "we don't need bins any more", "remove_job");
    expect(jobs(t)).toEqual([]);
  });
});

describe("the page", () => {
  type Page = { today: string; month: string; homes: { key: string | null; name: string | null; hour: number; turns: string; weekly: boolean; today: { id: string; name: string; who: string | null; done?: { by: string | null } }[]; week: { day: string; jobs: { name: string; who: string | null }[] }[]; jobs: { id: string; name: string; rota: { id: string; name: string }[]; next: string | null; nextDay: string | null }[]; people: { id: string; name: string; away: boolean; back: string | null; child: boolean; linked: boolean }[]; count: { month: string; rows: { name: string; n: number }[]; total: number }; since: string | null }[] };
  const load = async (t: T, args: Record<string, Json> = {}) => (await t.load(chores, args)) as unknown as Page;

  it("shows a home before anything is kept", async () => {
    const t = home();
    const p = await load(t);
    expect(p.homes).toEqual([{ key: null, name: null, hour: 8, turns: "move", weekly: false, today: [], week: expect.any(Array), jobs: [], people: [], count: { month: "2026-11", rows: [], total: 0 }, since: null }]);
    expect(p.homes[0].week).toHaveLength(6);
  });

  it("shows today, the week ahead with whose turn, the people and the count", async () => {
    const t = home({ hour: 7 });
    await t.message(chores, "bins daily, Ravi Asha Kiran");
    await t.message(chores, "bathroom every wednesday, Asha Ravi");
    await t.message(chores, "Kiran away till the 18th");
    await t.group(chores, "joined", "x-flat", "Flat 4B");
    const p = await load(t);
    expect(p.homes.map((h) => h.key)).toEqual([null, "x-flat"]);
    const h = p.homes[0];
    expect(h.today).toEqual([{ id: expect.any(String), name: "Bins", who: "Ravi" }]);
    // Kiran is skipped while away, and is back in the rota on the 18th.
    expect(h.week.map((d) => d.jobs.map((j) => `${j.name}:${j.who}`).join(","))).toEqual(["Bins:Asha", "Bins:Ravi", "Bins:Asha,Bathroom:Asha", "Bins:Kiran", "Bins:Ravi", "Bins:Asha"]);
    expect(h.people.find((x) => x.name === "Kiran")).toMatchObject({ away: true, back: "2026-11-18", linked: false });
    expect(h.jobs[1]).toMatchObject({ name: "Bathroom", next: "Asha", nextDay: "2026-11-18" });

    await t.act(chores, "tick", { home: null, id: h.today[0].id });
    const after = (await load(t)).homes[0];
    expect(after.today).toEqual([{ id: h.today[0].id, name: "Bins", who: null, done: { by: "Ravi" } }]);
    expect(after.count).toEqual({ month: "2026-11", rows: [{ name: "Ravi", n: 1 }], total: 1 });
    expect(after.since).toBe("2026-11");
    await expect(t.act(chores, "tick", { home: null, id: h.today[0].id })).rejects.toThrow("already ticked");
    await t.act(chores, "untick", { home: null, id: h.today[0].id });
    expect((await load(t)).homes[0].count.total).toBe(0);
    await expect(t.act(chores, "untick", { home: null, id: h.today[0].id })).rejects.toThrow("Only the person who ticked");
    expect((await load(t, { month: "2026-10" })).homes[0].count.month).toBe("2026-10");
  });

  it("adds, changes and removes jobs and people", async () => {
    const t = home();
    const { id } = (await t.act(chores, "addJob", { home: null, name: "bins", rhythm: { kind: "daily" }, rota: ["Ravi", "asha"] })) as { id: string };
    expect(job(t, "Bins").rota).toHaveLength(2);
    await expect(t.act(chores, "addJob", { home: null, name: "Bins", rhythm: { kind: "daily" }, rota: [] })).rejects.toThrow("already a job");
    await expect(t.act(chores, "addJob", { home: null, name: "", rhythm: { kind: "daily" }, rota: [] })).rejects.toThrow("short name");
    await expect(t.act(chores, "addJob", { home: null, name: "x", rhythm: { kind: "sometimes" }, rota: [] })).rejects.toThrow("how often");
    await expect(t.act(chores, "addJob", { home: null, name: "y", rhythm: { kind: "daily" }, rota: ["r2d2"] })).rejects.toThrow("letters only");
    await expect(t.act(chores, "addJob", { home: "x-nope", name: "y", rhythm: { kind: "daily" }, rota: [] })).rejects.toThrow("isn't kept by Chores");

    await t.act(chores, "setJob", { home: null, id, name: "Trash", rhythm: { kind: "weekdays", days: [6, 0, 0] }, rota: ["Asha", "Kiran", "Ravi"] });
    expect(job(t, "Trash")).toMatchObject({ rhythm: { kind: "weekdays", days: [0, 6] }, at: 2 });
    await expect(t.act(chores, "setJob", { home: null, id: "nope", name: "Z" })).rejects.toThrow("isn't kept any more");

    const asha = people(t).find((p) => p.name === "Asha")!.id;
    await t.act(chores, "setAway", { home: null, id: asha, back: "open" });
    await expect(t.act(chores, "setAway", { home: null, id: asha, back: SUN })).rejects.toThrow("after today");
    await t.act(chores, "setChild", { home: null, id: asha, child: true });
    expect(people(t).find((p) => p.id === asha)).toMatchObject({ back: "open", child: true });
    await t.act(chores, "setAway", { home: null, id: asha, back: null });
    await t.act(chores, "setChild", { home: null, id: asha, child: false });
    expect(people(t).find((p) => p.id === asha)).toMatchObject({ name: "Asha", sender: null, back: null });
    expect(people(t).find((p) => p.id === asha)!.child).toBeUndefined();

    const added = (await t.act(chores, "addPerson", { home: null, name: "meera" })) as { id: string };
    await expect(t.act(chores, "addPerson", { home: null, name: "Meera" })).rejects.toThrow("already in this home");
    await t.act(chores, "removePerson", { home: null, id: added.id });
    await t.act(chores, "removePerson", { home: null, id: asha });
    expect(job(t, "Trash").rota).toHaveLength(2);
    await expect(t.act(chores, "removePerson", { home: null, id: asha })).rejects.toThrow("isn't in this home");

    const gas = (await t.act(chores, "addJob", { home: null, name: "Gas", rhythm: { kind: "asked" }, rota: [] })) as { id: string };
    await t.act(chores, "need", { home: null, id: gas.id });
    expect(job(t, "Gas").open).toBe(SUN);
    await t.act(chores, "removeJob", { home: null, id });
    expect(jobs(t).map((j) => j.name)).toEqual(["Gas"]);
  });

  it("changes the settings, and says a new rule for turns in the group", async () => {
    const t = home();
    await t.act(chores, "setHour", { home: null, hour: 6 });
    await expect(t.act(chores, "setHour", { home: null, hour: 24 })).rejects.toThrow("Pick an hour");
    await t.act(chores, "setWeekly", { home: null, on: true });
    await t.act(chores, "setTurns", { home: null, turns: "stay" });
    expect(t.sent).toEqual([expect.objectContaining({ text: copy.turnsChanged({ turns: "stay" }) })]);
    await t.act(chores, "setTurns", { home: null, turns: "stay" });
    expect(t.sent).toHaveLength(1);
    await expect(t.act(chores, "setTurns", { home: null, turns: "never" })).rejects.toThrow("one of the two");
    expect((await load(t)).homes[0]).toMatchObject({ hour: 6, weekly: true, turns: "stay" });
  });
});

describe("what it says about itself", () => {
  it("has a welcome that asks nothing, and help", async () => {
    const t = home();
    expect(chores.welcome).not.toContain("?");
    await t.message(chores, "help");
    expect(last(t)).toBe(chores.help);
  });
});
