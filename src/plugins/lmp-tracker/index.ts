import { definePlugin, type Kit } from "../../sdk";
import {
  addDays,
  averagePeriodLength,
  cycles,
  daysBetween,
  ordinal,
  predict,
  pregnancy,
  pregnancyMonth,
  pretty,
  PREGNANCY_DAYS,
  weeksLabel,
  type Period,
} from "./calc";
import { parseDay } from "./dates";

/**
 * LMP Tracker: periods (next period, fertile window, reminders) and pregnancy (weeks,
 * due date, weekly updates), from the dates the person sends.
 *
 * Storage
 *   periods    key = start day   data = { start, end? }   sort = start day
 *   pregnancy  key = "current"   data = { lmp, since }
 *   sent       key = "<kind>:<day>"   data = 1   sort = day   (reminders already sent)
 */

interface Pregnancy {
  lmp: string;
  since: string;
}

/** Refs on the reminders a person can answer. */
interface PeriodRef {
  kind: "period-soon" | "period-late";
  date: string;
}

/** A start this close to a logged one is the same period, moved. */
const SAME_PERIOD_DAYS = 10;
/** The furthest back an LMP can be for an ongoing pregnancy (42 weeks). */
const MAX_PREGNANCY_DAYS = 294;

const NOTE = "_Estimates from your dates, not medical advice._";

const HELP = [
  "*LMP Tracker*",
  "",
  "*Periods*",
  "_period started_ (or _period started 12 nov_) logs a start",
  "_period ended_ logs the end",
  "_cycle_ shows your next period and fertile window",
  "_history_ lists past periods, _undo_ removes the last one",
  "_cycle length 30_ sets your usual cycle until I've seen two",
  "",
  "*Pregnancy*",
  "_lmp 3 oct_ (or _due date 10 jul_) starts pregnancy tracking",
  "_week_ shows how far along you are",
  "_not pregnant_ stops pregnancy tracking",
  "",
  "*Reminders*",
  "_reminders off_, _fertile reminders on_, _reminder time 8am_",
  "",
  NOTE,
].join("\n");

async function periods(kit: Kit): Promise<Period[]> {
  return (await kit.store.list<Period>("periods")).map((p) => p.data);
}

async function currentPregnancy(kit: Kit): Promise<Pregnancy | null> {
  return await kit.store.get<Pregnancy>("pregnancy", "current");
}

