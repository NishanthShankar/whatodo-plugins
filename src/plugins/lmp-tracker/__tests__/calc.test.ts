import { describe, expect, it } from "vitest";
import { cycles, longestCycle, plan, pregnancy, span, stageOn, typicalCycle, weeksLabel } from "../calc";
import { findDay, parseDay } from "../dates";

const today = "2026-11-15";

describe("dates", () => {
  it("reads the formats people send", () => {
    expect(parseDay("today", today, "past")).toBe("2026-11-15");
    expect(parseDay("yesterday", today, "past")).toBe("2026-11-14");
    expect(parseDay("3 days ago", today, "past")).toBe("2026-11-12");
    expect(parseDay("12 nov", today, "past")).toBe("2026-11-12");
    expect(parseDay("nov 12", today, "past")).toBe("2026-11-12");
    expect(parseDay("12th November", today, "past")).toBe("2026-11-12");
    expect(parseDay("12/11", today, "past")).toBe("2026-11-12");
    expect(parseDay("12/11/2026", today, "past")).toBe("2026-11-12");
    expect(parseDay("2026-11-12", today, "past")).toBe("2026-11-12");
    expect(parseDay("on 3 oct", today, "past")).toBe("2026-10-03");
  });
  it("picks the year by direction", () => {
    expect(parseDay("20 dec", today, "past")).toBe("2025-12-20");
    expect(parseDay("10 jul", today, "future")).toBe("2027-07-10");
    expect(parseDay("20 nov", today, "future")).toBe("2026-11-20");
  });
  it("rejects nonsense", () => {
    expect(parseDay("31/02", today, "past")).toBe(null);
    expect(parseDay("blah", today, "past")).toBe(null);
    expect(parseDay("13/13/2026", today, "past")).toBe(null);
  });
});

describe("cycle math", () => {
  it("only gaps of 15 to 45 days are cycles", () => {
    expect(cycles(["2026-06-01", "2026-06-29", "2026-07-28", "2026-08-25", "2026-09-23", "2026-10-21"])).toEqual([28, 29, 28, 29, 28]);
    // A gap over 45 days is a month not sent, not a cycle.
    expect(cycles(["2026-01-01", "2026-03-01", "2026-03-29"])).toEqual([28]);
  });
  it("learns the usual cycle once it repeats", () => {
    expect(typicalCycle(["2026-10-21"], 28)).toBe(28);
    // One 35-day cycle: still 4 weeks. Two in a row: 5 weeks.
    expect(typicalCycle(["2026-09-14", "2026-10-19"], 28)).toBe(28);
    expect(typicalCycle(["2026-08-10", "2026-09-14", "2026-10-19"], 28)).toBe(35);
    // One odd month among regular ones doesn't move it.
    expect(typicalCycle(["2026-04-01", "2026-04-29", "2026-05-27", "2026-07-06"], 28)).toBe(28);
    expect(longestCycle(["2026-04-01", "2026-04-29", "2026-05-27", "2026-07-06"])).toBe(40);
    expect(longestCycle(["2026-04-01"])).toBe(null);
  });
  it("plans reminders at the usual cycle, a week later, and two weeks later", () => {
    const p = plan("2026-10-19", 28);
    expect([p.due, p.again, p.upt]).toEqual(["2026-11-16", "2026-11-23", "2026-11-30"]);
    expect(stageOn(p, "2026-11-15")).toBe(null);
    expect(stageOn(p, "2026-11-16")).toBe("due");
    expect(stageOn(p, "2026-11-22")).toBe("due");
    expect(stageOn(p, "2026-11-23")).toBe("again");
    expect(stageOn(p, "2026-11-30")).toBe("upt");
    expect(stageOn(p, "2026-12-06")).toBe("upt");
    expect(stageOn(p, "2026-12-07")).toBe(null);
  });
  it("holds the test nudge until a week past the longest recent cycle", () => {
    expect(plan("2026-10-19", 28, 30).upt).toBe("2026-11-30"); // 42 days
    expect(plan("2026-10-19", 28, 40).upt).toBe("2026-12-05"); // 47 days
  });
  it("says weeks on a whole week", () => {
    expect([span(28), span(7), span(30), span(1)]).toEqual(["4 weeks", "1 week", "30 days", "1 day"]);
  });
});

describe("finding a date in a sentence", () => {
  it("finds it anywhere, or returns null", () => {
    expect(findDay("my periods came on 9th nov", today, "past")).toBe("2026-11-09");
    expect(findDay("got it 2 days ago!", today, "past")).toBe("2026-11-13");
    expect(findDay("periods came today", today, "past")).toBe("2026-11-15");
    expect(findDay("aaj periods aaye", today, "past")).toBe(null);
  });
});

describe("weeks along", () => {
  it("counts weeks from the LMP and the due date by Naegele's rule", () => {
    const s = pregnancy("2026-10-03", today);
    expect(s.dueDate).toBe("2027-07-10");
    expect(weeksLabel(s)).toBe("6 weeks 1 day");
    expect(weeksLabel(pregnancy("2026-10-04", today))).toBe("6 weeks");
  });
});
