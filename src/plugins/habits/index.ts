import { definePlugin, type Kit } from "../../sdk";
import { CHECKIN_OPTIONS, copy, LOGGED, SAVED, type OwnHabit } from "./copy";
import { closePact, createPact, existingGroup, extraHabits, ownerChange, ownerDay, ownerJoin, forFriend, forPoll, friendAnswer, friendIntent, friendMessage, hasFriends, isOfferRef, isPactRef, OWNER, ownerOnExtra, pactAnswer, pactCheckins, pactIntent, pactMessage, pactsForWeb, POLL_LIMIT, privatePact, standings, type Tools } from "./pact";
import { bestStreak, cells, cleanName, isOn, parseDays, scanDays, streak } from "./streaks";

/**
 * Habits: one poll per habit every day: tap Yes if you did it, No if you didn't. The poll stays
 * and the answer can be changed until that habit's next check-in goes out.
 *
 * Storage
 *   habits  key = habit id   data = { name, createdDay, archived, hour?, days? }   sort = createdAt
 *   logs    key = "<habitId>:<day>"   data = 1   sort = day   (did it)
 *   missed  key = "<habitId>:<day>"   data = 1   sort = day   (said they didn't: the day is
 *           closed, it counts like no answer for streaks, and that day isn't asked again)
 *   asked   key = habit id   data = the day of its latest check-in   sort = that day
 */

interface Habit {
  name: string;
  createdDay: string;
  archived: boolean;
  /** Its own check-in hour (0-23). Unset: the default check-in time. */
  hour?: number | null;
  /** Weekdays it's due on, 0 Sunday to 6 Saturday. Unset or null: every day. */
  days?: number[] | null;
}

interface PromptRef {
  habitId: string;
  day: string;
}

/** How many days the summary's grid goes back. */
const SUMMARY_DAYS = 14;

const DONE = new Set(["✅", "✔️", "☑️", "👍", "💪", "🔥"]);
const MISSED = new Set(["❌", "✖️", "❎", "👎", "🚫"]);

async function active(kit: Kit): Promise<{ id: string; habit: Habit }[]> {
  const all = await kit.store.list<Habit>("habits");
  return all.filter((h) => !h.data.archived).map((h) => ({ id: h.key, habit: h.data }));
}

async function doneDays(kit: Kit, habitId: string): Promise<Set<string>> {
  const logs = await kit.store.list("logs", { prefix: `${habitId}:` });
  return new Set(logs.map((l) => l.key.slice(habitId.length + 1)));
}

type DayState = "done" | "missed" | null;

/** Record a day: did it, said they didn't, or nothing (as if never answered). */
async function setDay(kit: Kit, habitId: string, day: string, state: DayState) {
  const key = `${habitId}:${day}`;
  if (state === "done") await kit.store.put("logs", key, 1, day);
  else await kit.store.delete("logs", key);
  if (state === "missed") await kit.store.put("missed", key, 1, day);
  else await kit.store.delete("missed", key);
}

