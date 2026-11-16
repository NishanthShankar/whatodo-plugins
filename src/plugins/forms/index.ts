import { definePlugin, type HookFile, type Json, type Kit } from "../../sdk";

/**
 * Forms: a backend for the forms on your own websites. Each form gets a web address; whatever
 * is posted to it (fields and files) is kept here and announced in the Forms group.
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

const DONE_EMOJI = new Set(["✅", "✔️", "☑️", "👍"]);
/** Most fields shown in one message; the rest are on the page. */
const SHOW_FIELDS = 12;
/** Longest value shown in a message. */
const SHOW_CHARS = 300;
/** Forms one person can have. */
const MAX_FORMS = 50;

const HELP = [
  "*Forms*",
  "",
  "_new form contact_ makes a form and gives you its address",
  "_forms_ lists your forms and their addresses",
  "_address contact_ shows one form's address again",
  "_last_ (or _last contact_) shows the latest submission",
  "_close contact_ stops a form taking submissions",
  "",
  "Each submission arrives here as a message. React ✅ when you've dealt with it.",
  "Everything is kept on app.whatodo.today, where you can open the files and delete things.",
].join("\n");

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
  return form ? { key, form } : null;
}

async function createForm(kit: Kit, name: string): Promise<{ key: string; form: Form } | { error: string }> {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 40);
  const key = slug(clean);
  if (!key) return { error: "Give the form a name, like _new form contact_." };
  const existing = await kit.store.get<Form>("forms", key);
  if (existing && !existing.closed) return { error: `You already have a form called *${existing.name}*. Send _address ${key}_ for its address.` };
  if (!existing && (await forms(kit)).length >= MAX_FORMS) return { error: `That's the most forms I can keep (${MAX_FORMS}). Delete one on app.whatodo.today first.` };
  // Reopening a closed form gives it a new address; the old one stays dead.
  const url = await kit.hooks.url(key);
  const form: Form = { name: existing?.name ?? clean, url, createdDay: existing?.createdDay ?? kit.today, created: existing?.created ?? kit.now, count: existing?.count ?? 0 };
  await kit.store.put("forms", key, form as unknown as Json, form.created);
  return { key, form };
}

function addressText(key: string, form: Form, fresh: boolean): string {
  return [
    fresh ? `📬 Your form *${form.name}* is ready.` : `📬 *${form.name}*`,
    "",
    "Post to this address:",
    form.url,
    "",
    "Use it as your form's _action_ (method POST), or send JSON to it from a script. Files work with a normal file field.",
    fresh ? `\nSubmissions will arrive here. Send _address ${key}_ to see this again.` : "",
  ]
    .join("\n")
    .trim();
}

/** A submission's fields in the order the form sent them. */
function ordered(s: Pick<Submission, "fields" | "order">): [string, string][] {
  const names = [...(s.order ?? []).filter((k) => k in s.fields), ...Object.keys(s.fields).filter((k) => !(s.order ?? []).includes(k))];
  return names.map((k) => [k, s.fields[k]]);
}

function submissionText(formName: string, s: Submission): string {
  const lines = [`📬 *${formName}*`];
  const entries = ordered(s);
  for (const [k, v] of entries.slice(0, SHOW_FIELDS)) {
    const value = v.length > SHOW_CHARS ? `${v.slice(0, SHOW_CHARS)}…` : v;
    lines.push(`*${k}:* ${value}`);
  }
  if (entries.length > SHOW_FIELDS) lines.push(`_and ${entries.length - SHOW_FIELDS} more fields_`);
  if (!entries.length && !s.files.length) lines.push("_An empty submission._");
  if (s.files.length) lines.push(`📎 ${s.files.map((f) => `${f.name} (${size(f.size)})`).join(", ")}`);
  if (s.files.length) lines.push("_Open the files on app.whatodo.today._");
  return lines.join("\n").slice(0, 3900);
}

async function removeSubmission(kit: Kit, id: string) {
  const s = await kit.store.get<Submission>("submissions", id);
  if (!s) return;
  for (const f of s.files) await kit.files.remove(f.id);
  await kit.store.delete("submissions", id);
}

