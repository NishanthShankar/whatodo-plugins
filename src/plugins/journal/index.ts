/**
 * Journal: write in WhatsApp, read on the web, and nobody but the person can open it.
 *
 * It has the "vault" permission: every message in its group is locked on arrival, and this
 * plugin is told only that an entry arrived, was edited or was removed. It never sees a word.
 * What it does with that: count entries per day, keep the streak, and ask "How was today?" in
 * the evening if the person turned that on. Who holds the key, and every word about it, is
 * Zelfred's business, not this plugin's.
 *
 * Data:
 *   days    key = "YYYY-MM-DD"   data = number of entries that day   sort = the day
 *   state   key = "streak"       data = the longest streak already announced
 *           (key "first" is left over from 1.0.0 and no longer read)
 */
import { definePlugin, type Json, type Kit } from "../../sdk";
import { copy } from "./copy";

/** A streak is announced when it reaches one of these, once each. */
const MILESTONES = [7, 30, 100, 365];

async function dayCount(kit: Kit, day: string): Promise<number> {
  return (await kit.store.get<number>("days", day)) ?? 0;
}

/** Days in a row with an entry, ending on `today` (or yesterday, if nothing is written yet today). */
export function streakOf(days: Set<string>, today: string, shiftDay: (day: string, n: number) => string): number {
  let day = days.has(today) ? today : shiftDay(today, -1);
  let n = 0;
  while (days.has(day)) {
    n++;
    day = shiftDay(day, -1);
  }
  return n;
}

/** The longest run of days in a row, ever. */
export function bestOf(days: string[], shiftDay: (day: string, n: number) => string): number {
  const have = new Set(days);
  let best = 0;
  for (const d of days) {
    if (have.has(shiftDay(d, -1))) continue; // not the start of a run
    let n = 0;
    for (let x = d; have.has(x); x = shiftDay(x, 1)) n++;
    best = Math.max(best, n);
  }
  return best;
}

async function allDays(kit: Kit): Promise<{ day: string; n: number }[]> {
  return (await kit.store.list<number>("days")).map((r) => ({ day: r.key, n: r.data })).filter((r) => r.n > 0);
}

export default definePlugin({
  id: "journal",
  version: "1.2.1",
  sdk: "1",
  name: "Journal",
  icon: "📓",
  tagline: "An encrypted journal you write in WhatsApp. Lock it and only you can open it.",
  description:
    "Every message in its WhatsApp group becomes a journal entry: words, photos, voice notes. Each one is locked as it arrives, and once you lock the journal with a key of your own nobody but you can open it, Zelfred included. Reading, searching and editing happen on the web page, after unlocking.",
  groupName: copy.groupName(),
  price: 0,
  // Photos, voice notes and video are kept, which is what costs.
  tier: 2,
  // "vault": what is written is locked on arrival and never reaches this plugin.
  // "lock-members": the journal is one person's, so nobody else is brought into the group.
  permissions: ["vault", "lock-members"],
  listing: {
    title: "Encrypted Private Journal on WhatsApp | Zelfred",
    description: "Write your journal in WhatsApp and read it on the web. Encrypted with a key only you hold once you lock it, so nobody else can read it. Photos too.",
    h1: "A private journal you write in WhatsApp",
  },
  welcome: copy.welcome(),
  // Never sent: nothing typed in a vault group is read, "help" included. The pinned welcome does its job.
  help: copy.welcome(),
  settings: {
    /** The local hour (0-23) of the evening prompt; null: no prompt. */
    promptHour: null,
  },
  schedules: [{ id: "prompt", hour: { setting: "promptHour" } }],

  async onEntry(event, kit) {
    const day = kit.time.day(event.at);
    if (event.change === "edited") return;
    if (event.change === "removed") {
      const n = (await dayCount(kit, day)) - 1;
      if (n > 0) await kit.store.put("days", day, n, day);
      else await kit.store.delete("days", day);
      return;
    }
    await kit.store.put("days", day, (await dayCount(kit, day)) + 1, day);
    // Nothing is said about an entry written on the page: there is no message to answer.
    if (event.source !== "whatsapp") return;
    const days = new Set((await allDays(kit)).map((d) => d.day));
    const streak = streakOf(days, kit.today, kit.time.shiftDay);
    const said = (await kit.store.get<number>("state", "streak")) ?? 0;
    // Only on the entry that completes the day, and only the first time this length is reached.
    if (day === kit.today && (await dayCount(kit, day)) === 1 && MILESTONES.includes(streak) && streak > said) {
      await kit.store.put("state", "streak", streak);
      kit.send(copy.streak({ days: streak }));
    }
  },

  async onSchedule(event, kit) {
    if (event.id !== "prompt") return;
    // Already wrote today: nothing to ask.
    if ((await dayCount(kit, kit.today)) > 0) return;
    kit.send(copy.prompt());
  },

  web: {
    /** Only what this plugin knows: how many entries on which days. The entries themselves never pass through here. */
    async load(kit) {
      const days = await allDays(kit);
      const set = new Set(days.map((d) => d.day));
      return {
        today: kit.today,
        days: Object.fromEntries(days.map((d) => [d.day, d.n])),
        total: days.reduce((sum, d) => sum + d.n, 0),
        streak: streakOf(set, kit.today, kit.time.shiftDay),
        best: bestOf([...set], kit.time.shiftDay),
        promptHour: (kit.settings.promptHour as number | null) ?? null,
      } as Json;
    },
    actions: {
      /** The evening prompt: an hour (0-23) turns it on, null turns it off. */
      async setPromptHour(kit, { hour }) {
        if (hour === null || hour === undefined || hour === "") return void (await kit.setSettings({ promptHour: null }));
        const h = Number(hour);
        if (!Number.isInteger(h) || h < 0 || h > 23) throw new Error("Pick an hour between 0 and 23.");
        await kit.setSettings({ promptHour: h });
      },
    },
  },
});
