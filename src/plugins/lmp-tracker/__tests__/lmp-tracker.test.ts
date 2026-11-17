import { describe, expect, it } from "vitest";
import lmp from "..";
import { createTestKit } from "../../../testing";

// 2026-11-16 is a Monday.
const T = (o = {}) => createTestKit({ today: "2026-11-16", hour: 9, ...o });
type Kit = ReturnType<typeof T>;
const lmps = (t: Kit) => Object.keys(t.dump()).filter((k) => k.startsWith("periods/")).map((k) => k.slice(8)).sort();
const last = (t: Kit) => t.sent.at(-1)!.text;
const pregnant = (t: Kit) => t.dump()["pregnancy/current"];

describe("sending an LMP", () => {
  it("the first LMP is confirmed in words; after that a clear LMP only gets a 👍", async () => {
    const t = T({ today: "2026-10-19" });
    await t.message(lmp, "LMP oct 12");
    expect(lmps(t)).toEqual(["2026-10-12"]);
    // The confirmation, then (once) the question about the 🩸.
    expect(t.sent.map((s) => s.text)).toEqual([
      "🩸 Got it: your period started *Mon 12 Oct*. From next time you'll just get a 👍.",
      "Are you OK seeing 🩸 in my messages? Reply _no_ and I'll use 🌙 instead. If you don't reply, I'll keep it.",
    ]);
    expect(t.reactions).toEqual([]);
    t.setToday("2026-11-09");
    await t.message(lmp, "LMP today");
    t.setToday("2026-12-08");
    await t.message(lmp, "lmp 7 dec");
    expect(lmps(t)).toEqual(["2026-10-12", "2026-11-09", "2026-12-07"]);
    expect(t.reactions).toEqual(["👍", "👍"]);
    expect(t.sent).toHaveLength(2);
  });

  it("no date means the day of the message", async () => {
    for (const text of ["lmp", "LMP", "today", "now", "lmp now", "periods came", "came", "period", "got my period", "Period started", "it's here"]) {
      const t = T();
      await t.message(lmp, text);
      expect(lmps(t), text).toEqual(["2026-11-16"]);
    }
  });

  it("a date on its own, or after the word period, is the day it started", async () => {
    for (const [text, day] of [["yesterday", "2026-11-15"], ["9 nov", "2026-11-09"], ["3 days ago", "2026-11-13"], ["period 9 nov", "2026-11-09"], ["periods yesterday", "2026-11-15"]] as const) {
      const t = T();
      await t.message(lmp, text);
      expect(lmps(t), text).toEqual([day]);
    }
    // Things that aren't dates still go to the intent model.
    const t = T();
    await t.message(lmp, "what is this");
    expect(lmps(t)).toEqual([]);
    expect(t.unsures).toHaveLength(1);
  });

  it("says so when a date changes an LMP already recorded", async () => {
    const t = T();
    await t.message(lmp, "lmp 9 nov");
    await t.message(lmp, "lmp"); // a week later: the same period, moved
    expect(lmps(t)).toEqual(["2026-11-16"]);
    expect(last(t)).toBe("🩸 Changed: your last period started *Mon 16 Nov* (it was Mon 9 Nov).");
    await t.message(lmp, "lmp today"); // the same date again: nothing to say
    expect(t.sent).toHaveLength(3);
  });

  it("reads the ways people write it", async () => {
    const cases: [string, string][] = [
      ["lmp 9/11", "2026-11-09"],
      ["LMP: 9th Nov", "2026-11-09"],
      ["my lmp was on 9 nov", "2026-11-09"],
      ["lmp yesterday", "2026-11-15"],
      ["Period started today", "2026-11-16"],
      ["periods came 2 days ago", "2026-11-14"],
      ["came yesterday", "2026-11-15"],
      ["it came on 4th", "2026-11-04"],
      ["started on the 20th", "2026-10-20"],
    ];
    for (const [text, day] of cases) {
      const t = T();
      await t.message(lmp, text);
      expect(lmps(t), text).toEqual([day]);
    }
  });

  it("refuses future dates and unreadable ones, in words", async () => {
    const t = T();
    await t.message(lmp, "lmp 2026-12-01");
    await t.message(lmp, "lmp blorp");
    expect(t.sent.map((s) => s.text)).toEqual([expect.stringContaining("future"), expect.stringContaining("couldn't read")]);
    expect(lmps(t)).toEqual([]);
  });

  it("an older date is kept in the history but the LMP stays the latest", async () => {
    const t = T();
    await t.message(lmp, "lmp 9 nov");
    await t.message(lmp, "lmp 12 oct");
    expect(lmps(t)).toEqual(["2026-10-12", "2026-11-09"]);
    expect(last(t)).toBe("🩸 Recorded *Mon 12 Oct*. Your latest period is still the one that started Mon 9 Nov.");
  });

  it("doesn't want the end of a period", async () => {
    const t = T();
    await t.message(lmp, "period ended");
    expect(last(t)).toContain("only need the day your period starts");
  });
});

