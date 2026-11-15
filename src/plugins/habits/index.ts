import { definePlugin, type Kit } from "../../sdk";
import { bestStreak, cleanName, grid, streak } from "./streaks";

/**
 * Habits: one message per habit every night; react ✅ or 👍 if you did it.
 *
 * Storage
 *   habits  key = habit id   data = { name, createdDay, archived }   sort = createdAt
 *   logs    key = "<habitId>:<day>"   data = 1   sort = day
 */

interface Habit {
  name: string;
  createdDay: string;
  archived: boolean;
}

interface PromptRef {
  habitId: string;
  day: string;
}

const DONE = new Set(["✅", "✔️", "☑️", "👍", "💪", "🔥"]);

async function active(kit: Kit): Promise<{ id: string; habit: Habit }[]> {
  const all = await kit.store.list<Habit>("habits");
  return all.filter((h) => !h.data.archived).map((h) => ({ id: h.key, habit: h.data }));
}

async function doneDays(kit: Kit, habitId: string): Promise<Set<string>> {
  const logs = await kit.store.list("logs", { prefix: `${habitId}:` });
  return new Set(logs.map((l) => l.key.slice(habitId.length + 1)));
}

async function setDone(kit: Kit, habitId: string, day: string, done: boolean) {
  if (done) await kit.store.put("logs", `${habitId}:${day}`, 1, day);
  else await kit.store.delete("logs", `${habitId}:${day}`);
}

