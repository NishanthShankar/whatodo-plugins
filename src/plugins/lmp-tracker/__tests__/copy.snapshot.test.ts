/**
 * Every reply Period Tracker can give, captured exactly. This file exists so the wording can
 * be moved or rewritten on purpose and never by accident: a change here is a change people see.
 */
import { describe, expect, it } from "vitest";
import lmp from "..";
import { createTestKit } from "../../../testing";

// 2026-11-16 is a Monday.
const T = (o = {}) => createTestKit({ today: "2026-11-16", hour: 9, ...o });
type Kit = ReturnType<typeof T>;

/** Everything the plugin put on WhatsApp so far. */
const said = (t: Kit) => ({ sent: t.sent, asked: t.asked, reactions: t.reactions, unsures: t.unsures, groups: [...t.groups] });
const lastRef = (t: Kit) => t.sent.at(-1)!.ref;

describe("lmp-tracker copy: what the plugin says about itself", () => {
  it("welcome, help and group name", () => {
    expect({ welcome: lmp.welcome, help: lmp.help, groupName: lmp.groupName }).toMatchSnapshot();
  });

  it("help, asked for in words and through the intent model, with 🩸 and with 🌙", async () => {
    const t = T();
    await t.message(lmp, "help");
    await t.intent(lmp, "how does this work", "help");
    const moon = T({ settings: { symbol: "moon" } });
    await moon.intent(lmp, "how does this work", "help");
    expect({ blood: said(t), moon: said(moon) }).toMatchSnapshot();
  });
});

describe("lmp-tracker copy: sending a period", () => {
  it("the first one, then the question about 🩸 answered yes", async () => {
    const t = T({ today: "2026-10-19" });
    await t.message(lmp, "LMP oct 12");
    await t.message(lmp, "yes");
    expect(said(t)).toMatchSnapshot();
  });

  it("the question about 🩸 answered no, typed and quoted", async () => {
    const typed = T();
    await typed.message(lmp, "today");
    await typed.message(lmp, "no");
    const quoted = T();
    await quoted.message(lmp, "today");
    quoted.setToday("2026-11-30");
    await quoted.message(lmp, "No thanks", lastRef(quoted));
    expect({ typed: said(typed), quoted: said(quoted) }).toMatchSnapshot();
  });

  it("the first one for someone who already chose 🌙", async () => {
    const t = T({ settings: { symbol: "moon" } });
    await t.message(lmp, "period yesterday");
    expect(said(t)).toMatchSnapshot();
  });

  it("the ones after: a thumbs up, a correction, an older date", async () => {
    const t = T({ today: "2026-10-19" });
    await t.message(lmp, "lmp 12 oct");
    t.sent.length = 0;
    t.setToday("2026-11-09");
    await t.message(lmp, "LMP today");
    t.setToday("2026-11-16");
    await t.message(lmp, "lmp"); // the same period, moved
    await t.message(lmp, "lmp today"); // the same date again
    await t.message(lmp, "lmp 14 sep"); // older than the latest
    await t.intent(lmp, "my periods came on 15th nov", "log_lmp");
    await t.intent(lmp, "my periods came", "log_lmp");
    expect(said(t)).toMatchSnapshot();
  });

  it("dates in another year are written with the year", async () => {
    const t = T({ today: "2027-01-05" });
    await t.message(lmp, "lmp 28 dec");
    t.sent.length = 0;
    await t.message(lmp, "lmp 30 nov");
    await t.message(lmp, "lmp 2 jan");
    await t.message(lmp, "last period");
    await t.message(lmp, "history");
    expect(said(t)).toMatchSnapshot();
  });

  it("a date that can't be used, the end of a period, and something else entirely", async () => {
    const t = T();
    await t.message(lmp, "lmp 2026-12-01");
    await t.message(lmp, "lmp blorp");
    await t.message(lmp, "period ended");
    await t.message(lmp, "what is this");
    expect(said(t)).toMatchSnapshot();
  });
});

