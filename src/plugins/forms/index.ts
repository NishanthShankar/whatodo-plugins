import { definePlugin, type HookFile, type Json, type Kit } from "../../sdk";
import { CLOSED, copy, MAIN_GROUP_WORDS, MARKED_DONE } from "./copy";

/**
 * Forms: a backend for the forms on your own websites. Each form gets a web address; whatever
 * is posted to it (fields and files) is kept here and announced in the Forms group, in a group
 * of its own, or in another form's group (several forms can share one).
 *
 * Storage
 *   forms        key = form key ("contact")   data = Form         sort = created (ms)
 *   submissions  key = id                     data = Submission   sort = received (ms)   (`order` keeps the fields' order)
 *   days         key = "<form>:<day>"         data = number of messages sent that day   sort = day
 */

interface Form {
  name: string;
  /** The address to post to. Kept here because a page load can't ask for it. */
  url: string;
  createdDay: string;
  /** When it was made (ms); also its sort value. */
  created: number;
  /** Closed: its address no longer works. Submissions stay. */
  closed?: boolean;
  /** Submissions received, ever. */
  count: number;
  /** It has its own WhatsApp group (its key is the form's key): submissions go there, not to the main Forms group. */
  ownGroup?: boolean;
  /** The name the person gave that group on the page. Unset: it is named after the form as it was when the group was made. */
  groupName?: string;
  /**
   * Its submissions go to another form's own group: that form's key. Never set with `ownGroup`.
   * If that form loses its group (deleted), this is cleared and the form is back in the main group.
   */
  sendTo?: string;
}

interface Submission {
  form: string;
  at: number;
  fields: Record<string, string>;
  /** The fields' names in the order the form sent them (stored objects don't keep their order). Unset in 1.0.0. */
  order?: string[];
  files: HookFile[];
  origin: string | null;
  /** Marked as dealt with (✅ on its message, or on the page). */
  done?: boolean;
}

interface SubmissionRef {
  kind: "submission";
  id: string;
}

function isRef(ref: unknown): ref is SubmissionRef {
  return !!ref && typeof ref === "object" && (ref as SubmissionRef).kind === "submission" && typeof (ref as SubmissionRef).id === "string";
}

/** Every tick WhatsApp offers, and a thumbs up. Compared without the invisible "emoji style" mark, which phones add or drop. */
const DONE_EMOJI = new Set(["✅", "✔", "☑", "✓", "👍", "👌", "🆗"]);
const plainEmoji = (e: string) => e.replace(/[\uFE0E\uFE0F]/g, "").replace(/[\u{1F3FB}-\u{1F3FF}]/gu, "");
/** Most fields shown in one message; the rest are on the page. */
const SHOW_FIELDS = 12;
/** Longest value shown in a message. */
const SHOW_CHARS = 300;
/** Forms one person can have. */
const MAX_FORMS = 50;

/** "Partner Applications!" -> "partner-applications" */
export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/, "");
}

export function size(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

async function forms(kit: Kit) {
  return await kit.store.list<Form>("forms");
}

/** Find a form by what the person typed: its key, or its name. */
async function findForm(kit: Kit, text: string): Promise<{ key: string; form: Form } | null> {
  const key = slug(text);
  const form = key ? await kit.store.get<Form>("forms", key) : null;
  if (form) return { key, form };
  // A renamed form keeps its key, so it is also found by the name it has now.
  const named = key ? (await forms(kit)).find((f) => slug(f.data.name) === key) : undefined;
  return named ? { key: named.key, form: named.data } : null;
}

/** What a form's own group is called: the name the person gave it, else the form's name with the mailbox. */
const groupNameOf = (form: Form) => form.groupName ?? copy.groupTitle({ name: form.name }).slice(0, 25);

/**
 * Give a form a new name, and its own group one too if asked. The key stays, so the address
 * and everything the form received stay with it. Returns the form, or why it couldn't be done.
 */
async function renameForm(kit: Kit, key: string, form: Form, name: string | null, groupName: string | null): Promise<{ form: Form } | { error: string }> {
  const next: Form = { ...form };
  if (name !== null) {
    const clean = name.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!clean || !slug(clean)) return { error: copy.formNeedsName() };
    // Forms are found by name too, so two can't answer to the same one.
    const taken = (await forms(kit)).some((f) => f.key !== key && (f.key === slug(clean) || slug(f.data.name) === slug(clean)));
    if (taken) return { error: copy.nameTaken({ name: clean }) };
    // The group keeps the name it has: a form's new name doesn't rename a chat behind the person's back.
    if (form.ownGroup && !form.groupName) next.groupName = groupNameOf(form);
    next.name = clean;
  }
  if (groupName !== null && form.ownGroup) {
    const clean = groupName.trim().replace(/\s+/g, " ").slice(0, 25).trim();
    if (clean && clean !== groupNameOf(next)) {
      await kit.groups.rename(key, clean);
      next.groupName = clean;
    }
  }
  await kit.store.put("forms", key, next as unknown as Json, next.created);
  return { form: next };
}

