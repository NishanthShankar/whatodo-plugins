import { describe, expect, it } from "vitest";
import habits from "..";
import { createTestKit } from "../../../testing";

describe("habits", () => {
  it("adds, logs, and shows streaks", async () => {
    const t = createTestKit();
    await t.message(habits, "add meditate");
    await t.message(habits, "done meditate");
    expect(t.reactions).toEqual(["👍", "✅"]);
    await t.message(habits, "habits");
    expect(t.sent.at(-1)!.text).toContain("*Meditate*  🔥 1");
    expect(t.sent.at(-1)!.text).toContain("🟩");
  });

  it("does not add the same habit twice", async () => {
    const t = createTestKit();
    await t.message(habits, "add read");
    await t.message(habits, "add Read");
    expect(Object.keys(t.dump()).filter((k) => k.startsWith("habits/"))).toHaveLength(1);
  });

  it("checks in and logs from a reaction, and undoes when it's removed", async () => {
    const t = createTestKit({ hour: 21 });
    await t.message(habits, "add read");
    await t.schedule(habits, "checkin");
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].text).toContain("Did you *Read* today?");
    await t.react(habits, "👍", t.sent[0].ref);
    expect(((await t.load(habits)) as { habits: { streak: number }[] }).habits[0].streak).toBe(1);
    await t.react(habits, null, t.sent[0].ref);
    expect(((await t.load(habits)) as { habits: { streak: number }[] }).habits[0].streak).toBe(0);
  });

  it("acknowledges every reaction with a 👍 and takes it back when theirs is removed", async () => {
    const t = createTestKit({ hour: 21 });
    await t.message(habits, "add read");
    await t.schedule(habits, "checkin");
    await t.react(habits, "✅", t.sent[0].ref);
    await t.react(habits, "❌", t.sent[0].ref);
    await t.react(habits, "😅", t.sent[0].ref);
    await t.react(habits, null, t.sent[0].ref);
    expect(t.reactions).toEqual(["👍", "👍", "👍", "👍", ""]);
  });

  it("❌ means didn't do it: no streak, and the day is closed", async () => {
    const t = createTestKit({ hour: 21 });
    await t.message(habits, "add read");
    await t.schedule(habits, "checkin");
    await t.react(habits, "✅", t.sent[0].ref);
    await t.react(habits, "❌", t.sent[0].ref);
    const load = async () => ((await t.load(habits)) as { habits: { streak: number; total: number }[] }).habits[0];
    expect(await load()).toMatchObject({ streak: 0, total: 0 });
    const ref = t.sent[0].ref as { habitId: string; day: string };
    expect(t.dump()).toHaveProperty([`missed/${ref.habitId}:${ref.day}`]);
    // Not asked again that day, even if its check-in time comes round again.
    await t.schedule(habits, "checkin");
    expect(t.sent).toHaveLength(1);
    // Removing the ❌ reopens the day.
    await t.react(habits, null, t.sent[0].ref);
    await t.schedule(habits, "checkin");
    expect(t.sent).toHaveLength(2);
    // Logging it later still counts.
    await t.react(habits, "❌", t.sent[1].ref);
    await t.message(habits, "done read");
    expect(await load()).toMatchObject({ streak: 1, total: 1 });
  });

  it("a no reply closes the day too", async () => {
    const t = createTestKit({ hour: 21 });
    await t.message(habits, "add read");
    await t.schedule(habits, "checkin");
    await t.message(habits, "no", t.sent[0].ref);
    await t.schedule(habits, "checkin");
    expect(t.sent).toHaveLength(1);
  });

  it("adds a habit for some days only and asks only on those days", async () => {
    // createTestKit's today is fixed; find its weekday and pick days around it.
    const t = createTestKit({ hour: 21 });
    const wd = new Date(`${t.kit.today}T00:00:00Z`).getUTCDay();
    const names = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    await t.message(habits, `add gym on ${names[(wd + 1) % 7]} and ${names[(wd + 3) % 7]} at 9pm`);
    await t.message(habits, "add read");
    await t.schedule(habits, "checkin");
    expect(t.sent.map((x) => x.text.match(/\*(.+?)\*/)![1])).toEqual(["Read"]);
    await t.message(habits, `days gym ${names[wd]}`);
    await t.schedule(habits, "checkin");
    expect(t.sent.at(-1)!.text).toContain("*Gym*");
    await t.message(habits, "habits");
    expect(t.sent.at(-1)!.text).toMatch(/\*Gym\*.*⏰ 9pm  📅 (Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/m);
  });

  it("parses days in add and days commands", async () => {
    const t = createTestKit();
    await t.message(habits, "add gym every mon, wed & fri");
    await t.message(habits, "add walk at 7am on weekdays");
    await t.message(habits, "add call mom");
    const rows = () => Object.values(t.dump()).filter((v) => typeof v === "object" && v && "name" in v) as { name: string; days: number[] | null; hour: number | null }[];
    expect(rows().map((r) => [r.name, r.days, r.hour])).toEqual([
      ["Gym", [1, 3, 5], null],
      ["Walk", [1, 2, 3, 4, 5], 7],
      ["Call mom", null, null],
    ]);
    await t.message(habits, "days gym every day");
    await t.message(habits, "days walk weekends");
    expect(rows().map((r) => r.days)).toEqual([null, [0, 6], null]);
    await t.message(habits, "days gym someday");
    expect(t.sent.at(-1)!.text).toContain("days gym mon wed fri");
  });

  it("days off don't break a streak", async () => {
    const t = createTestKit({ hour: 21 });
    await t.message(habits, "add gym");
    const id = Object.keys(t.dump()).find((k) => k.startsWith("habits/"))!.slice(7);
    const today = t.kit.today;
    const day = (n: number) => t.kit.time.shiftDay(today, n);
    const wd = (n: number) => new Date(`${day(n)}T00:00:00Z`).getUTCDay();
    // Due today and 2 days ago; yesterday is off.
    await t.load(habits); // make sure web works before patching
    await t.act(habits, "setHabitDays", { id, days: [wd(0), wd(-2), wd(-4)] });
    await t.act(habits, "setDay", { id, day: day(-4), done: true });
    await t.act(habits, "setDay", { id, day: day(-2), done: true });
    await t.act(habits, "setDay", { id, day: day(0), done: true });
    const h = ((await t.load(habits)) as { habits: { streak: number; best: number; days: number[] }[] }).habits[0];
    expect(h.streak).toBe(3);
    expect(h.best).toBe(3);
    await t.act(habits, "setDay", { id, day: day(-2), done: false });
    expect(((await t.load(habits)) as { habits: { streak: number }[] }).habits[0].streak).toBe(1);
  });

  it("skips habits already done today", async () => {
    const t = createTestKit({ hour: 21 });
    await t.message(habits, "add read");
    await t.message(habits, "done read");
    await t.schedule(habits, "checkin");
    expect(t.sent).toHaveLength(0);
  });

  it("logs from a yes/no reply to a check-in", async () => {
    const t = createTestKit({ hour: 21 });
    await t.message(habits, "add read");
    await t.schedule(habits, "checkin");
    await t.message(habits, "yes", t.sent[0].ref);
    expect(t.reactions.at(-1)).toBe("✅");
    await t.message(habits, "no", t.sent[0].ref);
    expect(((await t.load(habits)) as { habits: { streak: number }[] }).habits[0].streak).toBe(0);
  });

  it("asks each habit at its own time, else the default", async () => {
    const t = createTestKit();
    await t.message(habits, "add meditate at 7am");
    await t.message(habits, "add read");
    const asked = () => t.sent.map((s) => s.text.match(/\*(.+?)\*/)![1]);
    t.setHour(7);
    await t.schedule(habits, "checkin");
    expect(asked()).toEqual(["Meditate"]);
    t.setHour(21);
    await t.schedule(habits, "checkin");
    expect(asked()).toEqual(["Meditate", "Read"]);
    await t.message(habits, "time read 6am");
    await t.message(habits, "time meditate default");
    const page = (await t.load(habits)) as { habits: { name: string; hour: number | null }[] };
    expect(page.habits.map((h) => [h.name, h.hour])).toEqual([["Meditate", null], ["Read", 6]]);
    await t.message(habits, "habits");
    expect(t.sent.at(-1)!.text).toContain("*Read*  ⏰ 6am");
  });

  it("changes and turns off the default time", async () => {
    const t = createTestKit();
    await t.message(habits, "time 10pm");
    expect(t.kit.settings.checkinHour).toBe(22);
    await t.message(habits, "time off");
    expect(t.kit.settings.checkinHour).toBe(null);
    await t.message(habits, "add read");
    t.setHour(21);
    await t.schedule(habits, "checkin");
    expect(t.sent).toHaveLength(0);
  });

  it("web actions: create, setDay, rename, archive, refuses future days", async () => {
    const t = createTestKit();
    const id = (await t.act(habits, "create", { name: "walk" })) as string;
    await t.act(habits, "setDay", { id, day: "2026-11-14", done: true });
    await t.act(habits, "setDay", { id, day: "2026-11-15", done: true });
    await t.act(habits, "rename", { id, name: "evening walk" });
    const page = (await t.load(habits)) as { habits: { name: string; streak: number; best: number }[] };
    expect(page.habits[0]).toMatchObject({ name: "Evening walk", streak: 2, best: 2 });
    await expect(t.act(habits, "setDay", { id, day: "2026-11-16", done: true })).rejects.toThrow();
    await t.act(habits, "archive", { id });
    const after = (await t.load(habits)) as { habits: unknown[] };
    expect(after.habits).toHaveLength(0);
  });

  it("help answers in words; unknown messages go to whatodo with a help fallback", async () => {
    const t = createTestKit();
    await t.message(habits, "help");
    expect(t.sent[0].text).toBe(habits.help);
    await t.message(habits, "what is this");
    expect(t.sent).toHaveLength(1);
    expect(t.unsures[0]).toContain("help");
  });

  it("upgrading from 1.0.0 keeps existing habits working", async () => {
    const t = createTestKit({ hour: 21 });
    await t.kit.store.put("habits", "old1", { name: "Stretch", createdDay: "2026-11-01", archived: false }, 1);
    await t.upgrade(habits, "1.0.0");
    await t.schedule(habits, "checkin");
    expect(t.sent[0].text).toContain("*Stretch*");
  });
});