describe("lmp-tracker copy: asking for the last period", () => {
  it("with none", async () => {
    const t = T();
    await t.message(lmp, "last period");
    await t.message(lmp, "history");
    await t.message(lmp, "undo");
    await t.intent(lmp, "when was my last period", "ask_lmp");
    await t.intent(lmp, "show me all of them", "history");
    await t.intent(lmp, "take that back", "undo");
    expect(said(t)).toMatchSnapshot();
  });

  it("today, yesterday and days ago; due later, due today and overdue", async () => {
    const t = T();
    await t.message(lmp, "today");
    t.sent.length = 0;
    await t.message(lmp, "last period");
    t.setToday("2026-11-17");
    await t.message(lmp, "last period");
    t.setToday("2026-11-25");
    await t.message(lmp, "status");
    t.setToday("2026-12-14");
    await t.message(lmp, "when was my last lmp?");
    t.setToday("2026-12-16");
    await t.intent(lmp, "when is the next one", "ask_lmp");
    expect(said(t)).toMatchSnapshot();
  });

  it("a usual cycle that isn't whole weeks", async () => {
    const t = T({ settings: { cycleLength: 30 } });
    await t.message(lmp, "lmp 9 nov");
    t.sent.length = 0;
    await t.message(lmp, "last period");
    expect(said(t)).toMatchSnapshot();
  });

  it("a cycle learned from her own dates, and the history that goes with it", async () => {
    const t = T({ today: "2026-10-19" });
    for (const d of ["2026-08-10", "2026-09-14"]) await t.message(lmp, `lmp ${d}`);
    await t.message(lmp, "lmp today");
    t.sent.length = 0;
    t.reactions.length = 0;
    await t.message(lmp, "last period");
    await t.message(lmp, "history");
    await t.intent(lmp, "show me all of them", "history");
    expect(said(t)).toMatchSnapshot();
  });

  it("a history of one, and of two", async () => {
    const t = T();
    await t.message(lmp, "lmp 12 oct");
    t.sent.length = 0;
    await t.message(lmp, "history");
    await t.message(lmp, "lmp 9 nov");
    await t.message(lmp, "history");
    expect(said(t)).toMatchSnapshot();
  });
});

describe("lmp-tracker copy: corrections", () => {
  it("undo and delete", async () => {
    const t = T();
    await t.message(lmp, "lmp 12 oct");
    await t.message(lmp, "lmp 9 nov");
    t.sent.length = 0;
    t.reactions.length = 0;
    await t.message(lmp, "delete blorp");
    await t.message(lmp, "delete 1 nov");
    await t.message(lmp, "remove lmp 12 oct");
    await t.message(lmp, "undo");
    await t.message(lmp, "undo");
    await t.intent(lmp, "take that back", "undo");
    expect(said(t)).toMatchSnapshot();
  });
});

describe("lmp-tracker copy: reminders", () => {
  it("due, a week later, and the test nudge", async () => {
    const t = T({ today: "2026-10-19" });
    await t.message(lmp, "lmp today");
    t.sent.length = 0;
    for (const day of ["2026-11-15", "2026-11-16", "2026-11-20", "2026-11-23", "2026-11-30", "2026-12-07"]) {
      t.setToday(day);
      await t.schedule(lmp, "daily");
    }
    expect(said(t)).toMatchSnapshot();
  });

  it("the same three on days that aren't whole weeks, with 🌙", async () => {
    const t = T({ today: "2026-10-19", settings: { symbol: "moon" } });
    await t.message(lmp, "lmp today");
    t.sent.length = 0;
    for (const day of ["2026-11-17", "2026-11-24", "2026-12-01"]) {
      t.setToday(day);
      await t.schedule(lmp, "daily");
    }
    expect(said(t)).toMatchSnapshot();
  });

  it("answers to the due reminder: yes, not yet, a tick", async () => {
    const yes = T();
    await yes.message(lmp, "lmp 19 oct");
    await yes.schedule(lmp, "daily");
    yes.sent.length = 0;
    await yes.message(lmp, "Yes");

    const notYet = T();
    await notYet.message(lmp, "lmp 19 oct");
    await notYet.schedule(lmp, "daily");
    notYet.sent.length = 0;
    await notYet.message(lmp, "not yet");

    const tick = T();
    await tick.message(lmp, "lmp 19 oct");
    await tick.schedule(lmp, "daily");
    tick.sent.length = 0;
    await tick.react(lmp, "✅", { kind: "lmp-due", date: "2026-10-19" });
    await tick.react(lmp, null, { kind: "lmp-due", date: "2026-10-19" });
    expect({ yes: said(yes), notYet: said(notYet), tick: said(tick) }).toMatchSnapshot();
  });

  it("answers to the test nudge: yes and no", async () => {
    const yes = T({ today: "2026-10-03" });
    await yes.message(lmp, "LMP today");
    yes.setToday("2026-11-14");
    await yes.schedule(lmp, "daily");
    yes.sent.length = 0;
    await yes.message(lmp, "yes");

    const no = T({ today: "2026-10-03" });
    await no.message(lmp, "LMP today");
    no.setToday("2026-11-14");
    await no.schedule(lmp, "daily");
    const nudge = lastRef(no);
    no.sent.length = 0;
    await no.message(lmp, "negative", nudge);
    expect({ yes: said(yes), no: said(no) }).toMatchSnapshot();
  });

  it("turning them off and on, and choosing the hour", async () => {
    const t = T();
    await t.message(lmp, "reminders off");
    await t.message(lmp, "reminders on");
    await t.message(lmp, "reminder time 8am");
    await t.message(lmp, "reminder time 12pm");
    await t.message(lmp, "reminder at 0");
    await t.message(lmp, "reminders time 15");
    await t.message(lmp, "reminder time 8.30 pm");
    await t.message(lmp, "reminder time 13pm");
    await t.message(lmp, "reminder time 99");
    expect(said(t)).toMatchSnapshot();
  });
});

