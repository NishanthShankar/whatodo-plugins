import { describe, expect, it } from "vitest";
import habits from "..";
import type { Json, Kit, StoredItem } from "../../../sdk";
import { shiftDay } from "../streaks";

/** An in-memory kit, the way whatodo runs a plugin. */
const currentHour = { value: 21 };

function fakeKit(today = "2026-11-15") {
  currentHour.value = 21;
  const data = new Map<string, { data: Json; sort: string | number | null }>();
  const sent: { text: string; ref?: Json }[] = [];
  const reactions: string[] = [];
  let n = 0;
  const kit: Kit = {
    now: Date.parse(`${today}T15:30:00Z`),
    today,
    person: { name: "Asha", timezone: "Asia/Kolkata" },
    settings: { checkinHour: 21 },
    async setSettings(p) {
      Object.assign(kit.settings, p);
    },
    store: {
      async get(c, k) {
        return (data.get(`${c}/${k}`)?.data ?? null) as never;
      },
      async put(c, k, d, sort) {
        data.set(`${c}/${k}`, { data: d, sort: sort ?? null });
      },
      async delete(c, k) {
        data.delete(`${c}/${k}`);
      },
      async list(c, opts = {}) {
        const out: StoredItem<never>[] = [];
        for (const [key, v] of data) {
          if (!key.startsWith(`${c}/`)) continue;
          const k = key.slice(c.length + 1);
          if (opts.prefix && !k.startsWith(opts.prefix)) continue;
          out.push({ key: k, data: v.data as never, sort: v.sort });
        }
        return out;
      },
    },
    send(text, o) {
      sent.push({ text, ref: o?.ref });
    },
    react(e) {
      reactions.push(e);
    },
    id: () => `h${++n}`,
    time: { day: () => today, shiftDay, hour: () => currentHour.value },
  };
  return { kit, sent, reactions };
}

describe("habits plugin", () => {
  it("adds, logs, and shows streaks", async () => {
    const { kit, sent, reactions } = fakeKit();
    await habits.onMessage!({ text: "add meditate", quotedRef: null }, kit);
    await habits.onMessage!({ text: "done meditate", quotedRef: null }, kit);
    expect(reactions).toEqual(["👍", "✅"]);
    await habits.onMessage!({ text: "habits", quotedRef: null }, kit);
    expect(sent.at(-1)!.text).toContain("*Meditate*  🔥 1");
    expect(sent.at(-1)!.text).toContain("🟩");
  });

  it("checks in nightly and logs from a reaction", async () => {
    const { kit, sent } = fakeKit();
    await habits.onMessage!({ text: "add read", quotedRef: null }, kit);
    await habits.onSchedule!({ id: "checkin" }, kit);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("Did you *Read* today?");
    await habits.onReaction!({ emoji: "👍", ref: sent[0].ref! }, kit);
    const page = (await habits.web!.load(kit, {})) as { habits: { streak: number }[] };
    expect(page.habits[0].streak).toBe(1);
    await habits.onReaction!({ emoji: null, ref: sent[0].ref! }, kit);
    expect(((await habits.web!.load(kit, {})) as { habits: { streak: number }[] }).habits[0].streak).toBe(0);
    // Logged habits are skipped the next time
    await habits.onMessage!({ text: "done read", quotedRef: null }, kit);
    await habits.onSchedule!({ id: "checkin" }, kit);
    expect(sent).toHaveLength(1);
  });

  it("asks each habit at its own time, else the default", async () => {
    const { kit, sent } = fakeKit();
    await habits.onMessage!({ text: "add meditate at 7am", quotedRef: null }, kit);
    await habits.onMessage!({ text: "add read", quotedRef: null }, kit);
    currentHour.value = 7;
    await habits.onSchedule!({ id: "checkin" }, kit);
    expect(sent.map((s) => s.text.match(/\*(.+?)\*/)![1])).toEqual(["Meditate"]);
    currentHour.value = 21;
    await habits.onSchedule!({ id: "checkin" }, kit);
    expect(sent.map((s) => s.text.match(/\*(.+?)\*/)![1])).toEqual(["Meditate", "Read"]);
    await habits.onMessage!({ text: "time read 6am", quotedRef: null }, kit);
    await habits.onMessage!({ text: "time meditate default", quotedRef: null }, kit);
    const page = (await habits.web!.load(kit, {})) as { habits: { name: string; hour: number | null }[] };
    expect(page.habits.map((h) => [h.name, h.hour])).toEqual([["Meditate", null], ["Read", 6]]);
    await habits.onMessage!({ text: "habits", quotedRef: null }, kit);
    expect(sent.at(-1)!.text).toContain("*Read*  ⏰ 6am");
  });

  it("changes the check-in time", async () => {
    const { kit } = fakeKit();
    await habits.onMessage!({ text: "time 10pm", quotedRef: null }, kit);
    expect(kit.settings.checkinHour).toBe(22);
    await habits.onMessage!({ text: "time off", quotedRef: null }, kit);
    expect(kit.settings.checkinHour).toBe(null);
  });
});
