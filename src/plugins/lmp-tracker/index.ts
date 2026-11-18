import { definePlugin, type Kit } from "../../sdk";
import {
  cycles,
  daysBetween,
  longestCycle,
  plan,
  pregnancy,
  pretty,
  span,
  stageOn,
  typicalCycle,
  weeksLabel,
  type Period,
  type Plan,
  type Stage,
} from "./calc";
import { BLOOD_SIGN, copy, DONE, MOON_SIGN, type Along, type Next } from "./copy";
import { findDay, parseDay } from "./dates";

/**
 * Period Tracker keeps one fact per person: their LMP, the first day of their last menstrual
 * period. They send it when a period starts ("LMP", "LMP nov 9"; no date means today) and can ask for it
 * back. If the next one isn't sent when it's due we remind them, again a week later, and
 * then suggest a pregnancy test. When the reminders come is learned from their own dates.
 *
 * The usual story: LMP, LMP, LMP... then one doesn't come, we nudge, she says she's
 * pregnant. That only switches pregnancy mode on (reminders stop); the LMP is the same LMP.
 * Months later she sends an LMP again: pregnancy mode is forgotten and tracking carries on.
 * Helping through the pregnancy itself (scans, checkups) is a later version.
 *
 * Storage
 *   periods    key = LMP day   data = { start }   sort = LMP day   (2.x rows may also have `end`)
 *   pregnancy  key = "current"   data = { since }   (2.x also kept `lmp` here; onUpgrade moves it)
 *   pending    key = "ask"   data = { day }   (the open "see it or record it?" question and the day she wrote)
 *              key = "symbol"   data = { day }   (the open "OK seeing 🩸?" question)
 *   sent       key = "<stage>:<lmp>"   data = 1   sort = lmp   (reminders already sent)
 */

interface Pregnancy {
  since: string;
  /** 2.x only. */
  lmp?: string;
}

/** Refs on the reminders a person can answer. */
interface LmpRef {
  /**
   * 3.0: lmp-due (the "due" and "again" reminders), lmp-upt (the pregnancy test nudge),
   * lmp-ask ("see your LMP or record a new one?", asked in pregnancy mode),
   * lmp-symbol ("OK seeing 🩸?", asked once after the first LMP).
   * 2.x: period-check, period-late. 1.x: period-soon. All still answered.
   */
  kind: "lmp-due" | "lmp-upt" | "lmp-ask" | "lmp-symbol" | "period-check" | "period-soon" | "period-late";
  /** The LMP the reminder was about (3.0), the day she wrote (lmp-ask), or the day it was about (1.x, 2.x). */
  date: string;
}

const REF_KINDS = ["lmp-due", "lmp-upt", "lmp-ask", "lmp-symbol", "period-check", "period-soon", "period-late"];
const LOG_EMOJI = new Set(["✅", "✔️", "☑️", "👍", "🩸"]);

function isRef(ref: unknown): ref is LmpRef {
  return !!ref && typeof ref === "object" && REF_KINDS.includes((ref as LmpRef).kind);
}

/** An LMP this close to a saved one is the same period, corrected. */
const SAME_PERIOD_DAYS = 10;
/** How long the "see it or record it?" question stays open for a plain answer. */
const ASK_DAYS = 3;
/** Past 42 weeks from the LMP a pregnancy is over. */
const MAX_PREGNANCY_DAYS = 294;

/**
 * Messages are written with 🩸. After her first LMP we ask once if that's OK; "no" (or "moon"
 * any time) switches to 🌙 (the `symbol` setting), and no answer means yes. The group itself is named with 🌙 so it gives nothing away.
 */
function say(kit: Kit, text: string, opts?: { ref?: never }) {
  kit.send(kit.settings.symbol === "moon" ? text.replaceAll(BLOOD_SIGN, MOON_SIGN) : text, opts);
}

async function lmps(kit: Kit): Promise<string[]> {
  return (await kit.store.list<Period>("periods")).map((p) => p.data.start);
}

/** The person's LMP: the latest one they sent. */
async function lastLmp(kit: Kit): Promise<string | null> {
  return (await lmps(kit)).at(-1) ?? null;
}

async function isPregnant(kit: Kit): Promise<boolean> {
  return !!(await kit.store.get<Pregnancy>("pregnancy", "current"));
}

/** When to remind, from the latest LMP and what their past LMPs say about their cycle. Null with no LMP. */
async function currentPlan(kit: Kit, list?: string[]): Promise<Plan | null> {
  const all = list ?? (await lmps(kit));
  const last = all.at(-1);
  if (!last) return null;
  const usual = typeof kit.settings.cycleLength === "number" ? kit.settings.cycleLength : 28;
  return plan(last, typicalCycle(all, usual), longestCycle(all));
}

