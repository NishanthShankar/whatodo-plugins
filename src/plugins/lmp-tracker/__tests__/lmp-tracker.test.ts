import { describe, expect, it } from "vitest";
import lmp from "..";
import { createTestKit } from "../../../testing";

const T = (o = {}) => createTestKit({ today: "2026-11-15", hour: 9, ...o });
const starts = (t: ReturnType<typeof T>) => Object.keys(t.dump()).filter((k) => k.startsWith("periods/")).map((k) => k.slice(8));

describe("lmp-tracker: periods", () => {
  it("logs starts in many phrasings and reacts 👍", async () => {
    const t = T();
    await t.message(lmp, "period started 21 oct");
    await t.message(lmp, "Period started today");
    await t.message(lmp, "got my period yesterday");
    expect(t.reactions).toEqual(["👍", "👍", "👍"]);
    // "yesterday" is within 10 days of today's start, so it moved that period instead of adding one.
    expect(starts(t)).toEqual(["2026-10-21", "2026-11-14"]);
  });

  it("refuses future starts and unreadable dates, in words", async () => {
    const t = T();
    await t.message(lmp, "period started 2026-12-01");
    await t.message(lmp, "period started blorp");
    expect(t.sent.map((s) => s.text)).toEqual([expect.stringContaining("future"), expect.stringContaining("couldn't read")]);
    expect(starts(t)).toEqual([]);
  });

  it("shows the cycle: next period, fertile window, averages", async () => {
    const t = T();
    await t.message(lmp, "cycle");
    expect(t.sent[0].text).toContain("No periods logged yet");
    for (const d of ["2026-08-26", "2026-09-23", "2026-10-21"]) await t.message(lmp, `period started ${d}`);
    await t.message(lmp, "period ended 25 oct");
    await t.message(lmp, "cycle");
    const text = t.sent.at(-1)!.text;
    expect(text).toContain("Next period: *Wed 18 Nov* (in 3 days)");
    expect(text).toContain("Average cycle: 28 days (from 2 cycles)");
    expect(text).toContain("Average period: 5 days");
    expect(text).toContain("not medical advice");
  });

  it("says when a period is late", async () => {
    const t = T();
    await t.message(lmp, "period started 1 oct");
    await t.message(lmp, "next");
    expect(t.sent[0].text).toContain("17 days late");
  });

  it("uses the person's cycle length until two cycles exist", async () => {
    const t = T();
    await t.message(lmp, "cycle length 32");
    await t.message(lmp, "period started 1 nov");
    await t.message(lmp, "cycle");
    expect(t.sent.at(-1)!.text).toContain("Next period: *Thu 3 Dec*");
    await t.message(lmp, "cycle length 60");
    expect(t.sent.at(-1)!.text).toContain("between 21 and 45");
  });

  it("history, undo and delete", async () => {
    const t = T();
    for (const d of ["2026-09-23", "2026-10-21"]) await t.message(lmp, `period started ${d}`);
    await t.message(lmp, "history");
    expect(t.sent.at(-1)!.text).toContain("Wed 23 Sep  ·  cycle 28 days");
    await t.message(lmp, "undo");
    expect(starts(t)).toEqual(["2026-09-23"]);
    await t.message(lmp, "delete 23 sep");
    expect(starts(t)).toEqual([]);
    await t.message(lmp, "delete 1 jan");
    expect(t.sent.at(-1)!.text).toContain("There's no period starting");
    await t.message(lmp, "undo");
    expect(t.sent.at(-1)!.text).toBe("Nothing to undo.");
  });

  it("logs an end only after a start", async () => {
    const t = T();
    await t.message(lmp, "period ended");
    expect(t.sent[0].text).toContain("don't have a period start");
  });
});