function find(list: { id: string; habit: Habit }[], which: string) {
  const n = Number(which.replace(/^#/, ""));
  if (Number.isInteger(n) && n >= 1 && n <= list.length) return list[n - 1];
  const w = which.toLowerCase();
  return (
    list.find((h) => h.habit.name.toLowerCase() === w) ??
    list.find((h) => h.habit.name.toLowerCase().startsWith(w)) ??
    list.find((h) => h.habit.name.toLowerCase().includes(w))
  );
}

function hourLabel(h: number) {
  return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;
}

function to24(h: number, ampm?: string): number | null {
  if (h > 23) return null;
  if (!ampm) return h;
  if (h < 1 || h > 12) return null;
  return ampm.startsWith("p") ? (h % 12) + 12 : h % 12;
}

async function summary(kit: Kit): Promise<string> {
  const list = await active(kit);
  if (!list.length) return "No habits yet. Add one: _add meditate_";
  const lines = ["*Your habits* (last 14 days)"];
  for (const [i, { id, habit }] of list.entries()) {
    const done = await doneDays(kit, id);
    const s = streak(done, kit.today);
    lines.push("", `${i + 1}. *${habit.name}*${s ? `  🔥 ${s}` : ""}`, grid(done, kit.today, 14, habit.createdDay));
  }
  const hour = kit.settings.checkinHour;
  lines.push("", typeof hour === "number" ? `_I'll ask at ${hourLabel(hour)} every night._` : "_Nightly check-ins are off. Send time 9pm to turn them on._");
  return lines.join("\n");
}

const HELP = [
  "*Habits*",
  "",
  "_add meditate_ starts a habit",
  "_habits_ shows your streaks",
  "_done meditate_ logs it for today, _undo meditate_ takes it back",
  "_stop meditate_ stops tracking it",
  "_time 10pm_ changes when I check in, _time off_ stops the check-ins",
  "",
  "Every night I send one message per habit. React ✅ or 👍 if you did it.",
].join("\n");

export default definePlugin({
  id: "habits",
  name: "Habits",
  icon: "🌱",
  tagline: "Build habits with a nightly check-in and streaks.",
  description:
    "Add the habits you want to keep. Every night I message you once per habit; react ✅ or 👍 if you did it. Your streaks show as green squares, and the web page shows the last month.",
  groupName: "🌱 Habits",
  price: 0,
  welcome: "🌱 You've installed *Habits*.\n\nStart with _add meditate_ (or any habit). Every night I'll ask about each one; react ✅ or 👍 if you did it.\n\nSend _help_ any time.",
  help: HELP,
  settings: { checkinHour: 21 },
  schedules: [{ id: "nightly", hour: { setting: "checkinHour" } }],

  async onMessage(event, kit) {
    const text = event.text.trim();
    const lower = text.toLowerCase();

    // A reply to a check-in: yes / no
    const ref = event.quotedRef as PromptRef | null;
    if (ref && typeof ref === "object" && "habitId" in ref) {
      const yes = /^(y|yes|yep|yeah|done|did it|did|ok|✅|👍|💪|🔥)[!. ]*$/i.test(lower);
      const no = /^(n|no|nope|nah|skip|skipped|missed|not today|❌|👎)[!. ]*$/i.test(lower);
      if (yes || no) {
        await setDone(kit, ref.habitId, ref.day, yes);
        kit.react(yes ? "✅" : "👍");
        return;
      }
    }

    if (/^(help|\?|menu|commands)$/i.test(lower)) return kit.send(HELP);
    if (/^(habits|list|streaks?|show|my habits|status)$/i.test(lower)) return kit.send(await summary(kit));

    const time = lower.match(/^(?:time|check[- ]?in|reminder)\s+(?:at\s+)?(off|none|stop|(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?)$/);
    if (time) {
      const hour = time[2] ? to24(+time[2], time[4]) : null;
      if (time[2] && hour === null) return kit.send("Give me a time like _time 10pm_.");
      await kit.setSettings({ checkinHour: hour });
      return kit.react("👍");
    }

    const list = await active(kit);
    let m = text.match(/^(?:done|did|logged?|✅)\s+(.+)$/i);
    if (m) {
      const h = find(list, m[1].trim());
      if (!h) return kit.send(`I can't find "${m[1].trim()}". Send _habits_ to see them.`);
      await setDone(kit, h.id, kit.today, true);
      return kit.react("✅");
    }
    m = text.match(/^(?:undo|undone|not done)\s+(.+)$/i);
    if (m) {
      const h = find(list, m[1].trim());
      if (!h) return kit.send(`I can't find "${m[1].trim()}". Send _habits_ to see them.`);
      await setDone(kit, h.id, kit.today, false);
      return kit.react("👍");
    }
    m = text.match(/^(?:stop|remove|delete|drop|quit|end)\s+(?:habit\s+)?(.+)$/i);
    if (m) {
      const h = find(list, m[1].trim());
      if (!h) return kit.send(`I can't find "${m[1].trim()}". Send _habits_ to see them.`);
      await kit.store.put("habits", h.id, { ...h.habit, archived: true });
      return kit.react("👍");
    }
    m = text.match(/^(?:add|new|start|track|habit)\s*:?\s+(.+)$/i);
    if (m) {
      const name = cleanName(m[1]);
      if (!name) return kit.send("Name the habit, like _add meditate_.");
      if (!list.some((h) => h.habit.name.toLowerCase() === name.toLowerCase())) {
        await kit.store.put("habits", kit.id(), { name, createdDay: kit.today, archived: false }, kit.now);
      }
      return kit.react("👍");
    }
    kit.send("I didn't get that. Send _help_ to see what I can do.");
  },

  async onReaction(event, kit) {
    const ref = event.ref as PromptRef | null;
    if (!ref || typeof ref !== "object" || !("habitId" in ref)) return;
    await setDone(kit, ref.habitId, ref.day, !!event.emoji && DONE.has(event.emoji));
  },

  async onSchedule(event, kit) {
    if (event.id !== "nightly") return;
    for (const { id, habit } of await active(kit)) {
      const done = await doneDays(kit, id);
      if (done.has(kit.today)) continue;
      const s = streak(done, kit.today);
      kit.send(`🌙 Did you *${habit.name}* today?\n${grid(done, kit.today, 7, habit.createdDay)}${s ? `  🔥 ${s}` : ""}\n\n_React ✅ or 👍 if you did._`, {
        ref: { habitId: id, day: kit.today },
      });
    }
  },

  web: {
    lockable: true,
    async load(kit, args) {
      const days = Math.min(Math.max(Number(args.days ?? 30) || 30, 7), 120);
      const out = [];
      for (const { id, habit } of await active(kit)) {
        const all = await doneDays(kit, id);
        const from = kit.time.shiftDay(kit.today, -(days - 1));
        out.push({
          id,
          name: habit.name,
          createdDay: habit.createdDay,
          streak: streak(all, kit.today),
          best: bestStreak(all),
          total: all.size,
          doneDays: [...all].filter((d) => d >= from).sort(),
        });
      }
      const hour = kit.settings.checkinHour;
      return { today: kit.today, timezone: kit.person.timezone, habitHour: typeof hour === "number" ? hour : null, habits: out };
    },
    actions: {
      async create(kit, { name }) {
        const clean = cleanName(String(name ?? ""));
        if (!clean) throw new Error("Name the habit.");
        const id = kit.id();
        await kit.store.put("habits", id, { name: clean, createdDay: kit.today, archived: false }, kit.now);
        return id;
      },
      async rename(kit, { id, name }) {
        const h = await kit.store.get<Habit>("habits", String(id));
        const clean = cleanName(String(name ?? ""));
        if (h && clean) await kit.store.put("habits", String(id), { ...h, name: clean });
      },
      async archive(kit, { id }) {
        const h = await kit.store.get<Habit>("habits", String(id));
        if (h) await kit.store.put("habits", String(id), { ...h, archived: true });
      },
      async setDay(kit, { id, day, done }) {
        const d = String(day);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > kit.today) throw new Error("Pick a day up to today.");
        if (!(await kit.store.get("habits", String(id)))) throw new Error("No such habit.");
        await setDone(kit, String(id), d, !!done);
      },
      async setHour(kit, { hour }) {
        const h = hour === null ? null : Number(hour);
        if (h !== null && (!Number.isInteger(h) || h < 0 || h > 23)) throw new Error("Pick an hour.");
        await kit.setSettings({ checkinHour: h });
      },
    },
  },
});