describe("habits: unclear messages", () => {
  const habitRows = (t: ReturnType<typeof createTestKit>) =>
    Object.entries(t.dump())
      .filter(([k]) => k.startsWith("habits/"))
      .map(([k, v]) => ({ id: k.slice(7), ...(v as { name: string; days: number[] | null; hour: number | null; archived: boolean }) }));

  it("hands what it can't read to whatodo with a fallback, instead of answering", async () => {
    const t = createTestKit();
    await t.message(habits, "I want to start going to the gym on mondays and thursdays");
    expect(t.sent).toHaveLength(0);
    expect(t.unsures).toEqual(["I didn't get that. Send _help_ to see what I can do."]);
  });

  it.each([
    ["I want to start going to the gym on mondays and thursdays", "Gym", [1, 4], null],
    ["can you track reading every day at 10pm", "Reading", null, 22],
    ["start a habit of meditation in the morning at 7", "Meditation", null, 7],
    ["I'd like to run on weekends", "Run", [0, 6], null],
    ["new habit: drink 8 glasses of water", "Drink 8 glasses of water", null, null],
    ["yoga tue, thu and sat at 6:30am", "Yoga", [2, 4, 6], 6],
  ])("add_habit: %s", async (text, name, days, hour) => {
    const t = createTestKit();
    await t.intent(habits, text, "add_habit");
    expect(habitRows(t).map((h) => [h.name, h.days, h.hour])).toEqual([[name, days, hour]]);
    expect(t.reactions).toEqual(["👍"]);
  });

  it("asks for a name when there is none", async () => {
    const t = createTestKit();
    await t.intent(habits, "I want to start a new habit", "add_habit");
    expect(habitRows(t)).toHaveLength(0);
    expect(t.sent.at(-1)!.text).toContain("What should I call it?");
  });

  it("acts on one habit, by the model's target or by name in the text", async () => {
    const t = createTestKit({ hour: 21 });
    await t.message(habits, "add gym");
    await t.message(habits, "add read");
    const [gym, read] = habitRows(t);
    expect(await t.targets(habits)).toEqual({ [gym.id]: "Gym", [read.id]: "Read" });

    await t.intent(habits, "finished my workout", "log_done", gym.id);
    expect(t.reactions.at(-1)).toBe("✅");
    expect(t.dump()).toHaveProperty([`logs/${gym.id}:${t.kit.today}`]);

    await t.intent(habits, "oops I didn't actually do gym", "undo_done");
    expect(t.dump()).not.toHaveProperty([`logs/${gym.id}:${t.kit.today}`]);

    await t.intent(habits, "skipped reading today", "missed", read.id);
    expect(t.dump()).toHaveProperty([`missed/${read.id}:${t.kit.today}`]);

    await t.intent(habits, "move gym to tuesdays and fridays", "set_days", gym.id);
    await t.intent(habits, "remind me about read at 8 in the morning... 8am", "set_time", read.id);
    expect(habitRows(t).map((h) => [h.name, h.days, h.hour])).toEqual([
      ["Gym", [2, 5], null],
      ["Read", null, 8],
    ]);

    await t.intent(habits, "I'm done with the gym thing, stop asking", "remove_habit", gym.id);
    expect(habitRows(t)[0].archived).toBe(true);
  });

  it("asks which habit or which days when the text doesn't say", async () => {
    const t = createTestKit();
    await t.message(habits, "add gym");
    await t.message(habits, "add read");
    await t.intent(habits, "I did it", "log_done");
    expect(t.sent.at(-1)!.text).toBe("Which habit? Send _habits_ to see them.");
    const [gym] = habitRows(t);
    await t.intent(habits, "change the days for gym", "set_days", gym.id);
    expect(t.sent.at(-1)!.text).toContain("days gym mon wed fri");
  });

  it("default time, list and help", async () => {
    const t = createTestKit();
    await t.intent(habits, "please check in with me at 8pm instead", "default_time");
    expect(t.kit.settings.checkinHour).toBe(20);
    await t.intent(habits, "stop the nightly messages", "default_time");
    expect(t.kit.settings.checkinHour).toBe(null);
    await t.intent(habits, "how am I doing", "list");
    expect(t.sent.at(-1)!.text).toContain("No habits yet");
    await t.intent(habits, "what can you do", "help");
    expect(t.sent.at(-1)!.text).toContain("*Habits*");
  });
});
