/**
 * A test harness for plugins: an in-memory Kit that behaves like telcurio's, plus helpers to
 * drive events and read what the plugin did. Every plugin's tests use this, so a plugin that
 * passes here behaves the same inside telcurio.
 *
 *   const t = createTestKit({ today: "2026-11-15", hour: 21 });
 *   await t.message(plugin, "add meditate");
 *   expect(t.reactions).toEqual(["👍"]);
 */
import { checkAsk, type HookFile, type Json, type Kit, type Link, type PluginDef, type Sender, type StoredItem } from "./sdk";

export interface TestKitOptions {
  /** Today in the person's zone, "YYYY-MM-DD". Default "2026-11-15". */
  today?: string;
  /** Local hour for kit.time.hour(). Default 21. */
  hour?: number;
  person?: { name: string | null; timezone: string };
  /** Settings for the install; the plugin's defaults are applied under these. */
  settings?: Record<string, Json>;
}

export interface Sent {
  text: string;
  ref: Json | null;
  /** The extra group it was posted in; null for the main group. */
  group: string | null;
}

export interface Asked {
  question: string;
  options: string[];
  ref: Json | null;
  /** The extra group it was asked in; null for the main group. */
  group: string | null;
  /** The line posted once a one-person question is answered; false for none. */
  confirm: string | false;
  /** Asked with `keep`: the poll stays, and answers can change until it is closed. */
  keep: boolean;
  /** False once it was answered by the only person (unless `keep`), replaced, or closed with kit.close(). */
  open: boolean;
}