/**
 * The reminder we last sent about the current LMP and are waiting on, if any. People mostly
 * answer with a plain "yes" instead of replying to the message, so this says what "yes" means.
 */
async function waitingOn(kit: Kit): Promise<"due" | "upt" | null> {
  const lmp = await lastLmp(kit);
  if (!lmp || (await isPregnant(kit))) return null;
  if (await kit.store.get("sent", `upt:${lmp}`)) return "upt";
  if ((await kit.store.get("sent", `again:${lmp}`)) || (await kit.store.get("sent", `due:${lmp}`))) return "due";
  return null;
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

/** Save an LMP; one within SAME_PERIOD_DAYS of a saved one replaces it (a correction). */
async function saveLmp(kit: Kit, day: string) {
  for (const start of await lmps(kit)) {
    if (Math.abs(daysBetween(start, day)) < SAME_PERIOD_DAYS) {
      if (start === day) return;
      await kit.store.delete("periods", start);
      break;
    }
  }
  await kit.store.put("periods", day, { start: day }, day);
}

/**
 * Record an LMP the person sent. The first one ever is confirmed in words; after that a clear
 * LMP only gets a 👍. Words come back only when something needs saying: the date changed an
 * LMP already recorded, it's older than the current one, or it ended pregnancy mode.
 */
async function logLmp(kit: Kit, day: string) {
  if (day > kit.today) return say(kit, copy.inFuture());
  const before = await lmps(kit);
  const prev = before.at(-1) ?? null;
  const moved = before.find((s) => s !== day && Math.abs(daysBetween(s, day)) < SAME_PERIOD_DAYS) ?? null;
  await saveLmp(kit, day);
  const date = pretty(day, kit.today);

  const first = !before.length && !(await kit.store.get("sent", "first-lmp"));
  await kit.store.put("sent", "first-lmp", 1);
  if (first) {
    say(kit, copy.firstPeriod({ date }));
    // Asked here, on the first reply she is sure to read, not in the welcome. No answer means yes.
    if (kit.settings.symbol !== "moon") {
      await kit.store.put("pending", "symbol", { day: kit.today });
      const ref: LmpRef = { kind: "lmp-symbol", date: kit.today };
      say(kit, copy.symbolQuestion(), { ref: ref as never });
    }
    return;
  }

  kit.react(DONE);
  const latest = (await lastLmp(kit))!;
  if (latest !== day) return say(kit, copy.recordedOlder({ date, latest: pretty(latest, kit.today) }));
  if ((await isPregnant(kit)) && prev && daysBetween(prev, day) >= SAME_PERIOD_DAYS) {
    // A new period after the pregnancy: forget pregnancy mode and carry on tracking.
    await kit.store.delete("pregnancy", "current");
    return say(kit, copy.pregnancyOff({ date }));
  }
  if (moved) return say(kit, copy.changed({ date, was: pretty(moved, kit.today) }));
}

/** Her usual cycle once her own dates have shown it; null while it is still the standard one. */
function learned(list: string[], p: Plan): number | null {
  return cycles(list).length >= 2 ? p.cycle : null;
}

/** When the next period is expected, for the message that says so. */
function next(p: Plan, list: string[], today: string): Next {
  return { due: pretty(p.due, today), when: today < p.due ? "ahead" : today === p.due ? "today" : "past", usual: learned(list, p), gap: span(p.cycle) };
}

/** How far along she is, counted from her LMP. */
function along(lmp: string, today: string): Along {
  const s = pregnancy(lmp, today);
  return { along: weeksLabel(s), due: pretty(s.dueDate, today) };
}

/** "When was my last LMP?" */
async function lastLmpText(kit: Kit): Promise<string> {
  const list = await lmps(kit);
  const p = await currentPlan(kit, list);
  if (!p) return copy.noPeriodYet();
  const pregnant = await isPregnant(kit);
  return copy.lastPeriod({
    started: pretty(p.lmp, kit.today),
    daysAgo: daysBetween(p.lmp, kit.today),
    next: pregnant ? null : next(p, list, kit.today),
    along: pregnant && daysBetween(p.lmp, kit.today) <= MAX_PREGNANCY_DAYS ? along(p.lmp, kit.today) : null,
  });
}

async function history(kit: Kit): Promise<string> {
  const all = await lmps(kit);
  const list = all.slice(-12);
  if (!list.length) return copy.noHistory();
  const p = (await currentPlan(kit, all))!;
  return copy.history({
    periods: list.map((d, i) => ({ date: pretty(d, kit.today), toNext: list[i + 1] ? daysBetween(d, list[i + 1]) : null })),
    usual: learned(all, p),
  });
}

async function undoLast(kit: Kit) {
  const last = await lastLmp(kit);
  if (!last) return say(kit, copy.nothingToUndo());
  await kit.store.delete("periods", last);
  kit.react(DONE);
}

/** She says she's pregnant: pregnancy mode on, period reminders stop. Her LMP is the one she already sent. */
async function startPregnancy(kit: Kit) {
  const lmp = await lastLmp(kit);
  if (!lmp) return say(kit, copy.noPeriodForPregnancy());
  if (daysBetween(lmp, kit.today) > MAX_PREGNANCY_DAYS) {
    return say(kit, copy.periodTooOld({ date: pretty(lmp, kit.today) }));
  }
  await kit.store.put("pregnancy", "current", { since: kit.today });
  say(kit, copy.pregnancyOn({ started: pretty(lmp, kit.today), ...along(lmp, kit.today) }));
}

/**
 * In pregnancy mode a bare "lmp" can mean "what's my LMP?" (a doctor is asking) or "my period
 * came" (after a miscarriage, an abortion or the birth). We don't guess: we ask, and remember
 * the day she wrote so "record" uses that day.
 */
async function askSeeOrRecord(kit: Kit) {
  await kit.store.put("pending", "ask", { day: kit.today });
  const ref: LmpRef = { kind: "lmp-ask", date: kit.today };
  say(kit, copy.seeOrRecord(), { ref: ref as never });
}

async function stopPregnancy(kit: Kit) {
  await kit.store.delete("pregnancy", "current");
  kit.react(DONE);
}

function reminderText(stage: Stage, p: Plan, today: string): string {
  const since = span(daysBetween(p.lmp, today));
  const last = pretty(p.lmp, today);
  if (stage === "due") return copy.dueReminder({ last, since });
  if (stage === "again") return copy.againReminder({ last, since });
  return copy.testReminder({ last, since });
}

const YES = /^(yes|yeah|yep|y|ya|haan|positive|it'?s positive|test (?:is|was|came) positive)$/;
const NO = /^(no|nope|n|nahi|not yet|no not yet|negative|it'?s negative|test (?:is|was|came) negative)$/;
const STARTED = /^(yes|yeah|yep|y|ya|haan|today|it came today|started today|yes today)$/;

export default definePlugin({
  id: "lmp-tracker",
  version: "3.1.3",
  sdk: "1",
  name: "Period Tracker",
  icon: "🩸",
  tagline: "Send the day your period starts. Get a reminder when the next one is due.",
  description:
    "Keeps track of your periods on WhatsApp. The day your period starts, send period or today. If it started another day, send the date. If the next one is late you get a reminder, and at two weeks late a suggestion to take a pregnancy test. The more dates you send, the better it knows when to expect yours.",
  groupName: copy.groupName(),
  price: 0,
  tier: 1,
  listing: {
    title: "Period Tracker & Reminder on WhatsApp | telcurio",
    description:
      "Tell telcurio on WhatsApp the day your period starts. Get a reminder when the next one is due, based on your own dates, and a nudge if it's late. Free.",
    h1: "Period tracker and reminder on WhatsApp",
  },
  welcome: copy.welcome(),
  help: copy.help(),
  settings: { reminderHour: 9, cycleLength: 28, periodReminders: true, symbol: "blood" },
  schedules: [{ id: "daily", hour: { setting: "reminderHour" } }],

  async onMessage(event, kit) {
    const lower = event.text.trim().toLowerCase().replace(/\s+/g, " ");
    const plain = lower.replace(/[!.]+$/, "");

    const ref = event.quotedRef;

    // ── The answer to "see your LMP or record a new one?" ──
    const open = await kit.store.get<{ day: string }>("pending", "ask");
    const asked = isRef(ref) && ref.kind === "lmp-ask" ? ref.date : open && daysBetween(open.day, kit.today) <= ASK_DAYS ? open.day : null;
    if (asked) {
      const see = /^(1|one|see|see it|show|know|last|last lmp|when)$/.test(plain);
      const record = /^(2|two|record|record it|record lmp|new|new lmp|new one|save|add)$/.test(plain);
      if (see || record) {
        await kit.store.delete("pending", "ask");
        if (see) return say(kit, await lastLmpText(kit));
        return logLmp(kit, asked);
      }
    }

    // ── The answer to "OK seeing 🩸?" (a reminder waiting for an answer comes first) ──
    const okYes = /^(yes|yeah|yep|y|ya|haan|ok|okay|fine|sure|it'?s (?:fine|ok|okay)|no problem)$/.test(plain);
    const okNo = /^(no|nope|n|nahi|no thanks|not ok|not okay|don'?t|remove it)$/.test(plain);
    if (okYes || okNo) {
      const sym = await kit.store.get<{ day: string }>("pending", "symbol");
      const quoted = isRef(ref) && ref.kind === "lmp-symbol";
      if (quoted || (!isRef(ref) && sym && daysBetween(sym.day, kit.today) <= ASK_DAYS && !(await waitingOn(kit)))) {
        await kit.store.delete("pending", "symbol");
        kit.react(DONE);
        if (okYes) return;
        await kit.setSettings({ symbol: "moon" });
        return say(kit, copy.nowMoon());
      }
    }

    // ── A short answer to a reminder: quoted, or just typed after it ──
    if ((YES.test(plain) || NO.test(plain) || STARTED.test(plain)) && !(isRef(ref) && (ref.kind === "lmp-ask" || ref.kind === "lmp-symbol"))) {
      const about = isRef(ref) ? (ref.kind === "lmp-upt" ? "upt" : "due") : await waitingOn(kit);
      if (about === "upt" && YES.test(plain)) return startPregnancy(kit);
      if (about === "due" && STARTED.test(plain)) return logLmp(kit, kit.today);
      if (about && NO.test(plain)) {
        kit.react(DONE);
        return say(kit, copy.okSendPeriod());
      }
    }

    // ── "When was my last LMP?", "last lmp", "lmp?" ──
    if (
      /^(last lmp|my lmp|my last lmp|last period|my last period|status|next|next period|cycle|when|week|weeks|how far along)$/.test(plain) ||
      (/\b(lmp|periods?)\b/.test(lower) && (/\?/.test(lower) || /^(when|what|which|tell|show|do you)\b/.test(lower)))
    ) {
      return say(kit, await lastLmpText(kit));
    }

    // ── Pregnant / not pregnant ──
    if (/^(?:yes[, ]+)?(?:i'?m |i am )?pregnant$/.test(plain)) return startPregnancy(kit);
    if (/^(?:i'?m |i am )?(not pregnant|no longer pregnant)$/.test(plain)) return stopPregnancy(kit);

    // ── An LMP: "LMP today", "lmp nov 9", "my lmp was 9th nov", "period started yesterday", "came 2 days ago" ──
    const m =
      plain.match(/^(?:my\s+)?(?:last\s+)?lmp(?:\s+(?:is|was|on|date|=))?[:\s-]+(.+)$/) ??
      plain.match(/^(?:my\s+)?periods?\s+(?:started|start|came|began|today|is here|are here)(?:\s+(.+))?$/) ??
      plain.match(/^(?:it\s+)?(?:started|came|got my periods?|got periods?)(?:\s+(.+))?$/);
    // No date means the day of the message: "lmp", "today", "now", "periods came".
    const bare = /^(lmp|today|now|periods?|it'?s here|got it)$/.test(plain);
    // In pregnancy mode a bare "lmp" is ambiguous: ask instead of guessing.
    if (!m && bare && (await isPregnant(kit))) return askSeeOrRecord(kit);
    if (m || bare) {
      const day = parseDay(m?.[1] ?? "today", kit.today, "past");
      if (!day) return say(kit, copy.badDate());
      return logLmp(kit, day);
    }
    if (/^(?:my\s+)?periods?\s+(?:ended|end|stopped|over|finished)\b/.test(plain)) {
      return say(kit, copy.noEndNeeded());
    }

    // ── History and corrections ──
    if (/^(history|log|all lmps?|lmps)$/.test(plain)) return say(kit, await history(kit));
    if (plain === "undo") return undoLast(kit);
    const del = plain.match(/^(?:delete|remove)\s+(.+)$/);
    if (del) {
      const day = parseDay(del[1].replace(/^lmp\s+/, ""), kit.today, "past");
      if (!day) return say(kit, copy.badDeleteDate());
      if (!(await kit.store.get("periods", day))) return say(kit, copy.noPeriodOn({ date: pretty(day, kit.today) }));
      await kit.store.delete("periods", day);
      return kit.react(DONE);
    }

    // ── 🩸 or 🌙 in our messages ──
    const symbol = plain.match(/^(?:use |switch to )?(moon|blood)$|^(no blood)$/);
    if (symbol) {
      const moon = symbol[1] !== "blood";
      await kit.setSettings({ symbol: moon ? "moon" : "blood" });
      kit.react(DONE);
      return say(kit, moon ? copy.nowMoon() : copy.nowBlood());
    }

    // ── Reminders ──
    const onOff = plain.match(/^reminders?\s+(on|off)$/);
    if (onOff) {
      await kit.setSettings({ periodReminders: onOff[1] === "on" });
      return kit.react(DONE);
    }
    const at = plain.match(/^(?:reminder|reminders)\s+(?:time|at)\s+(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/);
    if (at) {
      const h = to24(+at[1], at[3]);
      if (h === null) return say(kit, copy.badTime());
      await kit.setSettings({ reminderHour: h });
      kit.react(DONE);
      return say(kit, copy.reminderTime({ time: hourLabel(h) }));
    }

    // Just a date ("9 nov", "yesterday", "3 days ago"), or "period 9 nov": the day it started.
    const alone = parseDay(plain.replace(/^(?:my\s+)?periods?\s+(?:on\s+)?/, ""), kit.today, "past");
    if (alone) return (await isPregnant(kit)) ? askSeeOrRecord(kit) : logLmp(kit, alone);

    kit.unsure(copy.unsure());
  },

  understand: {
    intents: {
      log_lmp: "Say their period started (today or on some day), or give the date of their last menstrual period (LMP)",
      ask_lmp: "Ask when their last period or LMP was, when the next one is due, or how far along their pregnancy is",
      history: "See all the period dates they have sent",
      pregnant: "Say they are pregnant or a pregnancy test was positive",
      not_pregnant: "Say they are not pregnant, a pregnancy test was negative, or the pregnancy is over",
      undo: "Take back the last period date they sent by mistake",
      help: "Ask how this works or what they can say",
    },
  },

  async onIntent({ text, intent }, kit) {
    switch (intent) {
      case "log_lmp":
        // "my periods came" with no date means today.
        return logLmp(kit, findDay(text, kit.today, "past") ?? kit.today);
      case "ask_lmp":
        return say(kit, await lastLmpText(kit));
      case "history":
        return say(kit, await history(kit));
      case "pregnant":
        return startPregnancy(kit);
      case "not_pregnant":
        if (await isPregnant(kit)) return stopPregnancy(kit);
        kit.react(DONE);
        return say(kit, copy.okSendPeriod());
      case "undo":
        return undoLast(kit);
      default:
        return say(kit, copy.help());
    }
  },

  async onReaction(event, kit) {
    // ✅ on a "due" reminder (or a 2.x check-in) means it started today; removing it takes that back.
    if (!isRef(event.ref) || event.ref.kind === "lmp-upt" || event.ref.kind === "lmp-ask" || event.ref.kind === "lmp-symbol") return;
    if (event.emoji && LOG_EMOJI.has(event.emoji)) {
      if (await isPregnant(kit)) return;
      await saveLmp(kit, kit.today);
      return kit.react(DONE);
    }
    if (!event.emoji && (await kit.store.get("periods", kit.today))) await kit.store.delete("periods", kit.today);
  },

  async onUpgrade(fromVersion, kit) {
    // 2.x -> 3.0: a person has one LMP, the latest in `periods`. 2.x kept a pregnancy's LMP only
    // in the pregnancy record ("lmp 3 oct" started pregnancy without saving a period): move it
    // into `periods`. Idempotent: the rewritten record has no `lmp`.
    // Period rows may carry `end` (ignored now); the fertileReminders setting is no longer read.
    void fromVersion;
    const preg = await kit.store.get<Pregnancy>("pregnancy", "current");
    if (preg?.lmp) {
      await saveLmp(kit, preg.lmp);
      await kit.store.put("pregnancy", "current", { since: preg.since });
    }
  },

  async onSchedule(event, kit) {
    if (event.id !== "daily") return;
    const p = await currentPlan(kit);
    if (!p) return;
    if (await isPregnant(kit)) {
      // No reminders in pregnancy mode. Past 42 weeks it's over: forget it quietly.
      if (daysBetween(p.lmp, kit.today) > MAX_PREGNANCY_DAYS) await kit.store.delete("pregnancy", "current");
      return;
    }
    if (kit.settings.periodReminders === false) return;
    const stage = stageOn(p, kit.today);
    if (!stage) return;
    // One message per stage per LMP, keyed by the LMP so a new LMP starts fresh.
    const key = `${stage}:${p.lmp}`;
    if (await kit.store.get("sent", key)) return;
    await kit.store.put("sent", key, 1, p.lmp);
    const ref: LmpRef = { kind: stage === "upt" ? "lmp-upt" : "lmp-due", date: p.lmp };
    say(kit, reminderText(stage, p, kit.today), { ref: ref as never });
  },
});
