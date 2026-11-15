import { describe, expect, it } from "vitest";
import { averageCycle, cycles, predict, pregnancy, pregnancyMonth, weeksLabel } from "../calc";
import { parseDay } from "../dates";

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
  it("averages the last six plausible cycles", () => {
    const starts = ["2026-06-01", "2026-06-29", "2026-07-28", "2026-08-25", "2026-09-23", "2026-10-21"];
    expect(cycles(starts)).toEqual([28, 29, 28, 29, 28]);
    expect(averageCycle(starts, 30)).toBe(28);
    expect(averageCycle(["2026-10-21"], 30)).toBe(30);
    // A 90-day gap is a missed log, not a cycle.
    expect(cycles(["2026-01-01", "2026-04-01", "2026-04-29"])).toEqual([28]);
  });
  it("predicts the next period, ovulation and fertile window", () => {
    const p = predict(["2026-10-21"], 28, today)!;
    expect(p.nextPeriod).toBe("2026-11-18");
    expect(p.ovulation).toBe("2026-11-04");
    expect(p.fertileStart).toBe("2026-10-30");
    expect(p.fertileEnd).toBe("2026-11-04");
    expect(p.daysLate).toBe(0);
    expect(predict(["2026-10-01"], 28, today)!.daysLate).toBe(17);
    expect(predict([], 28, today)).toBe(null);
  });
});

describe("pregnancy math", () => {
  it("follows Naegele's rule and ACOG trimesters", () => {
    const s = pregnancy("2026-10-03", today);
    expect(s.dueDate).toBe("2027-07-10");
    expect([s.weeks, s.days]).toEqual([6, 1]);
    expect(weeksLabel(s)).toBe("6 weeks 1 day");
    expect(s.trimester).toBe(1);
    expect(pregnancy("2026-08-09", today).trimester).toBe(2); // 14w0d
    expect(pregnancy("2026-05-03", today).trimester).toBe(3); // 28w+
    expect(pregnancy("2026-08-10", today).trimester).toBe(1); // 13w6d
  });
});

describe("pregnancy month", () => {
  it("maps weeks to the 9-month count", () => {
    expect([0, 4, 5, 8, 9, 13, 14, 17, 18, 22, 23, 27, 28, 31, 32, 35, 36, 40, 42].map(pregnancyMonth)).toEqual([
      1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 9,
    ]);
  });
});