describe("asking for the last LMP", () => {
  it("answers in many phrasings without changing anything", async () => {
    for (const q of ["when was my last lmp?", "last lmp", "LMP?", "my lmp", "what is my LMP", "When did my periods start?", "status"]) {
      const t = T();
      await t.message(lmp, "lmp 9 nov");
      await t.message(lmp, q);
      expect(last(t), q).toBe("🩸 Your last period started *Mon 9 Nov* (7 days ago).\nNext one is due around *Mon 7 Dec* (4 weeks).");
      expect(lmps(t), q).toEqual(["2026-11-09"]);
    }
  });

  it("says when there's none, and when the next one was due", async () => {
    const t = T();
    await t.message(lmp, "last lmp");
    expect(last(t)).toContain("I don't have a period date from you yet");
    await t.message(lmp, "lmp 1 oct");
    await t.message(lmp, "last lmp");
    expect(last(t)).toContain("Next one was due around *Thu 29 Oct*");
  });
});

describe("reminders at 4, 5 and 6 weeks", () => {
  it("reminds when due, a week later, then suggests a test, each once, then stays quiet", async () => {
    const t = T({ today: "2026-10-19" });
    await t.message(lmp, "lmp today");
    const base = t.sent.length;
    t.setToday("2026-11-15"); // day 27
    await t.schedule(lmp, "daily");
    expect(t.sent).toHaveLength(base);

    t.setToday("2026-11-16"); // 4 weeks
    await t.schedule(lmp, "daily");
    await t.schedule(lmp, "daily");
    expect(t.sent).toHaveLength(base + 1);
    expect(last(t)).toContain("Your period is due around now. Your last one started *Mon 19 Oct*, 4 weeks ago.");

    t.setToday("2026-11-20");
    await t.schedule(lmp, "daily");
    expect(t.sent).toHaveLength(base + 1);

    t.setToday("2026-11-23"); // 5 weeks
    await t.schedule(lmp, "daily");
    expect(last(t)).toContain("Has your period come? It's been 5 weeks");

    t.setToday("2026-11-30"); // 6 weeks
    await t.schedule(lmp, "daily");
    expect(last(t)).toContain("It's been 6 weeks since your last period (*Mon 19 Oct*). You might be pregnant.");
    expect(last(t)).toContain("home pregnancy test");

    t.setToday("2026-12-07");
    await t.schedule(lmp, "daily");
    t.setToday("2027-01-15");
    await t.schedule(lmp, "daily");
    expect(t.sent).toHaveLength(base + 3);
  });

  it("the happy case: she sends the next LMP and the reminders start over from it", async () => {
    const t = T({ today: "2026-11-16" });
    await t.message(lmp, "lmp 19 oct");
    await t.schedule(lmp, "daily"); // "due" for 19 Oct
    await t.message(lmp, "lmp today");
    const n = t.sent.length;
    t.setToday("2026-11-23");
    await t.schedule(lmp, "daily");
    expect(t.sent).toHaveLength(n);
    t.setToday("2026-12-14"); // 4 weeks after 16 Nov
    await t.schedule(lmp, "daily");
    expect(last(t)).toContain("Your last one started *Mon 16 Nov*, 4 weeks ago");
  });

  it("a plain yes after a reminder means it started today, quoted or not", async () => {
    const quoted = T({ today: "2026-11-16" });
    await quoted.message(lmp, "lmp 19 oct");
    await quoted.schedule(lmp, "daily");
    await quoted.message(lmp, "yes", quoted.sent.at(-1)!.ref);
    expect(lmps(quoted)).toEqual(["2026-10-19", "2026-11-16"]);

    const typed = T({ today: "2026-11-16" });
    await typed.message(lmp, "lmp 19 oct");
    await typed.schedule(lmp, "daily");
    await typed.message(lmp, "Yes");
    expect(lmps(typed)).toEqual(["2026-10-19", "2026-11-16"]);
    expect(typed.reactions.at(-1)).toBe("👍");

    const notYet = T({ today: "2026-11-16" });
    await notYet.message(lmp, "lmp 19 oct");
    await notYet.schedule(lmp, "daily");
    await notYet.message(lmp, "not yet");
    expect(lmps(notYet)).toEqual(["2026-10-19"]);
    expect(last(notYet)).toContain("OK. Send _period_ when your period starts");
  });

  it("a yes with no reminder waiting isn't guessed at", async () => {
    const t = T();
    await t.message(lmp, "lmp 9 nov");
    t.setToday("2026-11-25"); // nothing is waiting for an answer
    await t.message(lmp, "yes");
    expect(lmps(t)).toEqual(["2026-11-09"]);
    expect(t.unsures).toHaveLength(1);
  });

  it("a date in the answer, or ✅ on the reminder, logs it too", async () => {
    const r = T({ today: "2026-11-23" });
    await r.message(lmp, "lmp 19 oct");
    await r.schedule(lmp, "daily");
    await r.message(lmp, "started 2 days ago", r.sent.at(-1)!.ref);
    expect(lmps(r)).toEqual(["2026-10-19", "2026-11-21"]);

    const e = T({ today: "2026-11-16" });
    await e.message(lmp, "lmp 19 oct");
    await e.schedule(lmp, "daily");
    await e.react(lmp, "✅", e.sent.at(-1)!.ref);
    expect(lmps(e)).toEqual(["2026-10-19", "2026-11-16"]);
    await e.react(lmp, null, e.sent.at(-1)!.ref);
    expect(lmps(e)).toEqual(["2026-10-19"]);
    await e.react(lmp, "✅", { other: true });
    expect(lmps(e)).toEqual(["2026-10-19"]);
  });

  it("reminders off stays quiet; reminder time changes the hour", async () => {
    const t = T({ today: "2026-11-16" });
    await t.message(lmp, "lmp 19 oct");
    await t.message(lmp, "reminders off");
    const n = t.sent.length;
    await t.schedule(lmp, "daily");
    expect(t.sent).toHaveLength(n);
    await t.message(lmp, "reminder time 8pm");
    expect(t.kit.settings.reminderHour).toBe(20);
  });

  it("still answers replies to 1.x and 2.x reminders", async () => {
    for (const kind of ["period-check", "period-soon", "period-late"]) {
      const t = T();
      await t.message(lmp, "lmp 19 oct");
      await t.message(lmp, "yes", { kind, date: "2026-11-15" });
      expect(lmps(t), kind).toEqual(["2026-10-19", "2026-11-16"]);
    }
  });
});