function fallbackCycle(kit: Kit): number {
  const c = kit.settings.cycleLength;
  return typeof c === "number" ? c : 28;
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

/** Log a start; a start within SAME_PERIOD_DAYS of a logged one replaces it. */
async function logStart(kit: Kit, day: string) {
  for (const p of await periods(kit)) {
    if (Math.abs(daysBetween(p.start, day)) < SAME_PERIOD_DAYS) {
      if (p.start === day) return;
      await kit.store.delete("periods", p.start);
      await kit.store.put("periods", day, p.end && p.end >= day ? { start: day, end: p.end } : { start: day }, day);
      return;
    }
  }
  await kit.store.put("periods", day, { start: day }, day);
}

async function cycleSummary(kit: Kit): Promise<string> {
  const list = await periods(kit);
  const p = predict(list.map((x) => x.start), fallbackCycle(kit), kit.today);
  if (!p) return "No periods logged yet. Send _period started_ on the first day of your next period (or _period started 12 nov_ for a past one).";
  const lines = ["*Your cycle*", ""];
  if (p.daysLate > 0) lines.push(`Next period was expected *${pretty(p.nextPeriod, kit.today)}*: ${p.daysLate} day${p.daysLate === 1 ? "" : "s"} late.`);
  else {
    const days = daysBetween(kit.today, p.nextPeriod);
    lines.push(`Next period: *${pretty(p.nextPeriod, kit.today)}* (${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`})`);
  }
  if (daysBetween(kit.today, p.fertileEnd) >= 0) {
    lines.push(`Fertile window: ${pretty(p.fertileStart, kit.today)} to ${pretty(p.fertileEnd, kit.today)}`);
    lines.push(`Likely ovulation: ${pretty(p.ovulation, kit.today)}`);
  }
  const usable = cycles(list.map((x) => x.start)).length;
  lines.push("", `Average cycle: ${p.cycle} days ${usable ? `(from ${Math.min(usable, 6)} cycle${usable === 1 ? "" : "s"})` : "(your usual length; log two periods to learn yours)"}`);
  const len = averagePeriodLength(list);
  if (len) lines.push(`Average period: ${len} days`);
  lines.push("", NOTE);
  return lines.join("\n");
}

async function history(kit: Kit): Promise<string> {
  const list = (await periods(kit)).slice(-12);
  if (!list.length) return "No periods logged yet.";
  const lines = ["*Your periods* (most recent last)", ""];
  list.forEach((p, i) => {
    const next = list[i + 1];
    const cycle = next ? `  ·  cycle ${daysBetween(p.start, next.start)} days` : "";
    const len = p.end ? `, ${daysBetween(p.start, p.end) + 1} days` : "";
    lines.push(`• ${pretty(p.start, kit.today)}${len}${cycle}`);
  });
  return lines.join("\n");
}

function pregnancyText(lmp: string, today: string, first: boolean): string {
  const s = pregnancy(lmp, today);
  const tri = ["", "first", "second", "third"][s.trimester];
  const lines = [
    first ? "🌸 Pregnancy tracking is on." : "🌸 *Your pregnancy*",
    "",
    `You're *${weeksLabel(s)}* pregnant: ${ordinal(pregnancyMonth(s.weeks))} month (approx.), ${tri} trimester.`,
    `Due date: *${pretty(s.dueDate, today)}*${s.daysToGo > 0 ? ` (${s.daysToGo} days to go)` : s.daysToGo === 0 ? " (today)" : ` (${-s.daysToGo} days ago)`}`,
  ];
  if (first && s.daysPregnant < 14) lines.push("", "That's less than 2 weeks since your LMP, so it's early. A home test is most reliable after a missed period.");
  if (s.weeks >= 42) lines.push("", "That's 42 weeks or more. Please check in with your doctor.");
  if (first) lines.push("", "I'll send a short update each week. Send _week_ any time.");
  lines.push("", NOTE);
  return lines.join("\n");
}

/** A short note for the start of a pregnancy week. Milestones only, nothing clinical. */
function weeklyUpdate(lmp: string, today: string): string {
  const s = pregnancy(lmp, today);
  const lines = [`🌸 You're *${s.weeks} weeks* pregnant today (${ordinal(pregnancyMonth(s.weeks))} month, approx.).`];
  if (s.weeks === 14) lines.push("The second trimester starts this week.");
  if (s.weeks === 28) lines.push("The third trimester starts this week.");
  if (s.weeks === 37) lines.push("From this week the pregnancy is considered early term.");
  if (s.weeks === 40) lines.push("This is your due week.");
  lines.push(s.daysToGo > 0 ? `Due date: ${pretty(s.dueDate, today)}, ${Math.ceil(s.daysToGo / 7)} week${Math.ceil(s.daysToGo / 7) === 1 ? "" : "s"} to go.` : `Due date was ${pretty(s.dueDate, today)}.`);
  return lines.join("\n");
}