async function setDone(kit: Kit, habitId: string, day: string, done: boolean) {
  await setDay(kit, habitId, day, done ? "done" : null);
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

function to24(h: number, ampm?: string): number | null {
  if (h > 23) return null;
  if (!ampm) return h;
  if (h < 1 || h > 12) return null;
  return ampm.startsWith("p") ? (h % 12) + 12 : h % 12;
}

const TIME = String.raw`(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?`;

/** "7am", "19:00", "10 pm" → hour, or null when it isn't a time. */
function parseHour(text: string): number | null {
  const m = text.trim().toLowerCase().match(new RegExp(`^${TIME}$`));
  return m ? to24(+m[1], m[3]) : null;
}

/** The hour a habit is checked at: its own, else the default (null: no check-in). */
function hourOf(h: Habit, kit: Kit): number | null {
  if (typeof h.hour === "number") return h.hour;
  const d = kit.settings.checkinHour;
  return typeof d === "number" ? d : null;
}

/** "add gym on mon wed fri at 7am": pulls the trailing time and days off a habit name, in either order. */
function splitAdd(raw: string): { name: string; hour: number | null; days: number[] | null | undefined } {
  let name = raw;
  let hour: number | null = null;
  let days: number[] | null | undefined;
  for (let i = 0; i < 2; i++) {
    const at = name.match(new RegExp(`\\s+(?:at|@|every day at|daily at)\\s+(${TIME})$`, "i"));
    if (at && parseHour(at[1]) !== null && hour === null) {
      hour = parseHour(at[1]);
      name = name.slice(0, at.index);
      continue;
    }
    const on = name.match(/\s+((?:on|every|only on)\s+.+|daily|every ?day|on weekdays|on weekends)$/i);
    if (on && days === undefined) {
      // Shortest tail first would grab too little; try from the earliest "on"/"every" that parses.
      const words = name.split(" ");
      for (let k = 1; k < words.length; k++) {
        if (!/^(?:on|every|only|daily|everyday)$/i.test(words[k])) continue;
        const parsed = parseDays(words.slice(k).join(" "));
        if (parsed !== undefined) {
          days = parsed;
          name = words.slice(0, k).join(" ");
          break;
        }
      }
      if (days !== undefined) continue;
    }
    break;
  }
  return { name, hour, days };
}

/** A time anywhere in a sentence: "at 7", "7am", "19:30", "10 pm". undefined when there's none. */
function scanHour(text: string): number | undefined {
  const t = text.toLowerCase();
  const ampm = t.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/);
  if (ampm) return to24(+ampm[1], ampm[3][0] === "p" ? "pm" : "am") ?? undefined;
  const at = t.match(/\b(?:at|@|by)\s+(\d{1,2})(?:[:.](\d{2}))?\b/);
  if (at) return to24(+at[1]) ?? undefined;
  return undefined;
}

const FILLER = new RegExp(
  "^(?:i(?:\\s+|')(?:want|wanna|would like|would love|d like|d love|need|have|plan|am going|m going)\\s+to|i\\s+will|i'll|help me|can you|could you|please|pls|let'?s|also|just|really|kindly|and|i\\s+want|start(?:ing)?|begin|track(?:ing)?|add|create|make|set up|new|a|an|my|the|habit(?:s)?|of|to|for me|remind me to|going to|go to)(?:\\s+|$)",
  "i",
);

/** The habit's name out of a sentence: drops the asking, the days and the time. */
function habitName(text: string): string {
  let t = text.trim().replace(/[.!?]+$/, "").replace(/:/g, " ");
  // days and times, wherever they are
  t = t.replace(/\s*\b(?:every|each|on|only on)?\s*(?:(?:mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun)(?:day|nesday|rsday|urday|sday)?s?|weekdays?|weekends?)(?:\s*(?:,|and|&|\/)\s*(?:(?:mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun)(?:day|nesday|rsday|urday|sday)?s?|weekdays?|weekends?))*\b/gi, " ");
  t = t.replace(/\s*\b(?:every ?day|daily|each day|every single day)\b/gi, " ");
  t = t.replace(/\s*\b(?:at|@|by|around)\s*\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?(?=\s|$)/gi, " ");
  t = t.replace(/\s*\b\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)(?=\s|$)/gi, " ");
  t = t.replace(/\s*\b(?:in the )?(?:morning|evening|night|afternoon)s?\b/gi, " ");
  t = t.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 8; i++) {
    const next = t.replace(FILLER, "");
    if (next === t) break;
    t = next;
  }
  t = t.replace(/\s+(?:habit|as a habit|regularly|again)$/i, "");
  return cleanName(t);
}

/** The habit a message is about: the model's pick, else one whose name appears in the text. */
function habitFor(list: { id: string; habit: Habit }[], target: string | null, text: string) {
  if (target) {
    const h = list.find((x) => x.id === target);
    if (h) return h;
  }
  const lower = text.toLowerCase();
  const named = list.filter((x) => lower.includes(x.habit.name.toLowerCase()));
  return named.length === 1 ? named[0] : undefined;
}