describe("learning her cycle", () => {
  it("one late month doesn't move the reminders", async () => {
    const t = T({ today: "2026-10-19" });
    await t.message(lmp, "lmp 14 sep");
    await t.message(lmp, "lmp today"); // 35 days after
    await t.message(lmp, "last lmp");
    expect(last(t)).toContain("Next one is due around *Mon 16 Nov* (4 weeks)");
  });

  it("periods that keep coming at 5 weeks get reminded at 5, 6 and 7 weeks", async () => {
    const t = T({ today: "2026-10-19" });
    for (const d of ["2026-08-10", "2026-09-14"]) await t.message(lmp, `lmp ${d}`);
    await t.message(lmp, "lmp today"); // the second 35-day cycle in a row
    await t.message(lmp, "last lmp");
    expect(last(t)).toContain("Next one is due around *Mon 23 Nov* (your periods come about every 35 days)");
    const reminders = () => t.sent.filter((s) => /lmp-(due|upt)/.test(JSON.stringify(s.ref))).length;
    t.setToday("2026-11-16"); // 4 weeks: too early for her
    await t.schedule(lmp, "daily");
    expect(reminders()).toBe(0);
    t.setToday("2026-11-23"); // 5 weeks
    await t.schedule(lmp, "daily");
    expect(last(t)).toContain("Your period is due around now. Your last one started *Mon 19 Oct*, 5 weeks ago.");
    t.setToday("2026-11-30"); // 6 weeks
    await t.schedule(lmp, "daily");
    expect(last(t)).toContain("Has your period come? It's been 6 weeks");
    t.setToday("2026-12-07"); // 7 weeks: the test nudge
    await t.schedule(lmp, "daily");
    expect(last(t)).toContain("It's been 7 weeks since your last period");
    expect(reminders()).toBe(3);
  });

  it("one odd month among regular ones is ignored, and so is a month she didn't send", async () => {
    const t = T({ today: "2026-11-16" });
    // 28, 28, 40, then a 57-day gap (a month not sent).
    for (const d of ["2026-04-01", "2026-04-29", "2026-05-27", "2026-07-06", "2026-09-01"]) await t.message(lmp, `lmp ${d}`);
    await t.message(lmp, "history");
    expect(last(t)).toContain("Your periods usually come about every 28 days.");
  });

  it("the test nudge waits a week past her longest recent cycle", async () => {
    const t = T({ today: "2026-07-06" });
    for (const d of ["2026-04-01", "2026-04-29", "2026-05-27"]) await t.message(lmp, `lmp ${d}`);
    await t.message(lmp, "lmp today"); // a 40-day cycle; usual is still 28
    t.setToday("2026-08-17"); // 6 weeks: she has gone 40 days before, so not yet
    await t.schedule(lmp, "daily");
    expect(last(t)).toContain("Has your period come?");
    t.setToday("2026-08-22"); // 47 days
    await t.schedule(lmp, "daily");
    expect(last(t)).toContain("You might be pregnant");
  });
});