/** The group a form's submissions go to: its own, another form's (by that form's key), or null for the main group. */
const groupOf = (key: string, form: Form): string | null => (form.ownGroup ? key : (form.sendTo ?? null));

/** Every form whose submissions go to the group `group` (a form's key), the group's own form first. */
async function formsIn(kit: Kit, group: string) {
  return (await forms(kit)).filter((f) => groupOf(f.key, f.data) === group).sort((a, b) => Number(b.key === group) - Number(a.key === group));
}

/** A form's own group, found by the form's name or key or by the group's name. */
async function findGroup(kit: Kit, text: string): Promise<{ key: string; form: Form } | null> {
  const want = slug(text);
  if (!want) return null;
  const all = await forms(kit);
  const hit = all.find((f) => f.key === want) ?? all.find((f) => slug(f.data.name) === want) ?? all.find((f) => f.data.ownGroup && slug(groupNameOf(f.data)) === want);
  return hit ? { key: hit.key, form: hit.data } : null;
}

/**
 * Point a form at another form's own group (`to`, that form's key), or back at the main group
 * (null). A form with a group of its own stays in it. Returns the form, or why it couldn't be done.
 */
async function moveForm(kit: Kit, key: string, form: Form, to: string | null): Promise<{ form: Form; group: string | null } | { error: string }> {
  if (form.ownGroup) return to === key ? { error: copy.alreadyOwnGroup({ name: form.name }) } : { error: copy.ownsGroup({ name: form.name }) };
  let group: string | null = null;
  if (to !== null) {
    const target = await kit.store.get<Form>("forms", to);
    if (!target) return { error: copy.noSuchForm({ name: to }) };
    if (to === key || !target.ownGroup) return { error: copy.noGroupYet({ name: target.name, key: to }) };
    group = groupNameOf(target);
  }
  const next: Form = { ...form };
  if (to === null) delete next.sendTo;
  else next.sendTo = to;
  await kit.store.put("forms", key, next as unknown as Json, next.created);
  return { form: next, group };
}

async function openGroup(kit: Kit, key: string, form: Form) {
  await kit.groups.open(key, {
    name: groupNameOf(form),
    hello: copy.groupHello({ name: form.name }),
  });
}

/** `sendTo`: put it in that form's own group (a form's key). Reopening a form keeps where it went. */
async function createForm(kit: Kit, name: string, ownGroup = false, sendTo: string | null = null): Promise<{ key: string; form: Form } | { error: string }> {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 40);
  const key = slug(clean);
  if (!key) return { error: copy.formNeedsName() };
  const existing = await kit.store.get<Form>("forms", key);
  if (existing && !existing.closed) return { error: copy.formExists({ name: existing.name, key }) };
  if (!existing && (await forms(kit)).length >= MAX_FORMS) return { error: copy.tooManyForms({ max: MAX_FORMS }) };
  const target = sendTo && sendTo !== key ? await kit.store.get<Form>("forms", sendTo) : null;
  if (sendTo && !target?.ownGroup) return { error: copy.noSuchGroup({ name: sendTo }) };
  // Reopening a closed form gives it a new address; the old one stays dead.
  const url = await kit.hooks.url(key);
  const form: Form = { name: existing?.name ?? clean, url, createdDay: existing?.createdDay ?? kit.today, created: existing?.created ?? kit.now, count: existing?.count ?? 0 };
  if (ownGroup || existing?.ownGroup) {
    form.ownGroup = true;
    await openGroup(kit, key, form);
  } else if (sendTo ?? existing?.sendTo) {
    form.sendTo = (sendTo ?? existing?.sendTo)!;
  }
  await kit.store.put("forms", key, form as unknown as Json, form.created);
  return { key, form };
}