function shiftDay(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

const MAX_TEXT = 4000;

/**
 * A link as telcurio would hand it over, for `t.message(..., links)`. Give the address and
 * whatever the page says; the rest is filled in as a page that was read with nothing on it.
 */
export function link(url: string, found: Partial<Omit<Link, "url">> = {}): Link {
  return { url, canonical: url, site: "example.com", kind: "page", found: true, title: null, description: null, author: null, image: null, seconds: null, ...found };
}

export function createTestKit(opts: TestKitOptions = {}) {
  const rows = new Map<string, { data: Json; sort: string | number | null }>();
  const sent: Sent[] = [];
  /** Questions asked with kit.ask(), in order. */
  const asked: Asked[] = [];
  /** Who answered what, per question. */
  const answers = new Map<Asked, Map<string, number>>();
  const reactions: string[] = [];
  /** Refs given to kit.mark(), in order: the person's messages the plugin asked to remember. */
  const marks: Json[] = [];
  /** Fallback texts from kit.unsure(), in order. In telcurio these trigger intent understanding. */
  const unsures: string[] = [];
  /** Hooks that are open, by key. */
  const hooks = new Set<string>();
  /** Ids passed to kit.files.remove(), in order. */
  const removedFiles: string[] = [];
  /** Extra groups that are open, by key. */
  const groups = new Map<string, { name: string; hello: string | null }>();
  /** The extra group the event being handled came from: kit.send defaults to it. */
  let here: string | null = null;
  let counter = 0;
  const state = { today: opts.today ?? "2026-11-15", hour: opts.hour ?? 21 };
  const settings: Record<string, Json> = { ...(opts.settings ?? {}) };

  // Data must survive a JSON round trip, exactly as it does in telcurio's database.
  const clone = (v: Json): Json => JSON.parse(JSON.stringify(v));

  /** The plugin being driven: its permissions decide what the kit allows, as in telcurio. */
  let current: PluginDef | null = null;
  const need = (permission: "hooks" | "groups", what: string) => {
    if (current && !current.permissions?.includes(permission)) throw new Error(`${current.id}: ${what} needs the "${permission}" permission`);
  };

  const kit: Kit = {
    get now() {
      return Date.parse(`${state.today}T${String(state.hour).padStart(2, "0")}:00:00Z`);
    },
    get today() {
      return state.today;
    },
    get person() {
      return person;
    },
    settings,
    async setSettings(patch) {
      Object.assign(settings, clone(patch as Json) as Record<string, Json>);
    },
    store: {
      async get(c, k) {
        const r = rows.get(`${c}\u0000${k}`);
        return (r ? clone(r.data) : null) as never;
      },
      async put(c, k, data, sort) {
        if (data === undefined) throw new Error("store.put: data is undefined (use null or delete)");
        rows.set(`${c}\u0000${k}`, { data: clone(data), sort: sort ?? null });
      },
      async delete(c, k) {
        rows.delete(`${c}\u0000${k}`);
      },
      async list(c, o = {}) {
        const out: StoredItem<never>[] = [];
        for (const [key, v] of rows) {
          const [coll, k] = key.split("\u0000");
          if (coll !== c) continue;
          if (o.prefix && !k.startsWith(o.prefix)) continue;
          if (o.from !== undefined && (v.sort === null || v.sort < o.from)) continue;
          if (o.to !== undefined && (v.sort === null || v.sort > o.to)) continue;
          out.push({ key: k, data: clone(v.data) as never, sort: v.sort });
        }
        out.sort((a, b) => {
          if (a.sort !== b.sort) {
            if (a.sort === null) return 1;
            if (b.sort === null) return -1;
            return a.sort < b.sort ? -1 : 1;
          }
          return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
        });
        return o.limit ? out.slice(0, o.limit) : out;
      },
    },
    send(text, o) {
      if (typeof text !== "string" || !text.trim()) throw new Error("kit.send: empty message");
      if (text.length > MAX_TEXT) throw new Error(`kit.send: message longer than ${MAX_TEXT} characters`);
      sent.push({ text, ref: o?.ref === undefined ? null : clone(o.ref), group: o?.group ?? here });
    },
    ask(question, options, o) {
      checkAsk(question, options);
      const ref = o?.ref === undefined ? null : clone(o.ref);
      // Asking again with the same ref replaces the earlier question.
      if (ref !== null) for (const a of asked) if (a.open && JSON.stringify(a.ref) === JSON.stringify(ref)) a.open = false;
      asked.push({ question, options: [...options], ref, group: o?.group ?? here, confirm: o?.confirm ?? "{{question}}: {{option}}", keep: o?.keep === true, open: true });
    },
    close(ref) {
      for (const a of asked) if (a.open && JSON.stringify(a.ref) === JSON.stringify(ref)) a.open = false;
    },
    react(emoji) {
      reactions.push(emoji);
    },
    mark(ref) {
      if (ref === undefined) throw new Error("kit.mark: give a ref");
      marks.push(clone(ref));
    },
    unsure(fallback) {
      if (typeof fallback !== "string" || !fallback.trim()) throw new Error("kit.unsure: give a fallback message");
      unsures.push(fallback);
    },
    id: () => `id${++counter}`,
    hooks: {
      async url(key) {
        need("hooks", "kit.hooks.url");
        if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(key)) throw new Error(`kit.hooks.url: "${key}" must be lowercase letters, digits and dashes`);
        hooks.add(key);
        return `https://hooks.test/${key}`;
      },
      async remove(key) {
        hooks.delete(key);
      },
    },
    files: {
      async remove(id) {
        removedFiles.push(id);
      },
    },
    groups: {
      async open(key, o) {
        need("groups", "kit.groups.open");
        if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(key)) throw new Error(`kit.groups.open: "${key}" must be lowercase letters, digits and dashes`);
        if (!o?.name?.trim() || o.name.length > 25) throw new Error("kit.groups.open: give the group a name of 1-25 characters");
        if (!groups.has(key)) groups.set(key, { name: o.name, hello: o.hello ?? null });
      },
      async close(key) {
        groups.delete(key);
      },
    },
    time: {
      day: () => state.today,
      shiftDay,
      hour: () => state.hour,
    },
  };

  const person = opts.person ?? { name: "Test Person", timezone: "Asia/Kolkata" };
  /**
   * Who an event is from. Nothing: the person who added the plugin. A string: another member
   * with that name (their id is the name in lowercase, so the same name is the same person).
   */
  const senderOf = (plugin: PluginDef, from?: string | Partial<Sender>): Sender => {
    const owner: Sender = { id: "owner", name: person.name, owner: true };
    if (from === undefined) return owner;
    const s: Sender =
      typeof from === "string"
        ? { id: from.toLowerCase().replace(/\s+/g, "-"), name: from, owner: false }
        : { id: from.id ?? "owner", name: from.name ?? null, owner: from.owner ?? (from.id ?? "owner") === "owner" };
    if (!s.owner && !plugin.permissions?.includes("members")) {
      throw new Error(`${plugin.id}: a message from someone else needs the "members" permission (telcurio wouldn't deliver it)`);
    }
    return s;
  };

  const withDefaults = (plugin: PluginDef) => {
    current = plugin;
    for (const [k, v] of Object.entries(plugin.settings ?? {})) if (!(k in settings)) settings[k] = v;
  };

  return {
    kit,
    sent,
    asked,
    reactions,
    marks,
    unsures,
    /** Keys of the hooks that are open. */
    hooks,
    /** Extra groups that are open: key -> { name, hello }. */
    groups,
    removedFiles,
    /** Move the clock. */
    setToday(day: string) {
      state.today = day;
    },
    setHour(hour: number) {
      state.hour = hour;
    },
    /** Everything stored, for assertions: { "collection/key": data }. */
    dump(): Record<string, Json> {
      return Object.fromEntries([...rows].map(([k, v]) => [k.replace("\u0000", "/"), v.data]));
    },
    async install(plugin: PluginDef) {
      withDefaults(plugin);
      await plugin.onInstall?.(kit);
    },
    /**
     * `group`: the key of the extra group the message was sent in (null: the main group).
     * `from`: who sent it. Leave out for the person who added the plugin; a name ("Asha") for
     * another member of the group, which needs the "members" permission.
     * `links`: what telcurio read from the links in the message (build each with `link()`),
     * which needs the "links" permission.
     */
    async message(plugin: PluginDef, text: string, quotedRef: Json | null = null, group: string | null = null, from?: string | Partial<Sender>, links?: Link[]) {
      withDefaults(plugin);
      const sender = senderOf(plugin, from);
      if (links && !plugin.permissions?.includes("links")) throw new Error(`${plugin.id}: link details need the "links" permission (telcurio wouldn't read them)`);
      here = group;
      try {
        if (/^(help|\?|menu|commands)$/i.test(text.trim())) return kit.send(plugin.help);
        await plugin.onMessage?.({ text, quotedRef, group, sender, ...(links ? { links: links.map((l) => ({ ...l })) } : {}) }, kit);
      } finally {
        here = null;
      }
    },
    async react(plugin: PluginDef, emoji: string | null, ref: Json, group: string | null = null, from?: string | Partial<Sender>) {
      withDefaults(plugin);
      const sender = senderOf(plugin, from);
      here = group;
      try {
        await plugin.onReaction?.({ emoji, ref, group, sender }, kit);
      } finally {
        here = null;
      }
    },
    /**
     * Someone answers the open question asked with `ref`; `choice` counts from 0. As in
     * telcurio: a plugin without "members" has one person, so the answer settles the question
     * and its `confirm` line is posted; with "members" it stays open until `kit.close(ref)`,
     * and a second, different answer from the same person arrives with `changed: true`.
     * A question asked with `keep` stays open and posts no confirm line, whoever is in the group.
     * Throws when no such question is open or the choice isn't one of its options.
     */
    async answer(plugin: PluginDef, ref: Json | null, choice: number, from?: string | Partial<Sender>) {
      withDefaults(plugin);
      const sender = senderOf(plugin, from);
      const want = JSON.stringify(ref);
      const q = [...asked].reverse().find((a) => a.open && JSON.stringify(a.ref) === want);
      if (!q) throw new Error(`${plugin.id}: no open question with ref ${want}`);
      if (!(Number.isInteger(choice) && choice >= 0 && choice < q.options.length)) {
        throw new Error(`${plugin.id}: choice ${choice} isn't one of the ${q.options.length} options`);
      }
      const shared = !!plugin.permissions?.includes("members");
      const votes = (answers.get(q) ?? answers.set(q, new Map()).get(q))!;
      const before = votes.get(sender.id);
      if (before === choice) return;
      votes.set(sender.id, choice);
      if (!shared && !q.keep) q.open = false;
      here = q.group;
      try {
        await plugin.onAnswer?.({ ref: q.ref, choice, option: q.options[choice], group: q.group, sender, ...(before === undefined ? {} : { changed: true }) }, kit);
        if (!shared && !q.keep && q.confirm !== false) {
          sent.push({ text: q.confirm.replace(/\{\{question\}\}/g, q.question).replace(/\{\{option\}\}/g, q.options[choice]), ref: null, group: q.group });
        }
      } finally {
        here = null;
      }
    },
    /** What understand.targets() returns right now. */
    async targets(plugin: PluginDef) {
      withDefaults(plugin);
      return (await plugin.understand?.targets?.(kit)) ?? {};
    },
    /**
     * Deliver an intent as telcurio would after kit.unsure(): checks the intent and target are
     * ones the plugin declared, then calls onIntent.
     */
    async intent(plugin: PluginDef, text: string, intent: string, target: string | null = null, confidence = 1, from?: string | Partial<Sender>) {
      withDefaults(plugin);
      if (!plugin.understand || !plugin.onIntent) throw new Error(`${plugin.id} doesn't declare understand/onIntent`);
      if (!(intent in plugin.understand.intents)) throw new Error(`${plugin.id} has no intent "${intent}"`);
      if (target !== null) {
        const targets = (await plugin.understand.targets?.(kit)) ?? {};
        if (!(target in targets)) throw new Error(`${plugin.id}: "${target}" isn't one of its targets`);
      }
      await plugin.onIntent({ text, intent, target, confidence, sender: senderOf(plugin, from) }, kit);
    },
    /**
     * Deliver a request to a hook as telcurio would. Throws when the hook isn't open (telcurio
     * would have answered "not found" without calling the plugin).
     */
    async hook(plugin: PluginDef, key: string, fields: Record<string, string> = {}, files: HookFile[] = [], origin: string | null = null) {
      withDefaults(plugin);
      if (!hooks.has(key)) throw new Error(`${plugin.id}: hook "${key}" isn't open`);
      if (!plugin.onHook) throw new Error(`${plugin.id} has no onHook`);
      await plugin.onHook({ key, fields: { ...fields }, files: files.map((f) => ({ ...f })), origin }, kit);
    },
    async schedule(plugin: PluginDef, id: string) {
      withDefaults(plugin);
      await plugin.onSchedule?.({ id }, kit);
    },
    async upgrade(plugin: PluginDef, fromVersion: string) {
      withDefaults(plugin);
      await plugin.onUpgrade?.(fromVersion, kit);
    },
    async load(plugin: PluginDef, args: Record<string, Json> = {}) {
      withDefaults(plugin);
      if (!plugin.web) throw new Error(`${plugin.id} has no web page`);
      return plugin.web.load(kit, args);
    },
    async act(plugin: PluginDef, action: string, args: Record<string, Json> = {}) {
      withDefaults(plugin);
      const fn = plugin.web?.actions?.[action];
      if (!fn) throw new Error(`${plugin.id} has no web action ${action}`);
      return fn(kit, args);
    },
  };
}