export default definePlugin({
  id: "lmp-tracker",
  version: "1.1.0",
  sdk: "1",
  name: "LMP Tracker",
  icon: "🌸",
  tagline: "Period and pregnancy tracker on WhatsApp: next period, due date, reminders.",
  description:
    "Log the day your period starts and I predict the next one and your fertile window, and remind you ahead of time. Pregnant? Send your LMP and I tell you how many weeks along you are, your due date, and send a short update every week.",
  groupName: "🌸 LMP Tracker",
  price: 0,
  tier: 1,
  listing: {
    title: "Period & Pregnancy Tracker on WhatsApp | whatodo",
    description:
      "Log your period on WhatsApp and get next-period and fertile window reminders. Pregnant? Set your LMP for your due date and weekly updates.",
    h1: "Period and pregnancy tracker on WhatsApp",
  },
  welcome:
    "🌸 You've installed *LMP Tracker*.\n\nTracking periods: send _period started_ on the first day of your period (or _period started 12 nov_ for your last one).\nPregnant: send _lmp 3 oct_ with the first day of your last period.\n\nSend _help_ any time. " +
    NOTE,
  help: HELP,
  settings: { reminderHour: 9, cycleLength: 28, periodReminders: true, fertileReminders: false },
  schedules: [{ id: "daily", hour: { setting: "reminderHour" } }],

  async onMessage(event, kit) {
    const text = event.text.trim();
    const lower = text.toLowerCase().replace(/\s+/g, " ");

    // Replies to "may start soon" / "is late": "started" logs today.
    const ref = event.quotedRef as PeriodRef | null;
    if (ref && typeof ref === "object" && (ref.kind === "period-soon" || ref.kind === "period-late")) {
      if (/^(started|it started|yes|yep|today|came|got it)[!. ]*$/.test(lower)) {
        await logStart(kit, kit.today);
        return kit.react("👍");
      }
      const d = parseDay(lower.replace(/^(started|it started|came)\s+(on\s+)?/, ""), kit.today, "past");
      if (d && /^(started|it started|came)\b/.test(lower)) {
        if (d > kit.today) return kit.send("That's in the future. Send the day it started.");
        await logStart(kit, d);
        return kit.react("👍");
      }
    }

    // ── Pregnancy ──
    let m = lower.match(/^(?:i'?m\s+)?(?:pregnant[, ]*)?(?:my\s+)?lmp(?:\s+(?:is|was|on|date))?[:\s]+(.+)$/) ?? lower.match(/^pregnant\s+(?:since|from)\s+(.+)$/);
    if (m) {
      const lmp = parseDay(m[1], kit.today, "past");
      if (!lmp) return kit.send("I couldn't read that date. Try _lmp 3 oct_ or _lmp 03/10/2026_.");
      if (lmp > kit.today) return kit.send("Your LMP can't be in the future. Send the first day of your last period.");
      if (daysBetween(lmp, kit.today) > MAX_PREGNANCY_DAYS) return kit.send("That's more than 42 weeks ago. Check the date and send it again.");
      await kit.store.put("pregnancy", "current", { lmp, since: kit.today });
      return kit.send(pregnancyText(lmp, kit.today, true));
    }
    m = lower.match(/^(?:my\s+)?(?:due date|edd|due)(?:\s+(?:is|on))?[:\s]+(.+)$/);
    if (m) {
      const due = parseDay(m[1], kit.today, "future");
      if (!due) return kit.send("I couldn't read that date. Try _due date 10 jul_.");
      const lmp = addDays(due, -PREGNANCY_DAYS);
      if (lmp > kit.today) return kit.send("That due date is more than 40 weeks away. Check the date and send it again.");
      if (daysBetween(lmp, kit.today) > MAX_PREGNANCY_DAYS) return kit.send("That due date was more than two weeks ago. Check the date and send it again.");
      await kit.store.put("pregnancy", "current", { lmp, since: kit.today });
      return kit.send(pregnancyText(lmp, kit.today, true));
    }
    if (/^(not pregnant|stop pregnancy|end pregnancy|stop pregnancy tracking|no longer pregnant)$/.test(lower)) {
      await kit.store.delete("pregnancy", "current");
      return kit.react("👍");
    }

    const preg = await currentPregnancy(kit);
    if (/^(week|weeks|how far along|status)$/.test(lower) && preg) return kit.send(pregnancyText(preg.lmp, kit.today, false));
    if (/^(week|weeks|how far along)$/.test(lower)) return kit.send("Pregnancy tracking is off. Send _lmp 3 oct_ with the first day of your last period to start it.");

    // ── Periods ──
    m = lower.match(/^(?:my\s+)?period\s+(?:started|start|came|began|today|is here)(?:\s+(.+))?$/) ?? lower.match(/^(?:started|got my period)(?:\s+(.+))?$/);
    if (m || lower === "period") {
      const day = parseDay(m?.[1] ?? "today", kit.today, "past");
      if (!day) return kit.send("I couldn't read that date. Try _period started 12 nov_ or _period started yesterday_.");
      if (day > kit.today) return kit.send("That's in the future. Send the day it started.");
      await logStart(kit, day);
      return kit.react("👍");
    }
    m = lower.match(/^(?:my\s+)?period\s+(?:ended|end|stopped|over|finished)(?:\s+(.+))?$/);
    if (m) {
      const day = parseDay(m[1] ?? "today", kit.today, "past");
      if (!day) return kit.send("I couldn't read that date. Try _period ended 16 nov_.");
      const list = await periods(kit);
      const p = [...list].reverse().find((x) => x.start <= day);
      if (!p || daysBetween(p.start, day) > 14) return kit.send("I don't have a period start before that. Send _period started_ with its first day first.");
      await kit.store.put("periods", p.start, { start: p.start, end: day }, p.start);
      return kit.react("👍");
    }
    if (/^(cycle|next|next period|status|when|prediction)$/.test(lower)) return kit.send(await cycleSummary(kit));
    if (/^(history|periods|log)$/.test(lower)) return kit.send(await history(kit));
    if (lower === "undo") {
      const last = (await periods(kit)).at(-1);
      if (!last) return kit.send("Nothing to undo.");
      await kit.store.delete("periods", last.start);
      return kit.react("👍");
    }
    m = lower.match(/^(?:delete|remove)\s+(.+)$/);
    if (m) {
      const day = parseDay(m[1], kit.today, "past");
      if (!day) return kit.send("I couldn't read that date. Try _delete 12 nov_.");
      if (!(await kit.store.get("periods", day))) return kit.send(`There's no period starting ${pretty(day, kit.today)}. Send _history_ to see them.`);
      await kit.store.delete("periods", day);
      return kit.react("👍");
    }
    m = lower.match(/^(?:cycle|cycle length|my cycle is)\s+(\d{2})(?:\s+days)?$/);
    if (m) {
      const n = Number(m[1]);
      if (n < 21 || n > 45) return kit.send("A cycle length between 21 and 45 days, like _cycle length 30_.");
      await kit.setSettings({ cycleLength: n });
      return kit.react("👍");
    }

    // ── Reminders ──
    m = lower.match(/^(fertile\s+)?reminders?\s+(on|off)$/);
    if (m) {
      await kit.setSettings({ [m[1] ? "fertileReminders" : "periodReminders"]: m[2] === "on" });
      return kit.react("👍");
    }
    m = lower.match(/^(?:reminder|reminders|update)\s+(?:time|at)\s+(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/);
    if (m) {
      const h = to24(+m[1], m[3]);
      if (h === null) return kit.send("Give me a time like _reminder time 8am_.");
      await kit.setSettings({ reminderHour: h });
      return kit.react("👍");
    }

    kit.send("I didn't get that. Send _help_ to see what I can do.");
  },

  async onSchedule(event, kit) {
    if (event.id !== "daily") return;
    const once = async (kind: string, day: string, text: string, ref?: PeriodRef) => {
      const key = `${kind}:${day}`;
      if (await kit.store.get("sent", key)) return;
      await kit.store.put("sent", key, 1, day);
      kit.send(text, ref ? { ref: ref as never } : undefined);
    };

    const preg = await currentPregnancy(kit);
    if (preg) {
      const s = pregnancy(preg.lmp, kit.today);
      // A new week starts on the LMP's weekday; skip the day tracking began (they just got the answer).
      if (s.days === 0 && s.weeks > 0 && s.weeks <= 42 && kit.today !== preg.since) {
        await once("week", kit.today, weeklyUpdate(preg.lmp, kit.today));
      }
      return;
    }

    const list = await periods(kit);
    const p = predict(list.map((x) => x.start), fallbackCycle(kit), kit.today);
    if (!p) return;
    if (kit.settings.periodReminders !== false) {
      if (daysBetween(kit.today, p.nextPeriod) === 2) {
        await once(
          "soon",
          p.nextPeriod,
          `🌸 Your period may start in about 2 days (around ${pretty(p.nextPeriod, kit.today)}).\n\n_Reply started when it does._`,
          { kind: "period-soon", date: p.nextPeriod },
        );
      }
      if (p.daysLate === 3) {
        await once(
          "late",
          p.nextPeriod,
          `🌸 Your period was expected ${pretty(p.nextPeriod, kit.today)}. Did it start?\n\n_Reply started (or started 2 days ago), or ignore this._`,
          { kind: "period-late", date: p.nextPeriod },
        );
      }
    }
    if (kit.settings.fertileReminders === true && kit.today === p.fertileStart) {
      await once("fertile", p.fertileStart, `🌸 Your fertile window likely starts today and runs to ${pretty(p.fertileEnd, kit.today)}. Likely ovulation: ${pretty(p.ovulation, kit.today)}.\n\n${NOTE}`);
    }
  },
});
