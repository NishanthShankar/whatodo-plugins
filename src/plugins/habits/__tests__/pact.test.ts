import { describe, expect, it } from "vitest";
import { createTestKit } from "../../../testing";
import habits from "../index";

type T = ReturnType<typeof createTestKit>;
const P = "gym-buddies";
const asha = { id: "asha", name: "Asha Rao", owner: false, profile: false };
const ravi = { id: "ravi", name: "Ravi", owner: false, profile: true };

async function pact(t: T) {
  await t.message(habits, "new pact Gym Buddies");
  await t.message(habits, "add gym", null, P);
  t.sent.length = 0;
  t.reactions.length = 0;
}
const checkin = (t: T) => t.asked.filter((a) => (a.ref as { habitId?: string })?.habitId).at(-1)!;
const offer = (t: T, id: string) => t.asked.find((a) => (a.ref as { offer?: string })?.offer === id);
const web = async (t: T) => ((await t.load(habits)) as unknown as { pacts: { key: string; name: string; closed: boolean; habits: { name: string; together: number; people: { id: string; name: string | null; streak: number }[] }[] }[] }).pacts;

describe("starting a pact", () => {
  it("makes a group for it, and a habit added there belongs to the pact, not the private list", async () => {
    const t = createTestKit({ hour: 21 });
    await t.message(habits, "new pact Gym Buddies");
    expect(t.groups.get(P)).toMatchObject({ name: "🤝 Gym Buddies" });
    expect(t.sent.at(-1)!.text).toContain("pact *Gym Buddies*");
    await t.message(habits, "add gym", null, P);
    expect(t.reactions.at(-1)).toBe("👍");
    expect(Object.keys(t.dump()).filter((k) => k.startsWith("habits/"))).toHaveLength(0);
    expect((await web(t))[0]).toMatchObject({ key: P, name: "Gym Buddies", habits: [{ name: "Gym", people: [{ id: "owner" }] }] });
  });

  it("lists and closes pacts, and refuses a second of the same name", async () => {
    const t = createTestKit();
    await t.message(habits, "pacts");
    expect(t.sent.at(-1)!.text).toMatch(/No pacts yet/);
    await t.message(habits, "new pact Gym Buddies");
    await t.message(habits, "start a pact called gym buddies");
    expect(t.sent.at(-1)!.text).toMatch(/already have a pact/);
    await t.message(habits, "pacts");
    expect(t.sent.at(-1)!.text).toContain("*Gym Buddies*: 0 habits");
    await t.message(habits, "close pact gym buddies");
    expect(t.groups.has(P)).toBe(false);
    await t.message(habits, "close pact nope");
    expect(t.sent.at(-1)!.text).toMatch(/don't have a pact/);
  });

  it("the private list stays its owner's to change", async () => {
    const t = createTestKit();
    await t.message(habits, "add read", null, null, asha);
    expect(Object.keys(t.dump()).filter((k) => k.startsWith("habits/"))).toHaveLength(0);
    expect(t.sent.at(-1)!.text).toBe("This is Test's list, so only they add or change habits here. You can take part in any of them: just answer its poll.");
  });
});

describe("checking in together", () => {
  it("asks once for the whole group with a poll that stays, and posts nothing per answer", async () => {
    const t = createTestKit({ hour: 21 });
    await pact(t);
    await t.schedule(habits, "checkin");
    const q = checkin(t);
    expect(q).toMatchObject({ question: "🤝 Did you Gym today?  Owner 🔥 0".replace("Owner", "Test"), options: ["Yes", "No"], group: P, keep: true });
    await t.answer(habits, q.ref, 0);
    await t.answer(habits, q.ref, 0, ravi);
    expect(t.sent).toEqual([]);
    expect(t.reactions).toEqual([]);
    const [gym] = (await web(t))[0].habits;
    expect(gym.people.map((p) => [p.id, p.streak])).toEqual([["ravi", 1], ["owner", 1]]);
    expect(gym.together).toBe(1);
  });

  it("the together streak needs everyone, and a No breaks it", async () => {
    const t = createTestKit({ today: "2026-11-10", hour: 21 });
    await pact(t);
    for (const [day, raviSays] of [["2026-11-10", 0], ["2026-11-11", 0], ["2026-11-12", 1], ["2026-11-13", 0]] as const) {
      t.setToday(day);
      await t.schedule(habits, "checkin");
      await t.answer(habits, checkin(t).ref, 0);
      await t.answer(habits, checkin(t).ref, raviSays, ravi);
    }
    const [gym] = (await web(t))[0].habits;
    expect(gym.together).toBe(1);
    expect(gym.people.find((p) => p.id === "owner")!.streak).toBe(4);
    expect(gym.people.find((p) => p.id === "ravi")!.streak).toBe(1);
    // The next poll carries the standings, so nothing extra is sent.
    t.setToday("2026-11-14");
    await t.schedule(habits, "checkin");
    expect(checkin(t).question).toBe("🤝 Did you Gym today?  Together 🔥 1 · Test 🔥 4 · Ravi 🔥 1");
  });

  it("closes yesterday's poll when today's goes out, and an answer can change until then", async () => {
    const t = createTestKit({ today: "2026-11-10", hour: 21 });
    await pact(t);
    await t.schedule(habits, "checkin");
    const first = checkin(t);
    await t.answer(habits, first.ref, 0);
    await t.answer(habits, first.ref, 1);
    expect((await web(t))[0].habits[0].people[0].streak).toBe(0);
    t.setToday("2026-11-11");
    await t.schedule(habits, "checkin");
    expect(first.open).toBe(false);
    await expect(t.answer(habits, first.ref, 0)).rejects.toThrow(/no open question/);
  });

  it("someone silent for a week stops holding the together streak back", async () => {
    const t = createTestKit({ today: "2026-11-01", hour: 21 });
    await pact(t);
    await t.schedule(habits, "checkin");
    await t.answer(habits, checkin(t).ref, 0);
    await t.answer(habits, checkin(t).ref, 0, ravi);
    for (let d = 2; d <= 12; d++) {
      t.setToday(`2026-11-${String(d).padStart(2, "0")}`);
      await t.schedule(habits, "checkin");
      await t.answer(habits, checkin(t).ref, 0);
    }
    expect((await web(t))[0].habits[0].together).toBeGreaterThanOrEqual(3);
  });

  it("asks nothing for a closed pact or a stopped habit", async () => {
    const t = createTestKit({ hour: 21 });
    await pact(t);
    await t.message(habits, "stop gym", null, P);
    await t.schedule(habits, "checkin");
    expect(t.asked).toHaveLength(0);
  });
});

describe("a friend without a profile", () => {
  it("is offered one on their first answer, once, and their streak counts from that answer on a yes", async () => {
    const t = createTestKit({ hour: 21 });
    await pact(t);
    await t.schedule(habits, "checkin");
    await t.answer(habits, checkin(t).ref, 0, asha);
    const o = offer(t, "asha")!;
    expect(o.question).toBe("Asha, you've started forming a habit. Want your own telcurio profile, so I can track your streak too? Tap Yes and I'll set you up. Nothing else to do.");
    expect(o).toMatchObject({ options: ["Yes", "Not now"], group: P, keep: false });
    // Not counted yet.
    expect((await web(t))[0].habits[0].people.map((p) => p.id)).toEqual(["owner"]);
    // Someone else tapping her offer changes nothing.
    await t.answer(habits, o.ref, 0, ravi);
    expect(t.signedUp).toEqual([]);
    await t.answer(habits, o.ref, 0, asha);
    expect(t.signedUp).toEqual(["asha"]);
    expect(t.sent.at(-1)!.text).toBe("Asha, you're set up. I'm keeping your streak from here on.");
    expect(o.open).toBe(false);
    expect((await web(t))[0].habits[0].people.find((p) => p.id === "asha")).toMatchObject({ name: "Asha Rao", streak: 1 });
    // Not asked again.
    await t.answer(habits, checkin(t).ref, 1, asha);
    expect(t.asked.filter((a) => (a.ref as { offer?: string })?.offer === "asha")).toHaveLength(1);
  });

  it("on not now, forgets what they answered and never asks again", async () => {
    const t = createTestKit({ today: "2026-11-10", hour: 21 });
    await pact(t);
    await t.schedule(habits, "checkin");
    await t.answer(habits, checkin(t).ref, 0, asha);
    await t.answer(habits, offer(t, "asha")!.ref, 1, asha);
    expect(t.sent.at(-1)!.text).toBe("No problem, Asha. Just ask me to set it up for you later if you change your mind.");
    expect(Object.keys(t.dump()).filter((k) => k.includes("asha") && !k.startsWith("people/"))).toEqual([]);
    t.setToday("2026-11-11");
    await t.schedule(habits, "checkin");
    await t.answer(habits, checkin(t).ref, 0, asha);
    expect(t.asked.filter((a) => (a.ref as { offer?: string })?.offer === "asha")).toHaveLength(1);
    expect(Object.keys(t.dump()).filter((k) => k.startsWith("plogs/") && k.includes("asha"))).toEqual([]);
    expect(t.signedUp).toEqual([]);
    // "track me" is no longer a way in.
    await t.message(habits, "track me", null, P, asha);
    expect(t.signedUp).toEqual([]);
    // They can ask to be set up later, in a few words or their own.
    await t.message(habits, "Hook me up!", null, P, asha);
    expect(t.signedUp).toEqual(["asha"]);
    expect(t.sent.at(-1)!.text).toBe("Asha, you're set up. I'm keeping your streak from here on.");
  });

  it("understands being asked to set someone up in their own words", async () => {
    const t = createTestKit({ hour: 21 });
    await pact(t);
    await t.intent(habits, "ok can you set it up for me now", "set_me_up", null, 1, asha, P);
    expect(t.signedUp).toEqual(["asha"]);
    // The owner asking in their private group changes nothing.
    await t.intent(habits, "set me up", "set_me_up");
    expect(t.signedUp).toEqual(["asha"]);
  });

  it("someone who already has a profile is counted straight away, with no offer", async () => {
    const t = createTestKit({ hour: 21 });
    await pact(t);
    await t.schedule(habits, "checkin");
    await t.answer(habits, checkin(t).ref, 0, ravi);
    expect(offer(t, "ravi")).toBeUndefined();
    expect((await web(t))[0].habits[0].people.map((p) => p.id)).toContain("ravi");
  });
});

describe("in the pact's group", () => {
  it("anyone can add a habit; only its adder or the pact's owner can stop it", async () => {
    const t = createTestKit();
    await pact(t);
    await t.message(habits, "add study at 7am", null, P, ravi);
    expect((await web(t))[0].habits.map((h) => h.name)).toEqual(["Gym", "Study"]);
    await t.message(habits, "stop gym", null, P, ravi);
    expect(t.sent.at(-1)!.text).toMatch(/Only the person who added \*Gym\*/);
    await t.message(habits, "stop study", null, P);
    expect((await web(t))[0].habits.map((h) => h.name)).toEqual(["Gym"]);
  });

  it("join, leave, done and undo are each person's own", async () => {
    const t = createTestKit();
    await pact(t);
    await t.message(habits, "join gym", null, P, ravi);
    await t.message(habits, "done gym", null, P, ravi);
    expect(t.reactions.at(-1)).toBe("✅");
    let people = (await web(t))[0].habits[0].people;
    expect(people.find((p) => p.id === "ravi")!.streak).toBe(1);
    expect(people.find((p) => p.id === "owner")!.streak).toBe(0);
    await t.message(habits, "undo gym", null, P, ravi);
    await t.message(habits, "leave gym", null, P, ravi);
    people = (await web(t))[0].habits[0].people;
    expect(people.map((p) => p.id)).toEqual(["owner"]);
    await t.message(habits, "done yoga", null, P);
    expect(t.sent.at(-1)!.text).toMatch(/can't find "yoga" in this pact/);
  });

  it("shows how everyone stands", async () => {
    const t = createTestKit();
    await pact(t);
    await t.message(habits, "done gym", null, P);
    await t.message(habits, "done gym", null, P, ravi);
    await t.message(habits, "habits", null, P);
    const text = t.sent.at(-1)!.text;
    expect(text).toContain("🤝 *Gym Buddies*");
    expect(text).toContain("1. *Gym*  Together 🔥 1");
    expect(text).toContain("Ravi  🔥 1");
    expect(t.sent.at(-1)!.group).toBe(P);
  });

  it("reads plain sentences there too", async () => {
    const t = createTestKit();
    await pact(t);
    await t.message(habits, "let us all read more", null, P, ravi);
    expect(t.unsures).toHaveLength(1);
    await t.intent(habits, "I want to start reading every day", "add_habit", null, 1, ravi, P);
    expect((await web(t))[0].habits.map((h) => h.name)).toContain("Reading");
    await t.intent(habits, "finished gym", "log_done", null, 1, ravi, P);
    expect((await web(t))[0].habits[0].people.find((p) => p.id === "ravi")!.streak).toBe(1);
    await t.intent(habits, "how are we doing", "list", null, 1, ravi, P);
    expect(t.sent.at(-1)!.text).toContain("*Gym Buddies*");
  });

  it("the web page can start and close a pact", async () => {
    const t = createTestKit();
    await t.act(habits, "createPact", { name: "Study Group" });
    expect(t.groups.has("study-group")).toBe(true);
    await expect(t.act(habits, "createPact", { name: "study group" })).rejects.toThrow(/already have/);
    await t.act(habits, "closePact", { key: "study-group" });
    expect((await web(t))[0].closed).toBe(true);
  });
});

describe("a friend in the private Habits group", () => {
  const streaks = async (t: T) => ((await t.load(habits)) as unknown as { habits: { streak: number }[] }).habits.map((h) => h.streak);

  it("takes part by answering the check-in, with their own streak, and the poll then stays for everyone", async () => {
    const t = createTestKit({ today: "2026-11-10", hour: 21 });
    await t.message(habits, "add read");
    await t.message(habits, "delete polls on");
    await t.schedule(habits, "checkin");
    const q = t.asked[0];
    expect(q.keep).toBe(false);
    await t.answer(habits, q.ref, 0, ravi);
    // The owner's own streak is untouched by a friend's answer.
    expect(await streaks(t)).toEqual([0]);
    t.setToday("2026-11-11");
    await t.message(habits, "done read");
    await t.schedule(habits, "checkin");
    const next = t.asked.at(-1)!;
    // Asked even though the owner already did it, kept even with delete polls on, and it shows everyone.
    expect(next.keep).toBe(true);
    expect(next.question).toBe("🌱 Did you Read today?  Together 🔥 0 · Ravi 🔥 1 · Test 🔥 1");
    await t.answer(habits, next.ref, 0, ravi);
    await t.message(habits, "habits");
    expect(t.sent.at(-1)!.text).toContain("Together 🔥 1");
    expect(t.sent.at(-1)!.text).toContain("Ravi  🔥 2");
  });

  it("is offered a profile on their first answer there too", async () => {
    const t = createTestKit({ hour: 21 });
    await t.message(habits, "add read");
    await t.schedule(habits, "checkin");
    await t.answer(habits, t.asked[0].ref, 0, asha);
    const o = offer(t, "asha")!;
    expect(o.group).toBeNull();
    await t.answer(habits, o.ref, 1, asha);
    expect(t.sent.at(-1)!.text).toMatch(/^No problem, Asha\./);
  });

  it("can log, undo, join, leave and see the list, in a few words or their own", async () => {
    const t = createTestKit();
    await t.message(habits, "add read");
    await t.message(habits, "done read", null, null, ravi);
    expect(t.reactions.at(-1)).toBe("✅");
    await t.message(habits, "habits", null, null, ravi);
    expect(t.sent.at(-1)!.text).toContain("Ravi  🔥 1");
    await t.message(habits, "undo read", null, null, ravi);
    await t.message(habits, "leave read", null, null, ravi);
    await t.message(habits, "habits", null, null, ravi);
    expect(t.sent.at(-1)!.text).not.toContain("Ravi");
    await t.intent(habits, "finished reading for today", "log_done", null, 1, ravi);
    await t.intent(habits, "how are we doing", "list", null, 1, ravi);
    expect(t.sent.at(-1)!.text).toContain("Ravi  🔥 1");
    await t.intent(habits, "let's add yoga", "add_habit", null, 1, ravi);
    expect(t.sent.at(-1)!.text).toMatch(/^This is Test's list/);
    await t.message(habits, "done yoga", null, null, ravi);
    expect(t.sent.at(-1)!.text).toMatch(/can't find "yoga" here/);
  });

  it("is told to log in before having a group of their own, here and in a pact", async () => {
    const t = createTestKit();
    await pact(t);
    const want = "To have a group of your own, log in at app.whatodo.today and add Habits there. It takes a minute, and then I'll make it for you.";
    await t.message(habits, "new pact study", null, null, ravi);
    expect(t.sent.at(-1)!.text).toBe(want);
    await t.message(habits, "I want to make my own group", null, P, ravi);
    expect(t.sent.at(-1)!.text).toBe(want);
    expect(t.groups.size).toBe(1);
  });

  it("sees only what they take part in on their own page", async () => {
    const t = createTestKit({ hour: 21 });
    await t.message(habits, "add read");
    await t.message(habits, "add walk");
    await pact(t);
    await t.message(habits, "done read", null, null, ravi);
    await t.message(habits, "done gym", null, P, ravi);
    await t.message(habits, "done gym", null, P);
    const page = (await t.loadFor(habits, ravi)) as unknown as { groups: { key: string | null; name: string; habits: { name: string; streak: number; together: number; people: { name: string | null; me: boolean; streak: number }[] }[] }[] };
    expect(page.groups.map((g) => [g.key, g.name, g.habits.map((h) => h.name)])).toEqual([
      [null, "Test's habits", ["Read"]],
      [P, "Gym Buddies", ["Gym"]],
    ]);
    expect(page.groups[1].habits[0]).toMatchObject({ streak: 1, together: 1 });
    expect(page.groups[1].habits[0].people.find((p) => p.me)).toMatchObject({ name: null, streak: 1 });
    // Someone who takes part in nothing sees nothing.
    expect(((await t.loadFor(habits, asha)) as unknown as { groups: unknown[] }).groups).toEqual([]);
  });
});