describe("pregnancy mode", () => {
  it("the whole story: LMP, no period, yes I'm pregnant, then an LMP 11 months later", async () => {
    const t = T({ today: "2026-10-03" });
    await t.message(lmp, "LMP today");

    t.setToday("2026-11-14"); // 6 weeks
    await t.schedule(lmp, "daily");
    expect(last(t)).toContain("You might be pregnant");
    await t.message(lmp, "yes"); // typed, not quoted
    expect(pregnant(t)).toEqual({ since: "2026-11-14" });
    expect(last(t)).toContain("Noted. I've stopped the period reminders.");
    expect(last(t)).toContain("Your last period started *Sat 3 Oct*. You're about *6 weeks* along, due around *Sat 10 Jul 2027*.");
    // The LMP is the same LMP.
    expect(lmps(t)).toEqual(["2026-10-03"]);

    // Quiet through the pregnancy; the LMP is still there when asked.
    const n = t.sent.length;
    for (const day of ["2026-11-21", "2026-12-12", "2027-03-01", "2027-07-10"]) {
      t.setToday(day);
      await t.schedule(lmp, "daily");
    }
    expect(t.sent).toHaveLength(n);
    t.setToday("2026-12-12");
    await t.message(lmp, "when was my last lmp?");
    expect(last(t)).toBe("🩸 Your last period started *Sat 3 Oct* (70 days ago).\nYou're about *10 weeks* along, due around *Sat 10 Jul 2027*.");

    // 11 months later her periods are back: pregnancy is forgotten, tracking carries on.
    t.setToday("2027-09-06");
    await t.message(lmp, "LMP today");
    expect(pregnant(t)).toBeUndefined();
    expect(lmps(t)).toEqual(["2026-10-03", "2027-09-06"]);
    expect(last(t)).toContain("Got it: your period started *Mon 6 Sep*. I've turned pregnancy mode off");
    t.setToday("2027-10-04");
    await t.schedule(lmp, "daily");
    expect(last(t)).toContain("Your period is due around now. Your last one started *Mon 6 Sep*, 4 weeks ago.");
  });

  it("a bare lmp in pregnancy mode is ambiguous, so it asks: see it (1) keeps her pregnant", async () => {
    const t = T();
    await t.message(lmp, "lmp 3 oct");
    await t.message(lmp, "pregnant");
    t.setToday("2026-12-20");
    await t.message(lmp, "lmp");
    expect(last(t)).toBe("🩸 Do you want to see your last period, or record a new one?\n\nReply _1_ to see your last period\nReply _2_ to record today as the start of a new one");
    expect(t.sent.at(-1)!.ref).toEqual({ kind: "lmp-ask", date: "2026-12-20" });
    expect(lmps(t)).toEqual(["2026-10-03"]);
    await t.message(lmp, "1");
    expect(last(t)).toContain("Your last period started *Sat 3 Oct*");
    expect(pregnant(t)).toEqual({ since: "2026-11-16" });
    // The question is closed: a later "2" means nothing.
    await t.message(lmp, "2");
    expect(lmps(t)).toEqual(["2026-10-03"]);
  });

  it("record (2) after a miscarriage or abortion: the day she wrote becomes her LMP and tracking carries on", async () => {
    const t = T();
    await t.message(lmp, "lmp 3 oct");
    await t.message(lmp, "pregnant");
    t.setToday("2026-12-20");
    await t.message(lmp, "LMP");
    t.setToday("2026-12-21"); // she answers the next day; the LMP is the day she first wrote
    await t.message(lmp, "2");
    expect(lmps(t)).toEqual(["2026-10-03", "2026-12-20"]);
    expect(pregnant(t)).toBeUndefined();
    expect(last(t)).toContain("Got it: your period started *Sun 20 Dec*. I've turned pregnancy mode off");
    t.setToday("2027-01-17"); // 4 weeks later
    await t.schedule(lmp, "daily");
    expect(last(t)).toContain("Your period is due around now. Your last one started *Sun 20 Dec 2026*, 4 weeks ago.");
  });

  it("the question also takes a quoted answer, ignores reactions and other words, and expires", async () => {
    const t = T();
    await t.message(lmp, "lmp 3 oct");
    await t.message(lmp, "pregnant");
    t.setToday("2026-12-20");
    await t.message(lmp, "today");
    const ref = t.sent.at(-1)!.ref;
    await t.react(lmp, "👍", ref);
    await t.message(lmp, "yes", ref);
    expect(lmps(t)).toEqual(["2026-10-03"]);
    t.setToday("2026-12-30"); // too late for a plain answer...
    await t.message(lmp, "2");
    expect(lmps(t)).toEqual(["2026-10-03"]);
    await t.message(lmp, "record", ref); // ...but a quoted one still works
    expect(lmps(t)).toEqual(["2026-10-03", "2026-12-20"]);
    expect(pregnant(t)).toBeUndefined();
  });

  it("an LMP said outright in pregnancy mode is recorded without asking", async () => {
    for (const text of ["lmp today", "periods came", "got my period yesterday", "LMP 18 dec"]) {
      const t = T();
      await t.message(lmp, "lmp 3 oct");
      await t.message(lmp, "pregnant");
      t.setToday("2026-12-20");
      await t.message(lmp, text);
      expect(pregnant(t), text).toBeUndefined();
      expect(lmps(t), text).toHaveLength(2);
    }
  });

  it("she can say it any time, in her own words, once we have her LMP", async () => {
    const t = T();
    await t.message(lmp, "I'm pregnant");
    expect(pregnant(t)).toBeUndefined();
    expect(last(t)).toContain("I don't have a period date from you yet");
    await t.message(lmp, "lmp 3 oct");
    await t.message(lmp, "I'm pregnant");
    expect(pregnant(t)).toEqual({ since: "2026-11-16" });
    expect(last(t)).toContain("about *6 weeks 2 days* along");
  });

  it("there is no 'pregnant lmp <date>' or 'due date' command", async () => {
    const t = T();
    await t.message(lmp, "pregnant lmp 3 oct");
    await t.message(lmp, "due date 10 jul");
    expect(t.unsures).toHaveLength(2);
    expect(pregnant(t)).toBeUndefined();
    expect(lmps(t)).toEqual([]);
  });

  it("no to the test nudge just says OK", async () => {
    const t = T({ today: "2026-11-30" });
    await t.message(lmp, "lmp 19 oct");
    await t.schedule(lmp, "daily");
    expect(t.sent.at(-1)!.ref).toEqual({ kind: "lmp-upt", date: "2026-10-19" });
    await t.message(lmp, "negative");
    expect(pregnant(t)).toBeUndefined();
    expect(last(t)).toContain("OK. Send _period_ when your period starts");
    // ✅ on the test nudge doesn't log a period.
    await t.react(lmp, "✅", t.sent.at(-2)!.ref);
    expect(lmps(t)).toEqual(["2026-10-19"]);
  });

  it("fixing the LMP by a few days keeps her pregnant; not pregnant brings reminders back", async () => {
    const t = T();
    await t.message(lmp, "lmp 3 oct");
    await t.message(lmp, "pregnant");
    await t.message(lmp, "lmp 5 oct");
    expect(pregnant(t)).toEqual({ since: "2026-11-16" });
    expect(lmps(t)).toEqual(["2026-10-05"]);
    expect(last(t)).toBe("🩸 Changed: your last period started *Mon 5 Oct* (it was Sat 3 Oct).");
    await t.message(lmp, "not pregnant");
    expect(pregnant(t)).toBeUndefined();
    expect(lmps(t)).toEqual(["2026-10-05"]);
    await t.schedule(lmp, "daily"); // 6 weeks since 5 Oct
    expect(last(t)).toContain("You might be pregnant");
  });

  it("is forgotten on its own after 42 weeks if she never comes back", async () => {
    const t = T();
    await t.message(lmp, "lmp 3 oct");
    await t.message(lmp, "pregnant");
    t.setToday("2027-07-25"); // 295 days
    await t.schedule(lmp, "daily");
    expect(pregnant(t)).toBeUndefined();
  });

  it("upgrading from 2.x moves an LMP kept only in the pregnancy record into the LMPs, once", async () => {
    const t = T({ today: "2026-11-14" });
    await t.kit.store.put("periods", "2026-08-01", { start: "2026-08-01", end: "2026-08-05" }, "2026-08-01");
    await t.kit.store.put("pregnancy", "current", { lmp: "2026-10-03", since: "2026-11-10" });
    await lmp.onUpgrade!("2.0.0", t.kit);
    await lmp.onUpgrade!("2.0.0", t.kit);
    expect(lmps(t)).toEqual(["2026-08-01", "2026-10-03"]);
    expect(pregnant(t)).toEqual({ since: "2026-11-10" });
    await t.message(lmp, "last lmp");
    expect(last(t)).toContain("Your last period started *Sat 3 Oct*");
    expect(last(t)).toContain("about *6 weeks* along");
  });
});