/**
 * Give a form a new address. The old one stops working at once; everything the form received
 * stays where it is. For an address that got out and is being misused.
 */
async function replaceAddress(kit: Kit, key: string, form: Form): Promise<Form> {
  await kit.hooks.remove(key);
  const next = { ...form, url: await kit.hooks.url(key) };
  await kit.store.put("forms", key, next as unknown as Json, next.created);
  return next;
}

function addressText(key: string, form: Form, fresh: boolean): string {
  return copy.address({ key, name: form.name, url: form.url, fresh, ownGroup: !!form.ownGroup });
}

/** A submission's fields in the order the form sent them. */
function ordered(s: Pick<Submission, "fields" | "order">): [string, string][] {
  const names = [...(s.order ?? []).filter((k) => k in s.fields), ...Object.keys(s.fields).filter((k) => !(s.order ?? []).includes(k))];
  return names.map((k) => [k, s.fields[k]]);
}

function submissionText(formName: string, s: Submission): string {
  const entries = ordered(s);
  const fields = entries.slice(0, SHOW_FIELDS).map(([name, v]) => ({ name, value: v.length > SHOW_CHARS ? `${v.slice(0, SHOW_CHARS)}…` : v }));
  const files = s.files.map((f) => ({ name: f.name, size: size(f.size) }));
  return copy.submission({ form: formName, fields, more: entries.length - fields.length, files }).slice(0, 3900);
}

async function removeSubmission(kit: Kit, id: string) {
  const s = await kit.store.get<Submission>("submissions", id);
  if (!s) return;
  for (const f of s.files) await kit.files.remove(f.id);
  await kit.store.delete("submissions", id);
}