async function addHabit(kit: Kit, list: { id: string; habit: Habit }[], name: string, hour: number | null, days: number[] | null | undefined) {
  const same = list.find((h) => h.habit.name.toLowerCase() === name.toLowerCase());
  if (same) {
    const patch: Partial<Habit> = {};
    if (hour !== null) patch.hour = hour;
    if (days !== undefined) patch.days = days;
    if (Object.keys(patch).length) await kit.store.put("habits", same.id, { ...same.habit, ...patch });
  } else {
    await kit.store.put("habits", kit.id(), { name, createdDay: kit.today, archived: false, hour, days: days ?? null }, kit.now);
  }
}

async function summary(kit: Kit): Promise<string> {
  const list = await active(kit);
  // Habits friends added in this group come after the owner's own.
  const extra = await extraHabits(kit);
  if (!list.length && !extra.length) return copy.noHabits();
  const habits: OwnHabit[] = [];
  for (const { id, habit } of list) {
    const done = await doneDays(kit, id);
    // Friends taking part in it: everyone's streak, and the days all of them did it.
    const st = (await hasFriends(kit, id)) ? await standings(kit, id, habit.days, { name: kit.person.name, since: habit.createdDay, done }) : null;
    habits.push({
      name: habit.name,
      streak: streak(done, kit.today, habit.days),
      hour: typeof habit.hour === "number" ? habit.hour : null,
      days: habit.days,
      cells: cells(done, kit.today, SUMMARY_DAYS, habit.createdDay, habit.days),
      friends: st && { together: st.together, people: st.people.filter((p) => p.id !== OWNER).map((p) => ({ name: p.name, streak: p.streak })) },
    });
  }
  const hour = kit.settings.checkinHour;
  return copy.summary({ days: SUMMARY_DAYS, habits, extra, checkinHour: typeof hour === "number" ? hour : null });
}

/** One help text for this run: the listing, the "help" command and the help intent all send it. */
const HELP = copy.help();

/** What pacts borrow from the parsing above (pact.ts can't import this file back). */
const TOOLS: Tools = { splitAdd, parseHour, scanHour, habitName };

/** Web input → sorted weekdays, or null for every day. */
function checkDays(days: unknown): number[] | null {
  if (days === null || days === undefined) return null;
  if (!Array.isArray(days) || !days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) throw new Error("Pick days of the week.");
  const set = [...new Set(days as number[])].sort((a, b) => a - b);
  if (!set.length) throw new Error("Pick at least one day.");
  return set.length === 7 ? null : set;
}