describe("lmp-tracker copy: pregnancy mode", () => {
  it("said before there is a period, and with one that is too old", async () => {
    const t = T();
    await t.message(lmp, "I'm pregnant");
    await t.intent(lmp, "the test was positive", "pregnant");
    await t.message(lmp, "lmp 2025-12-01");
    await t.message(lmp, "pregnant");
    expect(said(t)).toMatchSnapshot();
  });

  it("on at whole weeks, asked about along the way, and past its end", async () => {
    const t = T();
    await t.message(lmp, "lmp 5 oct");
    t.sent.length = 0;
    await t.message(lmp, "pregnant");
    await t.message(lmp, "last period");
    t.setToday("2026-10-13");
    await t.message(lmp, "how far along");
    t.setToday("2026-12-12");
    await t.intent(lmp, "how far along am I", "ask_lmp");
    t.setToday("2027-08-01");
    await t.message(lmp, "last period");
    await t.schedule(lmp, "daily");
    await t.message(lmp, "last period");
    expect(said(t)).toMatchSnapshot();
  });

  it("on at weeks and days, with 🌙", async () => {
    const t = T({ settings: { symbol: "moon" } });
    await t.message(lmp, "lmp 3 oct");
    t.sent.length = 0;
    await t.message(lmp, "yes, i am pregnant");
    expect(said(t)).toMatchSnapshot();
  });

  it("a bare period word asks: see it, or record a new one", async () => {
    const t = T();
    await t.message(lmp, "lmp 3 oct");
    await t.message(lmp, "pregnant");
    t.sent.length = 0;
    t.reactions.length = 0;
    t.setToday("2026-12-20");
    await t.message(lmp, "lmp");
    await t.message(lmp, "1");
    await t.message(lmp, "19 dec");
    t.setToday("2026-12-21");
    await t.message(lmp, "2");
    expect(said(t)).toMatchSnapshot();
  });

  it("off again in words, and through the intent model", async () => {
    const t = T();
    await t.message(lmp, "lmp 3 oct");
    await t.message(lmp, "pregnant");
    t.sent.length = 0;
    t.reactions.length = 0;
    await t.message(lmp, "not pregnant");
    await t.message(lmp, "pregnant");
    await t.intent(lmp, "the pregnancy is over", "not_pregnant");
    await t.intent(lmp, "the test was negative", "not_pregnant");
    expect(said(t)).toMatchSnapshot();
  });
});

describe("lmp-tracker copy: 🩸 or 🌙", () => {
  it("switching in words", async () => {
    const t = T();
    await t.message(lmp, "moon");
    await t.message(lmp, "last period");
    await t.message(lmp, "blood");
    await t.message(lmp, "no blood");
    await t.message(lmp, "switch to blood");
    expect(said(t)).toMatchSnapshot();
  });
});