describe("understanding sentences", () => {
  it("hands messages it can't read to intent understanding", async () => {
    const t = T();
    await t.message(lmp, "aaj periods aaye");
    expect(t.unsures).toHaveLength(1);
  });

  it("log_lmp reads a date from the sentence, or uses today", async () => {
    const t = T();
    await t.intent(lmp, "my periods came on 9th nov", "log_lmp");
    expect(lmps(t)).toEqual(["2026-11-09"]);
    const u = T();
    await u.intent(lmp, "aaj periods aaye", "log_lmp");
    expect(lmps(u)).toEqual(["2026-11-16"]);
  });

  it("ask_lmp, pregnant, not_pregnant and undo", async () => {
    const t = T();
    await t.message(lmp, "lmp 9 oct");
    await t.intent(lmp, "kab tha last period", "ask_lmp");
    expect(last(t)).toContain("Your last period started *Fri 9 Oct*");
    await t.intent(lmp, "test came positive today", "pregnant");
    expect(pregnant(t)).toEqual({ since: "2026-11-16" });
    expect(lmps(t)).toEqual(["2026-10-09"]);
    await t.intent(lmp, "it was a false alarm", "not_pregnant");
    expect(pregnant(t)).toBeUndefined();
    await t.intent(lmp, "oops remove that", "undo");
    expect(lmps(t)).toEqual([]);
  });
});