describe("lmp-tracker: reminders", () => {
  it("checks in on cycle days 27 and 28, once each, and logs a start from a reply", async () => {
    const t = T({ today: "2026-11-15" }); // 21 Oct start: 15 Nov is day 26
    await t.message(lmp, "period started 21 oct");
    await t.schedule(lmp, "daily");
    expect(t.sent).toHaveLength(0);
    t.setToday("2026-11-16"); // day 27
    await t.schedule(lmp, "daily");
    await t.schedule(lmp, "daily");
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].text).toContain("Day 27 of your cycle. Has your period started?");
    t.setToday("2026-11-17"); // day 28
    await t.schedule(lmp, "daily");
    expect(t.sent[1].text).toContain("Day 28 of your cycle. Has your period started yet?");
    await t.message(lmp, "started", t.sent[1].ref);
    expect(starts(t)).toEqual(["2026-10-21", "2026-11-17"]);
  });

  it("logs a start from ✅ on a check-in, and takes it back when removed", async () => {
    const t = T({ today: "2026-11-16" });
    await t.message(lmp, "period started 21 oct");
    await t.schedule(lmp, "daily");
    await t.react(lmp, "✅", t.sent[0].ref);
    expect(starts(t)).toEqual(["2026-10-21", "2026-11-16"]);
    await t.react(lmp, null, t.sent[0].ref);
    expect(starts(t)).toEqual(["2026-10-21"]);
    await t.react(lmp, "✅", { other: true });
    expect(starts(t)).toEqual(["2026-10-21"]);
  });

  it("follows the person's own cycle length for the check-in days", async () => {
    const t = T({ today: "2026-11-30" });
    await t.message(lmp, "cycle length 32");
    await t.message(lmp, "period started 30 oct"); // 30 Nov is day 32
    await t.schedule(lmp, "daily");
    expect(t.sent[0].text).toContain("Day 32 of your cycle");
  });

  it("still understands replies to 1.x 'may start soon' messages", async () => {
    const t = T();
    await t.message(lmp, "period started 21 oct");
    await t.message(lmp, "started", { kind: "period-soon", date: "2026-11-18" });
    expect(starts(t)).toEqual(["2026-10-21", "2026-11-15"]);
  });

  it("nudges once when 3 days late; replies can give the date", async () => {
    const t = T({ today: "2026-11-21" });
    await t.message(lmp, "period started 21 oct");
    await t.schedule(lmp, "daily");
    expect(t.sent.at(-1)!.text).toContain("Did it start?");
    await t.message(lmp, "started 2 days ago", t.sent.at(-1)!.ref);
    expect(starts(t)).toContain("2026-11-19");
  });

  it("respects reminders off, and fertile reminders only when on", async () => {
    const t = T({ today: "2026-11-16" });
    await t.message(lmp, "period started 21 oct");
    await t.message(lmp, "reminders off");
    await t.schedule(lmp, "daily");
    expect(t.sent).toHaveLength(0);
    const f = T({ today: "2026-10-13" }); // 4 Oct start, 28-day cycle: ovulation 18 Oct, window from 13 Oct
    await f.message(lmp, "period started 2026-10-04");
    await f.schedule(lmp, "daily");
    expect(f.sent).toHaveLength(0);
    await f.message(lmp, "fertile reminders on");
    await f.schedule(lmp, "daily");
    expect(f.sent[0].text).toContain("fertile window likely starts today");
  });

  it("changes the reminder time", async () => {
    const t = T();
    await t.message(lmp, "reminder time 8pm");
    expect(t.kit.settings.reminderHour).toBe(20);
  });
});

describe("lmp-tracker: pregnancy", () => {
  it("starts from an LMP and answers with weeks and due date", async () => {
    const t = T();
    await t.message(lmp, "pregnant lmp 3 oct");
    expect(t.sent[0].text).toContain("*6 weeks 1 day* pregnant: 2nd month (approx.), first trimester");
    expect(t.sent[0].text).toContain("Due date: *Sat 10 Jul 2027*");
    await t.message(lmp, "week");
    expect(t.sent[1].text).toContain("6 weeks 1 day");
  });

  it("starts from a due date", async () => {
    const t = T();
    await t.message(lmp, "due date 10 jul");
    expect(t.dump()["pregnancy/current"]).toMatchObject({ lmp: "2026-10-03" });
  });

  it("rejects impossible dates", async () => {
    const t = T();
    await t.message(lmp, "lmp 2025-01-01");
    await t.message(lmp, "lmp 2026-12-01");
    await t.message(lmp, "due date 2028-01-01");
    expect(t.sent.map((s) => s.text)).toEqual([
      expect.stringContaining("more than 42 weeks"),
      expect.stringContaining("future"),
      expect.stringContaining("more than 40 weeks away"),
    ]);
  });

  it("sends a weekly update on the LMP weekday, once, not on the first day", async () => {
    const t = T({ today: "2026-11-14" });
    await t.message(lmp, "lmp 3 oct"); // Saturday; 2026-11-14 is a Saturday: 6 weeks
    await t.schedule(lmp, "daily");
    expect(t.sent).toHaveLength(1); // just the answer to "lmp"
    t.setToday("2026-11-21");
    await t.schedule(lmp, "daily");
    await t.schedule(lmp, "daily");
    expect(t.sent).toHaveLength(2);
    expect(t.sent[1].text).toContain("*7 weeks* pregnant today (2nd month, approx.)");
    t.setToday("2027-01-09"); // 14 weeks
    await t.schedule(lmp, "daily");
    expect(t.sent.at(-1)!.text).toContain("second trimester starts");
  });

  it("stops and returns to period tracking, deleting the LMP", async () => {
    const t = T();
    await t.message(lmp, "lmp 3 oct");
    await t.message(lmp, "not pregnant");
    expect(t.dump()["pregnancy/current"]).toBeUndefined();
    await t.message(lmp, "week");
    expect(t.sent.at(-1)!.text).toContain("Pregnancy tracking is off");
  });

  it("pregnancy mode sends no period reminders", async () => {
    const t = T({ today: "2026-11-16" });
    await t.message(lmp, "period started 21 oct");
    await t.message(lmp, "lmp 21 oct");
    const before = t.sent.length;
    await t.schedule(lmp, "daily");
    expect(t.sent).toHaveLength(before);
  });
});

describe("lmp-tracker: early and late notes", () => {
  it("notes an LMP under 2 weeks, and 42 weeks or more", async () => {
    const t = T();
    await t.message(lmp, "lmp 5 nov");
    expect(t.sent[0].text).toContain("less than 2 weeks");
    await t.message(lmp, "lmp 2026-01-25"); // exactly 294 days: 42w0d
    expect(t.sent[1].text).toContain("42 weeks or more");
  });
});

describe("lmp-tracker: basics", () => {
  it("help and unknown input answer in words", async () => {
    const t = T();
    await t.message(lmp, "help");
    expect(t.sent[0].text).toBe(lmp.help);
    await t.message(lmp, "what's up");
    expect(t.sent[1].text).toContain("help");
  });
});
