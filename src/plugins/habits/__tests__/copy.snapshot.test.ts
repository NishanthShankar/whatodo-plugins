/**
 * Every reply Habits sends, captured exactly. This is not a test of behaviour (habits.test.ts
 * and pact.test.ts are): it pins the wording, so moving or reorganising the text can be shown
 * to change nothing that reaches WhatsApp.
 */
import { describe, expect, it } from "vitest";
import type { Json, Sender } from "../../../sdk";
import { createTestKit, type TestKitOptions } from "../../../testing";
import habits from "../index";

type T = ReturnType<typeof createTestKit>;

const asha: Sender = { id: "asha", name: "Asha Rao", owner: false, profile: false };
const meera: Sender = { id: "meera", name: "Meera Nair", owner: false, profile: false };
const ravi: Sender = { id: "ravi", name: "Ravi", owner: false, profile: true };
const anon: Sender = { id: "anon", name: null, owner: false, profile: false };
const P = "gym-buddies";

/** Drives the plugin one step at a time and keeps what each step put on WhatsApp. */
function drive(opts: TestKitOptions = {}) {
  const t = createTestKit({ today: "2026-11-09", hour: 20, ...opts });
  const log: unknown[] = [];
  let s = 0;
  let a = 0;
  let r = 0;
  let u = 0;
  const step = async (label: string, fn: () => Promise<unknown>) => {
    let threw: string | undefined;
    try {
      await fn();
    } catch (e) {
      threw = (e as Error).message;
    }
    log.push({
      step: label,
      sent: t.sent.slice(s),
      asked: t.asked.slice(a).map(({ open: _open, ...rest }) => rest),
      reactions: t.reactions.slice(r),
      unsures: t.unsures.slice(u),
      ...(threw === undefined ? {} : { threw }),
    });
    s = t.sent.length;
    a = t.asked.length;
    r = t.reactions.length;
    u = t.unsures.length;
  };
  const who = (from?: Sender) => (from ? from.id : "owner");
  const where = (group?: string | null) => (group ? ` in ${group}` : "");
  return {
    t,
    log,
    step,
    say: (text: string, o: { from?: Sender; group?: string | null; quoted?: Json } = {}) =>
      step(`${who(o.from)}${where(o.group)}: ${text}`, () => t.message(habits, text, o.quoted ?? null, o.group ?? null, o.from)),
    mean: (intent: string, text: string, o: { from?: Sender; group?: string | null; target?: string | null } = {}) =>
      step(`${who(o.from)}${where(o.group)} means ${intent}: ${text}`, () => t.intent(habits, text, intent, o.target ?? null, 1, o.from, o.group ?? null)),
    vote: (label: string, ref: Json, choice: number | number[], from?: Sender) => step(`${who(from)} ${Array.isArray(choice) ? `ticks [${choice.join(", ")}]` : `votes ${choice}`} on ${label}`, () => t.answer(habits, ref, choice, from)),
    tick: (id = "checkin") => step(`schedule ${id} on ${t.kit.today} at ${t.kit.time.hour(t.kit.now)}`, () => t.schedule(habits, id)),
    groups: () => Object.fromEntries(t.groups),
  };
}

const idOf = async (t: T, name: string) => Object.entries(await t.targets(habits)).find(([, n]) => n === name)![0];
const lastAsk = (t: T, pick: (ref: Record<string, unknown>) => boolean) => t.asked.filter((q) => q.ref && pick(q.ref as Record<string, unknown>)).at(-1)!.ref as Json;
const seed = (t: T, id: string, pact: string, name: string, by = "owner") =>
  t.kit.store.put("phabits", id, { pact, name, createdDay: t.kit.today, archived: false, hour: null, days: null, by }, t.kit.now);