export default definePlugin({
  id: "forms",
  version: "1.0.1",
  sdk: "1",
  name: "Forms",
  icon: "📬",
  tagline: "Your website's forms, delivered to WhatsApp. Files included.",
  description:
    "A backend for the forms on your own websites. Make a form, paste its address into your site, and every submission arrives as a WhatsApp message, with its fields and files kept on app.whatodo.today.",
  groupName: "📬 Forms",
  price: 0,
  tier: 2,
  unlisted: true,
  listing: {
    title: "Form Backend on WhatsApp: Get Submissions as Chats | whatodo",
    description: "Point your website's form at whatodo and get every submission as a WhatsApp message. File uploads included. Records kept on the web.",
    h1: "Form backend that delivers to WhatsApp",
  },
  welcome:
    "📬 You've installed *Forms*.\n\nSend _new form contact_ to make your first form. I'll give you an address to paste into your website, and every submission will arrive here.\n\nSend _help_ for more.",
  help: HELP,
  settings: { dailyMessages: 30 },

  async onMessage(event, kit) {
    const text = event.text.trim().replace(/\s+/g, " ");
    const lower = text.toLowerCase().replace(/[!.]+$/, "");

    let m = text.match(/^(?:new|add|create|make)\s+(?:a\s+)?form\s+(.+)$/i);
    if (m) {
      const made = await createForm(kit, m[1]);
      if ("error" in made) return kit.send(made.error);
      return kit.send(addressText(made.key, made.form, true));
    }

    if (/^(forms|list|my forms|all forms)$/.test(lower)) {
      const all = await forms(kit);
      if (!all.length) return kit.send("No forms yet. Send _new form contact_ to make one.");
      const lines = ["*Your forms*", ""];
      for (const f of all) {
        lines.push(`*${f.data.name}*${f.data.closed ? " (closed)" : ""}: ${f.data.count} submission${f.data.count === 1 ? "" : "s"}`);
        if (!f.data.closed) lines.push(f.data.url);
        lines.push("");
      }
      return kit.send(lines.join("\n").trim());
    }

    m = lower.match(/^(?:address|url|link|endpoint)(?:\s+(?:of|for))?\s+(.+)$/);
    if (m) {
      const found = await findForm(kit, m[1]);
      if (!found) return kit.send(`I don't have a form called "${m[1]}". Send _forms_ to see yours.`);
      if (found.form.closed) return kit.send(`*${found.form.name}* is closed. Send _new form ${found.key}_ to open it again with a new address.`);
      return kit.send(addressText(found.key, found.form, false));
    }

    m = lower.match(/^(?:last|latest|recent)(?:\s+(.+))?$/);
    if (m) {
      const found = m[1] ? await findForm(kit, m[1]) : null;
      if (m[1] && !found) return kit.send(`I don't have a form called "${m[1]}". Send _forms_ to see yours.`);
      const all = await kit.store.list<Submission>("submissions");
      const mine = found ? all.filter((s) => s.data.form === found.key) : all;
      const latest = mine.at(-1);
      if (!latest) return kit.send("Nothing has come in yet.");
      const form = await kit.store.get<Form>("forms", latest.data.form);
      const ref: SubmissionRef = { kind: "submission", id: latest.key };
      return kit.send(submissionText(form?.name ?? latest.data.form, latest.data), { ref: ref as unknown as Json });
    }

    m = lower.match(/^(?:close|stop|pause)(?:\s+form)?\s+(.+)$/);
    if (m) {
      const found = await findForm(kit, m[1]);
      if (!found) return kit.send(`I don't have a form called "${m[1]}". Send _forms_ to see yours.`);
      await kit.hooks.remove(found.key);
      await kit.store.put("forms", found.key, { ...found.form, closed: true } as unknown as Json, found.form.created);
      kit.react("👍");
      return kit.send(`*${found.form.name}* is closed. Its address no longer works. What it received is still on app.whatodo.today.`);
    }

    kit.send("I didn't get that. Send _help_ to see what I can do.");
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
    if (sentToday === limit) {
      return kit.send(`📬 *${form.name}* has had more than ${limit} submissions today. I'll stop messaging about it until tomorrow. They're all on app.whatodo.today.`);
    }
    const ref: SubmissionRef = { kind: "submission", id };
    kit.send(submissionText(form.name, s), { ref: ref as unknown as Json });
  },

  async onReaction(event, kit) {
    // ✅ on a submission's message marks it dealt with; taking it off undoes that.
    if (!isRef(event.ref)) return;
    const s = await kit.store.get<Submission>("submissions", event.ref.id);
    if (!s) return;
    const done = !!event.emoji && DONE_EMOJI.has(event.emoji);
    if (!event.emoji || done) await kit.store.put("submissions", event.ref.id, { ...s, done } as unknown as Json, s.at);
  },

  web: {
    lockable: true,
    async load(kit, args) {
      const only = typeof args.form === "string" ? args.form : null;
      const limit = Math.min(Math.max(Number(args.limit ?? 200) || 200, 1), 500);
      const all = await kit.store.list<Submission>("submissions");
      const mine = (only ? all.filter((s) => s.data.form === only) : all).reverse().slice(0, limit);
      return {
        forms: (await forms(kit)).map((f) => ({ key: f.key, name: f.data.name, url: f.data.url, closed: !!f.data.closed, count: f.data.count, createdDay: f.data.createdDay })),
        submissions: mine.map((s) => ({ id: s.key, form: s.data.form, at: s.data.at, fields: s.data.fields, order: ordered(s.data).map(([k]) => k), files: s.data.files, origin: s.data.origin, done: !!s.data.done })),
        total: all.length,
      } as unknown as Json;
    },
    actions: {
      async createForm(kit, { name }) {
        const made = await createForm(kit, String(name ?? ""));
        if ("error" in made) throw new Error(made.error.replace(/[_*]/g, ""));
        return { key: made.key, url: made.form.url };
      },
      async closeForm(kit, { key }) {
        const form = await kit.store.get<Form>("forms", String(key));
        if (!form) return;
        await kit.hooks.remove(String(key));
        await kit.store.put("forms", String(key), { ...form, closed: true } as unknown as Json, form.created);
      },
      /** Delete a form with everything it received, files included. */
      async deleteForm(kit, { key }) {
        const k = String(key);
        await kit.hooks.remove(k);
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