export default definePlugin({
  id: "habits",
  version: "3.6.2",
  sdk: "1",
  name: "Habits",
  icon: "🌱",
  tagline: "Build habits with a daily check-in and streaks.",
  description:
    "Add the habits you want to keep, every day or only on the days you pick. On each habit's days you get a poll at the time you pick; tap Yes or No. Your streaks show as green squares, and the web page shows the last month.",
  groupName: copy.groupName(),
  price: 0,
  tier: 1,
  // Pacts: a habit kept with other people, each in its own group ("groups") that friends are
  // added to and answer in ("members"). The private Habits group still hears only its owner.
  permissions: ["groups", "members"],
  listing: {
    title: "Habit Tracker on WhatsApp: Daily Check-ins | Zelfred",
    description:
      "Track habits on WhatsApp. Get a daily check-in, tap Yes or No and watch your streak grow. Free, in its own WhatsApp group. No app.",
    h1: "Habit tracker on WhatsApp",
  },
  welcome: copy.welcome(),
  help: HELP,
  // quickLog ("simple messages"): the check-in is just the habit's name, and a message that is
  // only a habit's name logs it for today. Off unless turned on.
  // deletePolls: the check-in poll is deleted once it is answered, and a line says what was
  // chosen. Off unless turned on: the poll stays and the answer can be changed.
  settings: { checkinHour: 21, quickLog: false, deletePolls: false },
  // Hourly, so each habit can be asked at its own time (the default time otherwise).
  schedules: [{ id: "checkin", hour: "hourly" }],

  async onMessage(event, kit) {
    // A pact's group: everyone there adds and answers. The person's own Habits group: friends
    // they added can take part in their habits, but the list stays theirs to change.
    if (event.group) return pactMessage(event, kit, TOOLS);
    if (event.sender && !event.sender.owner) {
      return friendMessage(event, kit, TOOLS, (await active(kit)).map((h) => ({ id: h.id, name: h.habit.name })), () => summary(kit));
    }
    const text = event.text.trim();
    const lower = text.toLowerCase();

    // A reply to a check-in: yes / no
    const ref = event.quotedRef as PromptRef | null;
    if (ref && typeof ref === "object" && "habitId" in ref) {
      const yes = /^(y|yes|yep|yeah|done|did it|did|ok|✅|👍|💪|🔥)[!. ]*$/i.test(lower);
      const no = /^(n|no|nope|nah|skip|skipped|missed|not today|❌|👎)[!. ]*$/i.test(lower);
      if (yes || no) {
        await setDay(kit, ref.habitId, ref.day, yes ? "done" : "missed");
        kit.react(yes ? LOGGED : SAVED);
        return;
      }
    }

    // "new group gym buddies", "groups", "close group gym buddies"
    if (await privatePact(kit, text, lower.replace(/[!.]+$/, ""))) return;
    // A habit a friend added in this group: the owner can do it, log it, stop it.
    if (await ownerOnExtra(event, kit, TOOLS, (await active(kit)).map((h) => h.habit.name))) return;

    if (/^(help|\?|menu|commands)$/i.test(lower)) return kit.send(HELP);
    if (/^(habits|list|streaks?|show|my habits|status)$/i.test(lower)) return kit.send(await summary(kit));

    // "time meditate 7am" / "time meditate default": one habit's own time
    const own = text.match(new RegExp(`^(?:time|check[- ]?in|reminder)\\s+(.+?)\\s+(?:at\\s+)?(default|reset|off|none|${TIME})$`, "i"));
    if (own && parseHour(own[1]) === null) {
      const list0 = await active(kit);
      const h = find(list0, own[1].trim());
      if (h) {
        const word = own[2].toLowerCase();
        const hour = /^(default|reset)$/.test(word) ? null : /^(off|none)$/.test(word) ? null : parseHour(own[2]);
        if (hour === null && !/^(default|reset|off|none)$/.test(word)) return kit.send(copy.giveHabitTime());
        await kit.store.put("habits", h.id, { ...h.habit, hour });
        return kit.react(SAVED);
      }
    }

    const time = lower.match(/^(?:time|check[- ]?in|reminder)\s+(?:at\s+)?(off|none|stop|(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?)$/);
    if (time) {
      const hour = time[2] ? to24(+time[2], time[4]) : null;
      if (time[2] && hour === null) return kit.send(copy.giveDefaultTime());
      await kit.setSettings({ checkinHour: hour });
      return kit.react(SAVED);
    }

    // "delete polls on" / "delete polls off": whether an answered check-in poll is deleted
    const del = lower.replace(/[!.]+$/, "").match(/^delete (?:the )?polls?(?: after (?:voting|answering|i vote|i answer))?\s+(on|off)$/);
    if (del) {
      await kit.setSettings({ deletePolls: del[1] === "on" });
      return kit.react(SAVED);
    }

    // "simple on" / "simple off" (also "quick log on/off", its first name)
    const quick = lower.replace(/[!.]+$/, "").match(/^(?:quick ?log(?:ging)?|simple(?: messages?)?)\s+(on|off)$/);
    if (quick) {
      await kit.setSettings({ quickLog: quick[1] === "on" });
      return kit.react(SAVED);
    }

    // "days gym mon wed fri" / "days gym weekdays" / "days gym every day"
    const dm = text.match(/^days?\s+(.+)$/i);
    if (dm) {
      const list0 = await active(kit);
      const words = dm[1].trim().split(/\s+/);
      for (let k = 1; k < words.length; k++) {
        const parsed = parseDays(words.slice(k).join(" "));
        if (parsed === undefined) continue;
        const h = find(list0, words.slice(0, k).join(" "));
        if (!h) return kit.send(copy.cantFind({ which: words.slice(0, k).join(" ") }));
        await kit.store.put("habits", h.id, { ...h.habit, days: parsed });
        return kit.react(SAVED);
      }
      return kit.send(copy.tellDays());
    }

    const list = await active(kit);
    let m = text.match(/^(?:done|did|logged?|✅)\s+(.+)$/i);
    if (m) {
      const h = find(list, m[1].trim());
      if (!h) return kit.send(copy.cantFind({ which: m[1].trim() }));
      await setDone(kit, h.id, kit.today, true);
      return kit.react(LOGGED);
    }
    m = text.match(/^(?:undo|undone|not done)\s+(.+)$/i);
    if (m) {
      const h = find(list, m[1].trim());
      if (!h) return kit.send(copy.cantFind({ which: m[1].trim() }));
      await setDone(kit, h.id, kit.today, false);
      return kit.react(SAVED);
    }
    m = text.match(/^(?:stop|remove|delete|drop|quit|end)\s+(?:habit\s+)?(.+)$/i);
    if (m) {
      const h = find(list, m[1].trim());
      if (!h) return kit.send(copy.cantFind({ which: m[1].trim() }));
      await kit.store.put("habits", h.id, { ...h.habit, archived: true });
      return kit.react(SAVED);
    }
    m = text.match(/^(?:add|new|start|track|habit)\s*:?\s+(.+)$/i);
    if (m) {
      // "add read at 10pm": its own check-in time; "add gym on mon wed fri": only those days
      const { name: raw, hour, days } = splitAdd(m[1]);
      const name = cleanName(raw);
      if (!name) return kit.send(copy.nameTheHabit());
      await addHabit(kit, list, name, hour, days);
      return kit.react(SAVED);
    }
    // Quick log: the message is just a habit's name ("meditate", "Gym!").
    if (kit.settings.quickLog === true) {
      const said = lower.replace(/[\s!.✅👍💪🔥]+$/u, "").replace(/\s+/g, " ");
      const h = list.find((x) => x.habit.name.toLowerCase().replace(/\s+/g, " ") === said);
      if (h) {
        await setDone(kit, h.id, kit.today, true);
        return kit.react(LOGGED);
      }
    }
    // Not a command: Zelfred works out what was meant and calls onIntent below.
    kit.unsure(copy.unsure());
  },

  understand: {
    intents: {
      add_habit: "Start tracking a new habit, every day or only on some days of the week, maybe at a set time",
      log_done: "Say they did one of their habits today",
      missed: "Say they did not do one of their habits today",
      undo_done: "Take back a habit they marked done today by mistake",
      remove_habit: "Stop tracking one of their habits",
      set_days: "Change which days of the week one of their habits is on",
      set_time: "Change the time of day one habit's check-in message is sent",
      default_time: "Change the usual check-in time for all habits, or stop the check-ins",
      list: "See their habits, streaks or progress",
      set_me_up: "In a shared pact group: ask to be set up or hooked up with their own profile so their streak is kept, often after saying not now earlier",
      help: "Ask how this works or what they can say",
    },
    async targets(kit) {
      return Object.fromEntries((await active(kit)).map((h) => [h.id, h.habit.name]));
    },
  },

  async onIntent(event, kit) {
    if (event.group) return pactIntent(event, kit, TOOLS);
    if (event.sender && !event.sender.owner) {
      return friendIntent(event, kit, TOOLS, (await active(kit)).map((h) => ({ id: h.id, name: h.habit.name })), () => summary(kit));
    }
    const { text, intent, target } = event;
    const list = await active(kit);
    // Only someone in a pact needs setting up; here it is the owner, who already is.
    if (intent === "set_me_up") return kit.react(SAVED);
    if (intent === "help") return kit.send(HELP);
    if (intent === "list") return kit.send(await summary(kit));
    if (intent === "add_habit") {
      const name = habitName(text);
      if (!name) return kit.send(copy.whatToCallIt());
      await addHabit(kit, list, name, scanHour(text) ?? null, scanDays(text));
      return kit.react(SAVED);
    }
    if (intent === "default_time") {
      if (/\b(?:off|stop|no more|don'?t|pause)\b/i.test(text)) {
        await kit.setSettings({ checkinHour: null });
        return kit.react(SAVED);
      }
      const hour = scanHour(text);
      if (hour === undefined) return kit.send(copy.whatDefaultTime());
      await kit.setSettings({ checkinHour: hour });
      return kit.react(SAVED);
    }

    // The rest are about one habit.
    const h = habitFor(list, target, text);
    if (!h) return kit.send(list.length ? copy.whichHabit() : copy.noHabitsToPick());
    switch (intent) {
      case "log_done":
        await setDay(kit, h.id, kit.today, "done");
        return kit.react(LOGGED);
      case "missed":
        await setDay(kit, h.id, kit.today, "missed");
        return kit.react(SAVED);
      case "undo_done":
        await setDay(kit, h.id, kit.today, null);
        return kit.react(SAVED);
      case "remove_habit":
        await kit.store.put("habits", h.id, { ...h.habit, archived: true });
        return kit.react(SAVED);
      case "set_days": {
        const days = scanDays(text);
        if (days === undefined) return kit.send(copy.whichDaysFor({ habit: h.habit.name }));
        await kit.store.put("habits", h.id, { ...h.habit, days });
        return kit.react(SAVED);
      }
      case "set_time": {
        const back = /\b(?:default|usual|reset)\b/i.test(text);
        const hour = back ? null : scanHour(text);
        if (hour === undefined) return kit.send(copy.whatTimeFor({ habit: h.habit.name }));
        await kit.store.put("habits", h.id, { ...h.habit, hour });
        return kit.react(SAVED);
      }
    }
  },

  async onUpgrade(fromVersion) {
    // 1.0.0 -> 1.1.0: habits gained an optional `hour`; existing rows without it use the
    // default time, and the schedule moved from "nightly" to "checkin". No data to change.
    void fromVersion;
  },

  async onReaction(event, kit) {
    // Reactions answer the private check-ins of before 2.0.0. Pacts are answered on their polls.
    if (event.group || (event.sender && !event.sender.owner)) return;
    const ref = event.ref as PromptRef | null;
    if (!ref || typeof ref !== "object" || !("habitId" in ref)) return;
    const e = event.emoji;
    // ✅ did it, ❌ didn't (closes the day), removed: back to no answer. Anything else counts
    // as not done, as before.
    await setDay(kit, ref.habitId, ref.day, e && DONE.has(e) ? "done" : e && MISSED.has(e) ? "missed" : null);
    // Acknowledge every reaction so the person knows it landed; take it back when theirs goes.
    kit.react(e ? SAVED : "");
  },

  async onGroup(event, kit) {
    await existingGroup(kit, event.kind, event.key, event.name);
  },

  async onAnswer(event, kit) {
    // A tap on a check-in poll: Yes did it, No didn't (closes the day). While the poll stays
    // they can change it, and the latest answer is the one that counts.
    if (isOfferRef(event.ref) || isPactRef(event.ref)) return pactAnswer(event, kit);
    const ref = event.ref as PromptRef | null;
    if (!ref || typeof ref !== "object" || typeof ref.habitId !== "string" || typeof ref.day !== "string") return;
    // A friend in the group answering one of the owner's check-ins: they are doing it too.
    if (event.sender && !event.sender.owner) {
      const h = await kit.store.get<Habit>("habits", ref.habitId);
      if (h && !h.archived) await friendAnswer(event, kit, ref.habitId, ref.day);
      return;
    }
    await setDay(kit, ref.habitId, ref.day, event.choice === 0 ? "done" : "missed");
    // A 👍 on the poll says it landed. Once is enough, and a deleted poll has its own line.
    // With friends in the habit nothing is posted back: the poll shows who answered what.
    if (!event.changed && kit.settings.deletePolls !== true && !(await hasFriends(kit, ref.habitId))) kit.react(SAVED);
  },

  async onSchedule(event, kit) {
    if (event.id !== "checkin" && event.id !== "nightly") return;
    const now = kit.time.hour(kit.now);
    for (const { id, habit } of await active(kit)) {
      if (event.id === "checkin" && hourOf(habit, kit) !== now) continue;
      if (!isOn(habit.days, kit.today)) continue; // not one of its days
      const done = await doneDays(kit, id);
      // With friends taking part the poll goes out even when the owner has answered: it is theirs too.
      const shared = await hasFriends(kit, id);
      if (!shared && done.has(kit.today)) continue;
      if (!shared && (await kit.store.get("missed", `${id}:${kit.today}`))) continue; // they already said no
      const s = streak(done, kit.today, habit.days);
      // This habit's earlier check-in stops taking answers now that a new one goes out.
      const last = await kit.store.get<string>("asked", id);
      if (last && last !== kit.today) kit.close({ habitId: id, day: last });
      await kit.store.put("asked", id, kit.today, kit.today);
      // The streak is on every check-in, a zero included. Simple messages: just the habit's
      // name and the streak.
      const simple = kit.settings.quickLog === true;
      const together = shared ? { habit: habit.name, ...forPoll(await standings(kit, id, habit.days, { name: kit.person.name, since: habit.createdDay, done })), limit: POLL_LIMIT } : null;
      const question = together
        ? simple
          ? copy.checkinTogetherSimple(together)
          : copy.checkinTogether(together)
        : simple
          ? copy.checkinSimple({ habit: habit.name, streak: s })
          : copy.checkin({ habit: habit.name, streak: s });
      kit.ask(question.slice(0, 255), CHECKIN_OPTIONS, {
        ref: { habitId: id, day: kit.today },
        // The poll stays so the answer can be corrected, unless they asked for it to be deleted.
        // With friends it always stays: the poll is how everyone sees who did it.
        keep: shared || kit.settings.deletePolls !== true,
        confirm: copy.checkinConfirm({ habit: habit.name }),
      });
    }
    // Pacts: one poll per due habit, for the whole group.
    await pactCheckins(kit, now, event.id === "nightly");
  },

  web: {
    lockable: true,
    async load(kit, args) {
      const days = Math.min(Math.max(Number(args.days ?? 30) || 30, 7), 120);
      const out = [];
      for (const { id, habit } of await active(kit)) {
        const all = await doneDays(kit, id);
        const from = kit.time.shiftDay(kit.today, -(days - 1));
        // Friends taking part in it: everyone side by side, the owner included, to compare.
        const st = (await hasFriends(kit, id)) ? await standings(kit, id, habit.days, { name: kit.person.name, since: habit.createdDay, done: all }) : null;
        out.push({
          ...(st ? { together: st.together, people: st.people.map((x) => ({ id: x.id, name: x.name, me: x.id === OWNER, streak: x.streak, total: x.total, doneDays: [...x.done].filter((d) => d >= from).sort() })) } : {}),
          id,
          name: habit.name,
          hour: typeof habit.hour === "number" ? habit.hour : null,
          days: habit.days?.length ? habit.days : null,
          createdDay: habit.createdDay,
          streak: streak(all, kit.today, habit.days),
          best: bestStreak(all, habit.days, kit.today),
          total: all.size,
          doneDays: [...all].filter((d) => d >= from).sort(),
        });
      }
      const hour = kit.settings.checkinHour;
      return {
        today: kit.today,
        timezone: kit.person.timezone,
        habitHour: typeof hour === "number" ? hour : null,
        quickLog: kit.settings.quickLog === true,
        deletePolls: kit.settings.deletePolls === true,
        habits: out,
        groups: await pactsForWeb(kit, days),
      };
    },
    /** A friend's own page: the habits they take part in here, and how everyone stands. */
    async loadFor(kit, sender, args) {
      const days = Math.min(Math.max(Number(args.days ?? 30) || 30, 7), 120);
      const mine = [];
      for (const { id, habit } of await active(kit)) mine.push({ id, name: habit.name, days: habit.days, since: habit.createdDay, done: await doneDays(kit, id) });
      return forFriend(kit, sender, days, mine);
    },
    actions: {
      async create(kit, { name, days }) {
        const clean = cleanName(String(name ?? ""));
        if (!clean) throw new Error("Name the habit.");
        const id = kit.id();
        await kit.store.put("habits", id, { name: clean, createdDay: kit.today, archived: false, days: checkDays(days) }, kit.now);
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
      /** One habit's own check-in hour; null puts it back on the default time. */
      async setHabitHour(kit, { id, hour }) {
        const h = await kit.store.get<Habit>("habits", String(id));
        if (!h) throw new Error("No such habit.");
        const v = hour === null || hour === undefined ? null : Number(hour);
        if (v !== null && (!Number.isInteger(v) || v < 0 || v > 23)) throw new Error("Pick an hour.");
        await kit.store.put("habits", String(id), { ...h, hour: v });
      },
      /** Which weekdays a habit is due on (0 Sunday to 6 Saturday); null or all seven: every day. */
      async setHabitDays(kit, { id, days }) {
        const h = await kit.store.get<Habit>("habits", String(id));
        if (!h) throw new Error("No such habit.");
        await kit.store.put("habits", String(id), { ...h, days: checkDays(days) });
      },
      /** Turn quick log on or off: a message that is only a habit's name logs it. */
      async setQuickLog(kit, { on }) {
        await kit.setSettings({ quickLog: on === true });
      },
      /** The owner's own day on a habit in a group (theirs to mark or fix; nobody else's is). */
      async groupDay(kit, { id, day, done }) {
        await ownerDay(kit, String(id), String(day), !!done);
      },
      /** Take part in a group habit, or step out of it. */
      async groupJoin(kit, { id, on }) {
        await ownerJoin(kit, String(id), on !== false);
      },
      async groupRename(kit, { id, name }) {
        await ownerChange(kit, String(id), { name: String(name ?? "") });
      },
      async groupHour(kit, { id, hour }) {
        await ownerChange(kit, String(id), { hour: hour === null || hour === undefined ? null : Number(hour) });
      },
      async groupDays(kit, { id, days }) {
        await ownerChange(kit, String(id), { days: checkDays(days) });
      },
      /** Stop tracking a group habit: it stops for the owner only, and goes on for the others. */
      async groupStop(kit, { id }) {
        await ownerJoin(kit, String(id), false);
      },
      /** Make another Habits group: for a different set of habits, or to keep some with other people. */
      async createPact(kit, { name }) {
        const made = await createPact(kit, String(name ?? ""));
        if ("error" in made) throw new Error(made.error.replace(/[_*]/g, ""));
        return made;
      },
      async closePact(kit, { key }) {
        await closePact(kit, String(key));
      },
      /** Whether an answered check-in poll is deleted (with a line saying what was chosen) or stays. */
      async setDeletePolls(kit, { on }) {
        await kit.setSettings({ deletePolls: on === true });
      },
      async setHour(kit, { hour }) {
        const h = hour === null ? null : Number(hour);
        if (h !== null && (!Number.isInteger(h) || h < 0 || h > 23)) throw new Error("Pick an hour.");
        await kit.setSettings({ checkinHour: h });
      },
    },
  },
});