describe("habits: every reply, word for word", () => {
  it("what the listing says on WhatsApp", () => {
    expect({ welcome: habits.welcome, help: habits.help, groupName: habits.groupName }).toMatchSnapshot();
  });

  it("the person's own commands", async () => {
    const d = drive();
    const { t, say } = d;
    await say("habits");
    await say("add meditate");
    await say("add read at 7am");
    await say("add gym on mon wed fri");
    await say("add ...");
    await say("add meditate at 6am");
    await say("done meditate");
    await say("done read");
    await say("done gym");
    t.setToday("2026-11-10");
    await say("done meditate");
    t.setToday("2026-11-11");
    await say("done meditate");
    await say("done gym");
    await say("undo gym");
    t.setToday("2026-11-13");
    await say("done 1");
    await say("did gym");
    t.setToday("2026-11-15");
    await say("habits");
    await say("streaks");
    await say("done nothing");
    await say("undo nothing");
    await say("stop nothing");
    await say("time meditate 25");
    await say("time meditate 5am");
    await say("time meditate default");
    await say("time read off");
    await say("time 25");
    await say("time 10pm");
    await say("habits");
    await say("time off");
    await say("habits");
    await say("delete polls on");
    await say("delete polls off");
    await say("simple on");
    await say("Meditate!");
    await say("simple off");
    await say("meditate");
    await say("days gym tue thu");
    await say("days nothing tue");
    await say("days gym blah");
    await say("days gym every day");
    await say("stop gym");
    await say("habits");
    await say("what is this");
    const ref = { habitId: await idOf(t, "Meditate"), day: "2026-11-15" };
    await say("yes", { quoted: ref });
    await say("no", { quoted: ref });
    await say("maybe", { quoted: ref });
    // The test kit answers "help" itself; this is the plugin's own answer to it.
    await d.step("owner: help (straight to the plugin)", async () => habits.onMessage!({ text: "help", quotedRef: null, group: null, sender: { id: "owner", name: "Test Person", owner: true, profile: true } }, t.kit));
    for (const emoji of ["✅", "❌", "🎉", null]) await d.step(`owner reacts ${emoji} to an old check-in`, () => t.react(habits, emoji, ref));
    expect(d.log).toMatchSnapshot();
  });

  it("the person's own plain sentences", async () => {
    const d = drive();
    const { t, say, mean } = d;
    await mean("log_done", "I did it");
    await mean("set_me_up", "set me up");
    await mean("help", "how does this work");
    await mean("list", "how am I doing");
    await mean("add_habit", "I want to start a habit");
    await mean("add_habit", "I want to run every day at 6am");
    await mean("add_habit", "help me meditate on weekdays");
    await mean("list", "how am I doing");
    await mean("default_time", "stop the check-ins");
    await mean("default_time", "change when you ask me");
    await mean("default_time", "ask me at 8pm");
    await mean("log_done", "I did it");
    const run = await idOf(t, "Run");
    await mean("log_done", "I did it", { target: run });
    await mean("log_done", "finished my meditate for today");
    await mean("missed", "no run today", { target: run });
    await mean("undo_done", "oops not meditate");
    await mean("set_days", "change the days for run");
    await mean("set_days", "run on weekends only");
    await mean("set_time", "change the time for run");
    await mean("set_time", "run at 7am");
    await mean("set_time", "run back to the usual time");
    await mean("list", "how am I doing");
    await mean("remove_habit", "I don't want run any more");
    await say("habits");
    expect(d.log).toMatchSnapshot();
  });

  it("the daily check-in and its answers", async () => {
    const d = drive();
    const { t, say, tick, vote } = d;
    await say("add meditate");
    await say("add read at 7am");
    await say("add gym on tue thu");
    await tick();
    const med = await idOf(t, "Meditate");
    await vote("Meditate", { habitId: med, day: "2026-11-09" }, 0);
    await vote("Meditate", { habitId: med, day: "2026-11-09" }, 1);
    await vote("Meditate", { habitId: med, day: "2026-11-09" }, 0);
    // Tuesday: Read alone in the morning, then Meditate and Gym together in the evening.
    t.setHour(6);
    t.setToday("2026-11-10");
    await tick();
    t.setHour(20);
    await tick();
    const evening = () => lastAsk(t, (r) => Array.isArray(r.ids));
    await vote("the evening poll", evening(), [0, 1]);
    await vote("the evening poll", evening(), [1]);
    await vote("the evening poll", evening(), []);
    t.setToday("2026-11-11");
    await say("simple on");
    await tick();
    await say("delete polls on");
    t.setToday("2026-11-12");
    await tick();
    await vote("the evening poll", evening(), [0]);
    await say("simple off");
    t.setToday("2026-11-13");
    await tick("nightly");
    await vote("Meditate", { habitId: med, day: "2026-11-13" }, 1);
    expect(d.log).toMatchSnapshot();
  });

  it("friends in the person's own Habits group", async () => {
    const d = drive();
    const { t, say, tick, vote } = d;
    await say("add meditate");
    await say("add gym on mon wed fri at 7am");
    await say("habits", { from: asha });
    await say("done meditate", { from: asha });
    await say("join meditate", { from: anon });
    await say("done meditate", { from: ravi });
    await say("join gym", { from: meera });
    await vote("Asha's offer", { offer: "asha" }, 0, ravi);
    await vote("Asha's offer", { offer: "asha" }, 1, meera);
    await vote("the nameless offer", { offer: "anon" }, 0, ravi);
    await vote("Asha's offer", { offer: "asha" }, 0, asha);
    await vote("the nameless offer", { offer: "anon" }, 1, anon);
    await vote("Meera's offer", { offer: "meera" }, 1, meera);
    await say("set me up", { from: anon });
    await say("hook me up", { from: meera });
    await say("set me up", { from: ravi });
    await say("done meditate");
    await say("habits");
    await say("habits", { from: asha });
    await say("undo meditate", { from: asha });
    await say("leave meditate", { from: asha });
    await say("join meditate", { from: asha });
    await say("done meditate", { from: asha });
    await say("time meditate 7am", { from: asha });
    await say("add meditate", { from: asha });
    await say("make a group", { from: asha });
    await say("what is this", { from: asha });
    await say("add stretch on weekdays at 7am", { from: ravi });
    await say("add yoga", { from: asha });
    await say("time stretch 8am", { from: asha });
    await say("days stretch tue", { from: asha });
    await say("time stretch 25", { from: ravi });
    await say("time stretch 8am", { from: ravi });
    await say("time stretch default", { from: ravi });
    await say("days stretch tue thu", { from: ravi });
    await say("days stretch blah", { from: ravi });
    await say("days nothing tue", { from: ravi });
    await say("time nothing 7am", { from: ravi });
    await say("add ...", { from: asha });
    await say("done nothing", { from: asha });
    await say("undo nothing", { from: asha });
    await say("join nothing", { from: asha });
    await say("leave nothing", { from: asha });
    await say("done yoga", { from: asha });
    await say("undo yoga", { from: asha });
    await say("join stretch", { from: asha });
    await say("leave stretch", { from: asha });
    await say("done yoga");
    await say("time stretch 9am");
    await seed(t, "ghost", "", "Ghost");
    await say("habits");
    await tick();
    // Meditate, and the two that friends added, in one poll for everyone.
    const evening = lastAsk(t, (r) => Array.isArray(r.ids) && r.group === "");
    await vote("the evening poll", evening, [0]);
    await vote("the evening poll", evening, [0, 1], asha);
    await vote("the evening poll", evening, [0], asha);
    await vote("the evening poll", evening, [1, 2], { id: "tara", name: "Tara", owner: false, profile: false });
    t.setToday("2026-11-10");
    await say("simple on");
    await tick();
    await say("habits");
    expect(d.log).toMatchSnapshot();
  });

  it("a friend's plain sentences in the person's own Habits group", async () => {
    const d = drive();
    const { t, say, mean } = d;
    await say("add meditate");
    await mean("set_me_up", "can you set me up", { from: meera });
    await mean("set_me_up", "can you set me up", { from: ravi });
    await mean("list", "how is it going", { from: asha });
    await mean("help", "what can I do here", { from: asha });
    await mean("add_habit", "I want to start a habit", { from: asha });
    await mean("add_habit", "I want to meditate daily", { from: asha });
    await mean("log_done", "did it", { from: asha });
    await mean("add_habit", "I want to track yoga every day at 6am", { from: asha });
    await mean("log_done", "did it", { from: asha });
    await mean("log_done", "did my yoga", { from: asha });
    await mean("missed", "skipped yoga", { from: asha });
    await mean("undo_done", "undo yoga", { from: asha });
    await mean("set_time", "move yoga to 7", { from: asha });
    for (let i = 0; i < 11; i++) await seed(t, `full${i}`, "", `Extra ${i}`);
    await mean("add_habit", "I want to swim", { from: asha });
    await say("add swim", { from: asha });
    expect(d.log).toMatchSnapshot();
  });

  it("making, listing and closing habit groups", async () => {
    const d = drive();
    const { t, say } = d;
    await say("groups");
    await say("new group gym buddies");
    await say("new group gym buddies");
    await say("new group !!!");
    await say("make a pact called Morning runners and early risers");
    await say("add gym", { group: P });
    await say("add run", { group: P });
    await say("add walk", { group: "morning-runners-and-ea" });
    await say("groups");
    await say("close group gym buddies");
    await say("close group nothing");
    await say("pacts");
    await say("new group gym buddies");
    await d.step("an existing group joins", () => t.group(habits, "joined", "x-fam", "Family"));
    await d.step("an existing group with no name joins", () => t.group(habits, "joined", "x-blank", "   "));
    await say("groups");
    await d.step("an existing group leaves", () => t.group(habits, "left", "x-fam", "Family"));
    await say("close group habits");
    await say("groups");
    await d.step("web: a group with no name", () => t.act(habits, "createPact", { name: "!!!" }));
    await d.step("web: a group that exists", () => t.act(habits, "createPact", { name: "Gym buddies" }));
    for (let i = 0; i < 9; i++) await say(`new group team ${i}`);
    await say("new group one too many");
    await d.step("web: one group too many", () => t.act(habits, "createPact", { name: "One too many" }));
    expect(d.log).toMatchSnapshot();
    expect(d.groups()).toMatchSnapshot();
  });

  it("everyone in a habit group", async () => {
    const d = drive();
    const { t, say, vote } = d;
    const g = { group: P };
    await say("new group gym buddies");
    await say("habits", g);
    await say("add gym", g);
    await say("done gym", { ...g, from: asha });
    await say("add run at 6am on weekdays", { ...g, from: ravi });
    await say("join gym", { ...g, from: anon });
    await say("habits", g);
    await say("standings", { ...g, from: asha });
    await vote("Asha's offer", { offer: "asha" }, 1, anon);
    await vote("the nameless offer", { offer: "anon" }, 1, asha);
    await say("set me up", { ...g, from: asha });
    await say("set me up", { ...g, from: anon });
    await say("set me up", { ...g, from: ravi });
    await say("set me up", g);
    await say("create my own group", { ...g, from: asha });
    await say("what is this", { ...g, from: asha });
    await say("done gym", g);
    await say("done nothing", g);
    await say("undo gym", g);
    await say("undo nothing", g);
    await say("join run", g);
    await say("join nothing", g);
    await say("leave run", g);
    await say("leave nothing", g);
    await say("time run 7am", { ...g, from: asha });
    await say("days run tue", { ...g, from: asha });
    await say("time run 25", { ...g, from: ravi });
    await say("time run 8am", { ...g, from: ravi });
    await say("time run default", g);
    await say("time nothing 7am", g);
    await say("days run tue thu", g);
    await say("days nothing tue", g);
    await say("days run blah", g);
    await say("add ...", g);
    await say("add gym", { ...g, from: meera });
    await seed(t, "ghost", P, "Ghost");
    await say("habits", g);
    for (let i = 0; i < 9; i++) await seed(t, `full${i}`, P, `Extra ${i}`);
    await say("add swim", g);
    const open = d.groups();
    await say("close group gym buddies");
    await say("habits", g);
    expect(d.log).toMatchSnapshot();
    expect(open).toMatchSnapshot();
  });

  it("plain sentences in a habit group", async () => {
    const d = drive();
    const { t, say, mean } = d;
    const g = { group: P };
    await say("new group gym buddies");
    await mean("log_done", "did it", { ...g, from: asha });
    await mean("set_me_up", "set me up please", { ...g, from: asha });
    await mean("set_me_up", "set me up please", g);
    await mean("add_habit", "I want to start a habit", { ...g, from: asha });
    await mean("add_habit", "I want to go to the gym on weekdays at 7am", { ...g, from: asha });
    await mean("log_done", "did it", { ...g, from: meera });
    await mean("add_habit", "let's read every day", g);
    await mean("log_done", "did it", g);
    await mean("log_done", "I did read", g);
    await mean("missed", "no gym for me", { ...g, from: ravi });
    await mean("undo_done", "not read, sorry", g);
    await mean("list", "who is ahead", g);
    await mean("help", "what can I say", { ...g, from: ravi });
    for (let i = 0; i < 10; i++) await seed(t, `full${i}`, P, `Extra ${i}`);
    await mean("add_habit", "I want to swim", g);
    expect(d.log).toMatchSnapshot();
  });

  it("a habit group's daily check-in, its answers and the profile offer", async () => {
    const d = drive();
    const { t, say, tick, vote } = d;
    const g = { group: P };
    await say("new group gym buddies");
    await say("add gym", g);
    await say("add run on tue thu at 6am", g);
    await tick();
    const gym = lastAsk(t, (r) => r.pact === P);
    await vote("Gym", gym, 0);
    await vote("Gym", gym, 0, asha);
    await vote("Gym", gym, 1, anon);
    await vote("Gym", gym, 0, ravi);
    await vote("Asha's offer", { offer: "asha" }, 0, ravi);
    await vote("Asha's offer", { offer: "asha" }, 0, anon);
    await vote("the nameless offer", { offer: "anon" }, 1, ravi);
    await vote("Asha's offer", { offer: "asha" }, 0, asha);
    await vote("the nameless offer", { offer: "anon" }, 0, anon);
    await vote("Gym", gym, 0, meera);
    await vote("Meera's offer", { offer: "meera" }, 1, meera);
    t.setToday("2026-11-10");
    t.setHour(6);
    await tick();
    t.setHour(20);
    await tick();
    // A crowd: the standings stop where the poll's 255 characters do.
    for (let i = 1; i <= 14; i++) await say("join gym", { ...g, from: { id: `p${i}`, name: `Participant${String(i).padStart(2, "0")} Surname`, owner: false, profile: true } });
    t.setToday("2026-11-11");
    await tick("nightly");
    // Two habits due in the evening: one poll for the group, where everyone ticks what they did.
    await say("add plank", { ...g, from: asha });
    t.setToday("2026-11-12");
    await tick();
    const both = lastAsk(t, (r) => Array.isArray(r.ids) && r.group === P);
    await vote("the group's evening poll", both, [0, 1], asha);
    await vote("the group's evening poll", both, [1], asha);
    await vote("the group's evening poll", both, [0]);
    await vote("the group's evening poll", both, [0], { id: "tara", name: "Tara", owner: false, profile: false });
    await say("habits", g);
    expect(d.log).toMatchSnapshot();
  });

  it("a Habits group where only friends have habits", async () => {
    const d = drive();
    const { t, say, tick } = d;
    await say("add yoga at 6am", { from: ravi });
    await say("habits");
    await say("time off");
    await say("habits", { from: ravi });
    await tick("nightly");
    t.setToday("2026-11-10");
    t.setHour(6);
    await tick();
    expect(d.log).toMatchSnapshot();
  });

  it("a crowd in the person's own habit, and an owner without a name", async () => {
    const d = drive({ person: { name: null, timezone: "Asia/Kolkata" } });
    const { t, say, tick, mean } = d;
    await say("add meditate");
    await say("done meditate", { from: asha });
    await say("time meditate 7am", { from: asha });
    await say("add yoga", { from: ravi });
    await say("time yoga 7am", { from: asha });
    await say("days yoga tue", { from: asha });
    await say("habits");
    await tick();
    await mean("list", "how is it going", { from: asha });
    for (let i = 1; i <= 14; i++) await say("join meditate", { from: { id: `p${i}`, name: `Participant${String(i).padStart(2, "0")} Surname`, owner: false, profile: true } });
    t.setToday("2026-11-10");
    await tick();
    await say("simple on");
    t.setToday("2026-11-11");
    await tick();
    await say("habits");
    expect(d.log).toMatchSnapshot();
  });
});