export default definePlugin({
  id: "forms",
  version: "1.4.0",
  sdk: "1",
  name: "Forms",
  icon: "📬",
  tagline: "Your website's forms, delivered to WhatsApp. Files included.",
  description:
    "A backend for the forms on your own websites. Make a form, paste its address into your site, and every submission arrives as a WhatsApp message, with its fields and files kept on app.zelfred.com.",
  groupName: copy.groupName(),
  price: 0,
  tier: 2,
  unlisted: true,
  permissions: ["hooks", "groups"],
  listing: {
    title: "Form Backend on WhatsApp: Submissions as Chats | Zelfred",
    description: "Point your website's form at Zelfred and get every submission as a WhatsApp message. File uploads included. Records kept on the web.",
    h1: "Form backend that delivers to WhatsApp",
  },
  welcome: copy.welcome(),
  help: copy.help(),
  settings: { dailyMessages: 30 },

  async onMessage(event, kit) {
    const text = event.text.trim().replace(/\s+/g, " ");
    const lower = text.toLowerCase().replace(/[!.]+$/, "");

    // In a form's own group, "last", "address" and "close" are about the form that arrives there.
    // Several forms can share a group: then "last" covers them all, and the others need a name.
    const inGroup = event.group ? await formsIn(kit, event.group) : [];
    const open = inGroup.filter((f) => !f.data.closed);
    const hereKey = open.length === 1 ? open[0].key : !open.length && inGroup.length ? inGroup[0].key : null;
    const many = open.length > 1;
    const which = () => kit.send(copy.whichForm({ names: open.map((f) => f.data.name) }));

    let m = text.match(/^(?:new|add|create|make)\s+(?:a\s+)?form\s+(.+)$/i);
    if (m) {
      const own = m[1].match(/^(.+?)\s+(?:in|with)\s+(?:its\s+|a\s+|an\s+)?(?:own\s+|new\s+|separate\s+)?group$/i);
      // Made in a form's own group, it arrives in that group.
      const made = await createForm(kit, own ? own[1] : m[1], !!own, !own && inGroup.length ? event.group! : null);
      if ("error" in made) return kit.send(made.error);
      return kit.send(addressText(made.key, made.form, true));
    }

    if (/^(forms|list|my forms|all forms)$/.test(lower)) {
      const all = await forms(kit);
      if (!all.length) return kit.send(copy.noForms());
      return kit.send(copy.formsList({ forms: all.map((f) => ({ name: f.data.name, closed: !!f.data.closed, count: f.data.count, url: f.data.url })) }));
    }

    m = lower.match(/^(?:give\s+)?(?:own\s+)?group\s+(?:for\s+)?(.+)$/) ?? lower.match(/^(?:move|put)\s+(.+?)\s+(?:to|in)\s+(?:its\s+)?(?:own\s+)?group$/);
    if (m) {
      const found = await findForm(kit, m[1]);
      if (!found) return kit.send(copy.noSuchForm({ name: m[1] }));
      if (found.form.closed) return kit.send(copy.closedReopenWithGroup({ name: found.form.name, key: found.key }));
      if (found.form.ownGroup) return kit.send(copy.alreadyOwnGroup({ name: found.form.name }));
      const form: Form = { ...found.form, ownGroup: true };
      delete form.sendTo;
      await openGroup(kit, found.key, form);
      await kit.store.put("forms", found.key, form as unknown as Json, form.created);
      return kit.send(copy.makingGroup({ name: form.name }));
    }

    // "move demo to kyc group", "send demo to the main group", "move demo here".
    m = lower.match(/^(?:move|put|send)\s+(.+?)\s+(?:to|in|into)\s+(?:the\s+)?(.+?)(?:'s|’s)?\s+group$/) ?? lower.match(/^(?:move|put|send)\s+(.+?)\s+(here)$/);
    if (m) {
      const found = await findForm(kit, m[1]);
      if (!found) return kit.send(copy.noSuchForm({ name: m[1] }));
      const here = m[2] === "here";
      let to: string | null = null;
      if (here ? inGroup.length : !MAIN_GROUP_WORDS.includes(m[2])) {
        const target = here ? { key: event.group! } : await findGroup(kit, m[2]);
        if (!target) return kit.send(copy.noSuchGroup({ name: m[2] }));
        to = target.key;
      }
      if (groupOf(found.key, found.form) === to && !found.form.ownGroup) return kit.send(copy.alreadyThere({ name: found.form.name }));
      const done = await moveForm(kit, found.key, found.form, to);
      if ("error" in done) return kit.send(done.error);
      return kit.send(copy.moved({ name: done.form.name, group: done.group }));
    }

    m = text.match(/^rename(?:\s+(?:the\s+)?form)?(?:\s+(.+?))?\s+to\s+(.+)$/i) ?? text.match(/^rename\b(.*)$/i);
    if (m && (m[2] === undefined || m[1] || hereKey || many)) {
      if (m[2] === undefined) return kit.send(copy.renameNeedsName());
      if (!m[1] && !hereKey) return which();
      const found = await findForm(kit, m[1] ?? hereKey!);
      if (!found) return kit.send(copy.noSuchForm({ name: `${m[1] ?? hereKey}` }));
      const done = await renameForm(kit, found.key, found.form, m[2], null);
      if ("error" in done) return kit.send(done.error);
      return kit.send(copy.renamed({ from: found.form.name, to: done.form.name }));
    }

    m = lower.match(/^(?:new|change|replace|reset|rotate)\s+(?:the\s+)?(?:address|url|link)(?:(?:\s+(?:of|for))?\s+(.+))?$/);
    if (m && (m[1] || hereKey || many)) {
      if (!m[1] && !hereKey) return which();
      const found = await findForm(kit, m[1] ?? hereKey!);
      if (!found) return kit.send(copy.noSuchForm({ name: `${m[1] ?? hereKey}` }));
      if (found.form.closed) return kit.send(copy.closedReopen({ name: found.form.name, key: found.key }));
      const next = await replaceAddress(kit, found.key, found.form);
      return kit.send(copy.newAddress({ name: next.name, url: next.url }));
    }

    m = lower.match(/^(?:address|url|link|endpoint)(?:(?:\s+(?:of|for))?\s+(.+))?$/);
    if (m && (m[1] || hereKey || many)) {
      if (!m[1] && !hereKey) return which();
      const found = await findForm(kit, m[1] ?? hereKey!);
      if (!found) return kit.send(copy.noSuchForm({ name: `${m[1] ?? hereKey}` }));
      if (found.form.closed) return kit.send(copy.closedReopen({ name: found.form.name, key: found.key }));
      return kit.send(addressText(found.key, found.form, false));
    }

    m = lower.match(/^(?:last|latest|recent)(?:\s+(.+))?$/);
    if (m) {
      const found = m[1] ? await findForm(kit, m[1]) : null;
      if (m[1] && !found) return kit.send(copy.noSuchForm({ name: m[1] }));
      // In a form's own group, every form that arrives there.
      const keys = found ? [found.key] : inGroup.length ? inGroup.map((f) => f.key) : null;
      const all = await kit.store.list<Submission>("submissions");
      const mine = keys ? all.filter((s) => keys.includes(s.data.form)) : all;
      const latest = mine.at(-1);
      if (!latest) return kit.send(copy.nothingYet());
      const form = await kit.store.get<Form>("forms", latest.data.form);
      const ref: SubmissionRef = { kind: "submission", id: latest.key };
      return kit.send(submissionText(form?.name ?? latest.data.form, latest.data), { ref: ref as unknown as Json });
    }

    m = lower.match(/^(?:close|stop|pause)(?:\s+(?:this\s+)?form)?(?:\s+(.+))?$/);
    if (m && (m[1] || hereKey || many)) {
      if (!m[1] && !hereKey) return which();
      const found = await findForm(kit, m[1] ?? hereKey!);
      if (!found) return kit.send(copy.noSuchForm({ name: `${m[1] ?? hereKey}` }));
      await kit.hooks.remove(found.key);
      await kit.store.put("forms", found.key, { ...found.form, closed: true } as unknown as Json, found.form.created);
      kit.react(CLOSED);
      return kit.send(copy.closed({ name: found.form.name }));
    }

    kit.send(copy.notUnderstood());
  },

  async onHook(event, kit) {
    const form = await kit.store.get<Form>("forms", event.key);
    // A form that was deleted or closed between the request and now: keep nothing.
    if (!form || form.closed) {
      for (const f of event.files) await kit.files.remove(f.id);
      return;
    }
    const id = `${kit.now.toString(36)}${kit.id().slice(0, 4)}`;
    const s: Submission = { form: event.key, at: kit.now, fields: event.fields, order: Object.keys(event.fields), files: event.files, origin: event.origin };
    await kit.store.put("submissions", id, s as unknown as Json, kit.now);
    await kit.store.put("forms", event.key, { ...form, count: form.count + 1 } as unknown as Json, form.created);

    // One message per submission, up to a daily number per form, so a flood on the website
    // can't become a flood on WhatsApp. Everything is still kept.
    const limit = typeof kit.settings.dailyMessages === "number" ? kit.settings.dailyMessages : 30;
    const dayKey = `${event.key}:${kit.today}`;
    const sentToday = (await kit.store.get<number>("days", dayKey)) ?? 0;
    if (sentToday > limit) return;
    await kit.store.put("days", dayKey, sentToday + 1, kit.today);
    // A form with its own group is announced there (in the main group until that group exists);
    // one sent to another form's group, there while that form still has it.
    const target = form.sendTo ? await kit.store.get<Form>("forms", form.sendTo) : null;
    const where = form.ownGroup ? { group: event.key } : target?.ownGroup ? { group: form.sendTo! } : {};
    if (sentToday === limit) {
      return kit.send(copy.tooManyToday({ name: form.name, limit }), where);
    }
    const ref: SubmissionRef = { kind: "submission", id };
    kit.send(submissionText(form.name, s), { ref: ref as unknown as Json, ...where });
  },

  async onReaction(event, kit) {
    // ✅ on a submission's message marks it dealt with; taking it off undoes that.
    if (!isRef(event.ref)) return;
    const s = await kit.store.get<Submission>("submissions", event.ref.id);
    if (!s) return;
    const done = !!event.emoji && DONE_EMOJI.has(plainEmoji(event.emoji));
    if (!event.emoji || done) await kit.store.put("submissions", event.ref.id, { ...s, done } as unknown as Json, s.at);
    // Tick the message back, so it's plain that it was marked done (and take the tick off when undone).
    if (done) kit.react(MARKED_DONE);
    else if (!event.emoji) kit.react("");
  },

  web: {
    lockable: true,
    async load(kit, args) {
      const only = typeof args.form === "string" ? args.form : null;
      const limit = Math.min(Math.max(Number(args.limit ?? 200) || 200, 1), 500);
      const all = await kit.store.list<Submission>("submissions");
      const mine = (only ? all.filter((s) => s.data.form === only) : all).reverse().slice(0, limit);
      return {
        forms: (await forms(kit)).map((f, _, all) => {
          // Where it arrives: its own group, another form's (by that form's key), or the main one (null).
          const target = f.data.sendTo ? all.find((g) => g.key === f.data.sendTo && g.data.ownGroup) : undefined;
          return {
            key: f.key,
            name: f.data.name,
            url: f.data.url,
            closed: !!f.data.closed,
            count: f.data.count,
            createdDay: f.data.createdDay,
            ownGroup: !!f.data.ownGroup,
            groupName: f.data.ownGroup ? groupNameOf(f.data) : null,
            sendTo: target ? target.key : null,
            sendToName: target ? groupNameOf(target.data) : null,
          };
        }),
        submissions: mine.map((s) => ({ id: s.key, form: s.data.form, at: s.data.at, fields: s.data.fields, order: ordered(s.data).map(([k]) => k), files: s.data.files, origin: s.data.origin, done: !!s.data.done })),
        total: all.length,
      } as unknown as Json;
    },
    actions: {
      async createForm(kit, { name, ownGroup, sendTo }) {
        const made = await createForm(kit, String(name ?? ""), ownGroup === true, typeof sendTo === "string" && sendTo ? sendTo : null);
        if ("error" in made) throw new Error(made.error.replace(/[_*]/g, ""));
        return { key: made.key, url: made.form.url };
      },
      async closeForm(kit, { key }) {
        const form = await kit.store.get<Form>("forms", String(key));
        if (!form) return;
        await kit.hooks.remove(String(key));
        await kit.store.put("forms", String(key), { ...form, closed: true } as unknown as Json, form.created);
      },
      /** A new name for a form (`name`), for its own WhatsApp group (`groupName`), or both. The address stays. */
      async rename(kit, { key, name, groupName }) {
        const k = String(key);
        const form = await kit.store.get<Form>("forms", k);
        if (!form) throw new Error("That form isn't there any more.");
        const done = await renameForm(kit, k, form, typeof name === "string" ? name : null, typeof groupName === "string" ? groupName : null);
        if ("error" in done) throw new Error(done.error.replace(/[_*]/g, ""));
        return { key: k, name: done.form.name, groupName: done.form.ownGroup ? groupNameOf(done.form) : null };
      },
      /** Replace a form's address; its submissions stay. Returns the new one. */
      async newAddress(kit, { key }) {
        const k = String(key);
        const form = await kit.store.get<Form>("forms", k);
        if (!form || form.closed) throw new Error("That form isn't open.");
        return { key: k, url: (await replaceAddress(kit, k, form)).url };
      },
      /** Give a form its own WhatsApp group. */
      async giveGroup(kit, { key }) {
        const k = String(key);
        const form = await kit.store.get<Form>("forms", k);
        if (!form || form.closed || form.ownGroup) return;
        const next: Form = { ...form, ownGroup: true };
        delete next.sendTo;
        await openGroup(kit, k, next);
        await kit.store.put("forms", k, next as unknown as Json, next.created);
      },
      /** Send a form's submissions to another form's own group (`to`, its key), or to the main group (`to` null). */
      async moveForm(kit, { key, to }) {
        const k = String(key);
        const form = await kit.store.get<Form>("forms", k);
        if (!form) throw new Error("That form isn't there any more.");
        const done = await moveForm(kit, k, form, typeof to === "string" && to ? to : null);
        if ("error" in done) throw new Error(done.error.replace(/[_*]/g, ""));
        return { key: k, sendTo: done.form.sendTo ?? null };
      },
      /** Delete a form with everything it received, files included. Forms that shared its group go back to the main group. */
      async deleteForm(kit, { key }) {
        const k = String(key);
        await kit.hooks.remove(k);
        await kit.groups.close(k);
        for (const f of await forms(kit)) {
          if (f.data.sendTo !== k) continue;
          const next: Form = { ...f.data };
          delete next.sendTo;
          await kit.store.put("forms", f.key, next as unknown as Json, next.created);
        }
        for (const s of await kit.store.list<Submission>("submissions")) if (s.data.form === k) await removeSubmission(kit, s.key);
        for (const d of await kit.store.list("days", { prefix: `${k}:` })) await kit.store.delete("days", d.key);
        await kit.store.delete("forms", k);
      },
      async deleteSubmission(kit, { id }) {
        await removeSubmission(kit, String(id));
      },
      async setDone(kit, { id, done }) {
        const s = await kit.store.get<Submission>("submissions", String(id));
        if (s) await kit.store.put("submissions", String(id), { ...s, done: !!done } as unknown as Json, s.at);
      },
    },
  },
});