describe("blood or moon", () => {
  it("names the group with 🌙 and asks nothing in the welcome", () => {
    expect(lmp.groupName).toBe("🌙 Period Tracker");
    expect(lmp.welcome).not.toContain("OK");
    expect(lmp.welcome).not.toContain("🌙");
  });

  it("asks once, right after the first LMP; no switches to 🌙", async () => {
    const t = T({ today: "2026-10-19" });
    await t.message(lmp, "lmp");
    expect(t.sent.at(-1)!.ref).toEqual({ kind: "lmp-symbol", date: "2026-10-19" });
    await t.message(lmp, "No");
    expect(t.kit.settings.symbol).toBe("moon");
    expect(last(t)).toBe("🌙 Done. I'll use 🌙 from now on. Send _blood_ to switch back.");
    expect(lmps(t)).toEqual(["2026-10-19"]);
    t.setToday("2026-11-16");
    await t.schedule(lmp, "daily");
    expect(last(t)).toMatch(/^🌙 Your period is due around now/);
    // The question is closed and never asked again.
    await t.message(lmp, "lmp");
    expect(t.sent.filter((m) => m.text.includes("Are you OK seeing"))).toHaveLength(1);
  });

  it("no reply means yes: 🩸 stays, and a later no is not about the 🩸", async () => {
    const t = T({ today: "2026-10-19" });
    await t.message(lmp, "lmp");
    t.setToday("2026-11-16");
    await t.schedule(lmp, "daily");
    expect(last(t)).toMatch(/^🩸 Your period is due around now/);
    await t.message(lmp, "no"); // answers the reminder, not the old question
    expect(t.kit.settings.symbol).toBe("blood");
    expect(last(t)).toContain("OK. Send _period_");
  });

  it("ok just gets a 👍; a quoted no works any time", async () => {
    const t = T({ today: "2026-10-19" });
    await t.message(lmp, "lmp");
    const ref = t.sent.at(-1)!.ref;
    await t.message(lmp, "ok");
    expect(t.reactions.at(-1)).toBe("👍");
    expect(t.kit.settings.symbol).toBe("blood");
    t.setToday("2026-12-25");
    await t.message(lmp, "no", ref);
    expect(t.kit.settings.symbol).toBe("moon");
  });

  it("moon swaps every message to 🌙, reminders included; blood swaps back", async () => {
    const t = T({ today: "2026-10-19" });
    await t.message(lmp, "moon");
    expect(last(t)).toBe("🌙 Done. I'll use 🌙 from now on. Send _blood_ to switch back.");
    expect(t.kit.settings.symbol).toBe("moon");
    await t.message(lmp, "lmp");
    expect(last(t)).toBe("🌙 Got it: your period started *Mon 19 Oct*. From next time you'll just get a 👍.");
    expect(t.sent).toHaveLength(2); // already on 🌙: nothing to ask
    t.setToday("2026-11-16");
    await t.schedule(lmp, "daily");
    expect(last(t)).toMatch(/^🌙 Your period is due around now/);
    expect(t.sent.every((m) => !m.text.includes("🩸"))).toBe(true);
    await t.message(lmp, "blood");
    await t.message(lmp, "last lmp");
    expect(last(t)).toMatch(/^🩸 Your last period started/);
  });
});

describe("basics", () => {
  it("help, history, undo and delete", async () => {
    const t = T();
    await t.message(lmp, "help");
    expect(t.sent[0].text).toBe(lmp.help);
    await t.message(lmp, "history");
    expect(last(t)).toContain("No periods recorded yet");
    for (const d of ["2026-09-21", "2026-10-19"]) await t.message(lmp, `lmp ${d}`);
    await t.message(lmp, "history");
    expect(last(t)).toContain("Mon 21 Sep  ·  28 days to the next");
    await t.message(lmp, "undo");
    expect(lmps(t)).toEqual(["2026-09-21"]);
    await t.message(lmp, "delete lmp 21 sep");
    expect(lmps(t)).toEqual([]);
    await t.message(lmp, "undo");
    expect(last(t)).toBe("Nothing to undo.");
  });
});
