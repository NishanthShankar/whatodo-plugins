/**
 * A test harness for plugins: an in-memory Kit that behaves like Zelfred's, plus helpers to
 * drive events and read what the plugin did. Every plugin's tests use this, so a plugin that
 * passes here behaves the same inside Zelfred.
 *
 *   const t = createTestKit({ today: "2026-11-15", hour: 21 });
 *   await t.message(plugin, "add meditate");
 *   expect(t.reactions).toEqual(["👍"]);
 */
import { checkAsk, type EntryEvent, type HookFile, type Json, type Kit, type Link, type Photo, type Place, type PluginDef, type Sender, type SharedPage, type StoredItem } from "./sdk";

export interface TestKitOptions {
  /** Today in the person's zone, "YYYY-MM-DD". Default "2026-11-15". */
  today?: string;
  /** Local hour for kit.time.hour(). Default 21. */
  hour?: number;
  /** `currency`: what Zelfred already knows the person counts in ("INR"). Left out: nothing yet. */
  person?: { name: string | null; timezone: string; currency?: string | null };
  /** Settings for the install; the plugin's defaults are applied under these. */
  settings?: Record<string, Json>;
}

export interface Sent {
  text: string;
  ref: Json | null;
  /** The photo sent with it (kit.send's `photo`), when there is one. */
  photo?: string;
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
  /** Asked with `multiple`: a tick list. */
  multiple: boolean;
  /** The message posted just before the poll, as written (`{{mention}}` not filled in); null for none. */
  intro: string | null;
  /** The sender id tagged in the intro; null for none. */
  mention: string | null;
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
 * A link as Zelfred would hand it over, for `t.message(..., links)`. Give the address and
 * whatever the page says; the rest is filled in as a page that was read with nothing on it.
 */
export function link(url: string, found: Partial<Omit<Link, "url">> = {}): Link {
  return { url, canonical: url, site: "example.com", kind: "page", found: true, title: null, description: null, author: null, image: null, seconds: null, ...found };
}

/** A photo as Zelfred would hand it over, for `t.message(..., { photos: [photo("p1")] })`. */
export function photo(id: string, found: Partial<Omit<Photo, "id">> = {}): Photo {
  return { id, type: "image/jpeg", size: 120_000, ...found };
}

export function createTestKit(opts: TestKitOptions = {}) {
  const rows = new Map<string, { data: Json; sort: string | number | null }>();
  const sent: Sent[] = [];
  /** Questions asked with kit.ask(), in order. */
  const asked: Asked[] = [];
  /** Who answered what, per question. */
  const answers = new Map<Asked, Map<string, number>>();
  /** The same for tick lists: what each person has ticked. */
  const ticked = new Map<Asked, Map<string, number[]>>();
  const reactions: string[] = [];
  /** Sender ids given to kit.signUp(), in order: people who agreed to a profile of their own. */
  const signedUp: string[] = [];
  /** Refs given to kit.mark(), in order: the person's messages the plugin asked to remember. */
  const marks: Json[] = [];
  /** What was given to kit.reactTo(), in order: a reaction put on the person's messages marked with a ref. */
  const reactTos: { ref: Json; emoji: string }[] = [];
  /** Fallback texts from kit.unsure(), in order. In Zelfred these trigger intent understanding. */
  const unsures: string[] = [];
  /** Hooks that are open, by key. */
  const hooks = new Set<string>();
  /** Shared pages that are open: key -> how many addresses that key has had (a new one after each remove). */
  const shares = new Map<string, number>();
  const shareCount = new Map<string, number>();
  /** Links the plugin asked Zelfred to read with kit.links.read(), in order. Answer one with `t.link()`. */
  const reads: { url: string; ref: Json }[] = [];
  /** Ids passed to kit.files.remove(), in order. */
  const removedFiles: string[] = [];
  /** What the plugin told the person's other systems with kit.emit(), in order. */
  const emitted: { event: string; data: Json; group?: string | null | (string | null)[] }[] = [];
  /** Extra groups that are open, by key. */
  const groups = new Map<string, { name: string; hello: string | null }>();
  /** The extra group the event being handled came from: kit.send defaults to it. */
  let here: string | null = null;
  /**
   * Groups (null: the main one) where someone other than the owner has written or answered.
   * As in Zelfred, a question is only shared once there is more than one person to answer it.
   */
  const crowded = new Set<string | null>();
  let counter = 0;
  const state = { today: opts.today ?? "2026-11-15", hour: opts.hour ?? 21 };
  const settings: Record<string, Json> = { ...(opts.settings ?? {}) };

  // Data must survive a JSON round trip, exactly as it does in Zelfred's database.
  const clone = (v: Json): Json => JSON.parse(JSON.stringify(v));

  /** The plugin being driven: its permissions decide what the kit allows, as in Zelfred. */
  let current: PluginDef | null = null;
  /** Photos Zelfred holds for this install: the ones handed over with a message, and any added with `t.addFile()`. */
  const files = new Map<string, { type: string; size: number }>();
  const need = (permission: "hooks" | "groups" | "share" | "links" | "photos", what: string) => {
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
      if (o?.photo !== undefined) {
        need("photos", "kit.send with a photo");
        if (!files.has(o.photo)) throw new Error(`kit.send: "${o.photo}" isn't one of this install's photos`);
        if (typeof text !== "string" || text.length > 1000) throw new Error("kit.send: a photo's caption is up to 1000 characters");
      } else if (typeof text !== "string" || !text.trim()) throw new Error("kit.send: empty message");
      if (text.length > MAX_TEXT) throw new Error(`kit.send: message longer than ${MAX_TEXT} characters`);
      sent.push({ text, ref: o?.ref === undefined ? null : clone(o.ref), group: o?.group ?? here, ...(o?.photo !== undefined ? { photo: o.photo } : {}) });
    },
    ask(question, options, o) {
      checkAsk(question, options, o);
      if (o?.mention !== undefined && current && !current.permissions?.includes("members")) throw new Error(`${current.id}: a mention in kit.ask needs the "members" permission`);
      const ref = o?.ref === undefined ? null : clone(o.ref);
      // Asking again with the same ref replaces the earlier question.
      if (ref !== null) for (const a of asked) if (a.open && JSON.stringify(a.ref) === JSON.stringify(ref)) a.open = false;
      asked.push({ question, options: [...options], ref, group: o?.group ?? here, confirm: o?.confirm ?? "{{question}}: {{option}}", keep: o?.keep === true || o?.multiple === true, multiple: o?.multiple === true, intro: o?.intro ?? null, mention: o?.mention ?? null, open: true });
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
    reactTo(ref, emoji) {
      if (ref === undefined) throw new Error("kit.reactTo: give a ref");
      if (typeof emoji !== "string") throw new Error("kit.reactTo: give an emoji, or \"\" to take the reaction off");
      reactTos.push({ ref: clone(ref), emoji });
    },
    unsure(fallback) {
      if (typeof fallback !== "string" || !fallback.trim()) throw new Error("kit.unsure: give a fallback message");
      unsures.push(fallback);
    },
    async signUp(senderId) {
      if (current && !current.permissions?.includes("members")) throw new Error(`${current.id}: kit.signUp needs the "members" permission`);
      if (typeof senderId !== "string" || !senderId) throw new Error("kit.signUp: give the sender's id");
      if (!signedUp.includes(senderId)) signedUp.push(senderId);
    },
    async learn(what) {
      const code = what?.currency;
      if (code !== undefined && !/^[A-Z]{3}$/.test(String(code))) throw new Error('kit.learn: a currency is a three letter code like "INR"');
      // As in Zelfred: kept only while nothing is known.
      if (code !== undefined && !person.currency) person.currency = code;
    },
    async emit(event, data, opts) {
      if (current && !current.permissions?.includes("api")) throw new Error(`${current.id}: kit.emit needs the "api" permission`);
      if (current && !(event in (current.api?.events ?? {}))) throw new Error(`${current.id}: kit.emit("${event}") isn't in api.events`);
      emitted.push({ event, data: clone(data), ...(opts?.group !== undefined ? { group: opts.group } : {}) });
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
    share: {
      async url(key) {
        need("share", "kit.share.url");
        if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(key)) throw new Error(`kit.share.url: "${key}" must be lowercase letters, digits and dashes`);
        if (!shares.has(key)) {
          shareCount.set(key, (shareCount.get(key) ?? 0) + 1);
          shares.set(key, shareCount.get(key)!);
        }
        return `https://share.test/${key}-${shares.get(key)}`;
      },
      async find(key) {
        return shares.has(key) ? `https://share.test/${key}-${shares.get(key)}` : null;
      },
      async remove(key) {
        shares.delete(key);
      },
    },
    links: {
      async read(url, ref) {
        need("links", "kit.links.read");
        if (typeof url !== "string" || !/^https?:\/\//i.test(url)) throw new Error("kit.links.read: give a web address");
        if (ref === undefined) throw new Error("kit.links.read: give a ref");
        reads.push({ url, ref: clone(ref) });
      },
    },
    files: {
      async remove(id) {
        removedFiles.push(id);
        files.delete(id);
      },
      async get(id) {
        const f = files.get(id);
        return f ? { id, ...f } : null;
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
      async rename(key, name) {
        need("groups", "kit.groups.rename");
        if (!name?.trim() || name.length > 25) throw new Error("kit.groups.rename: give the group a name of 1-25 characters");
        const g = groups.get(key);
        if (g) g.name = name;
      },
    },
    time: {
      // The kit's own moment is "today"; any other instant is worked out from the clock (at UTC, as `now` is).
      day: (ms?: number) => (ms === undefined || ms === kit.now ? state.today : new Date(ms).toISOString().slice(0, 10)),
      shiftDay,
      hour: () => state.hour,
    },
  };

  // The owner's id is the one their events carry (see senderOf).
  const person: { id: string; name: string | null; timezone: string; currency: string | null } = { id: "owner", currency: null, ...(opts.person ?? { name: "Test Person", timezone: "Asia/Kolkata" }) };
  /**
   * Who an event is from. Nothing: the person who added the plugin. A string: another member
   * with that name (their id is the name in lowercase, so the same name is the same person).
   */
  const senderOf = (plugin: PluginDef, from?: string | Partial<Sender>): Sender => {
    const owner: Sender = { id: "owner", name: person.name, owner: true, profile: true };
    if (from === undefined) return owner;
    const s: Sender =
      typeof from === "string"
        ? { id: from.toLowerCase().replace(/\s+/g, "-"), name: from, owner: false, profile: false }
        : { id: from.id ?? "owner", name: from.name ?? null, owner: from.owner ?? (from.id ?? "owner") === "owner", profile: from.profile ?? (from.owner ?? (from.id ?? "owner") === "owner") };
    // As in Zelfred: once they agreed (kit.signUp), their events say so.
    if (signedUp.includes(s.id)) s.profile = true;
    if (!s.owner && !plugin.permissions?.includes("members")) {
      throw new Error(`${plugin.id}: a message from someone else needs the "members" permission (Zelfred wouldn't deliver it)`);
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
    reactTos,
    signedUp,
    unsures,
    /** Keys of the hooks that are open. */
    hooks,
    /** Extra groups that are open: key -> { name, hello }. */
    groups,
    removedFiles,
    /** A photo added on the plugin's page: Zelfred holds it and the page passes its id to an action. */
    addFile(id: string, found: { type?: string; size?: number } = {}) {
      files.set(id, { type: found.type ?? "image/jpeg", size: found.size ?? 120_000 });
      return id;
    },
    emitted,
    /** Keys of the shared pages that are open. */
    shares,
    /** Links asked for with kit.links.read(), in order. */
    reads,
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
     * `links`: what Zelfred read from the links in the message (build each with `link()`),
     * which needs the "links" permission.
     * `more`: the photo in the message (`photos`, built with `photo()`; needs "photos") and the
     * position shared in it (`place`; needs "location"), and the people tagged in it
     * (`mentions`, each a name or a part of a Sender, as `from` is; needs "members"). With any
     * of them, `text` may be empty.
     */
    async message(plugin: PluginDef, text: string, quotedRef: Json | null = null, group: string | null = null, from?: string | Partial<Sender>, links?: Link[], more?: { photos?: Photo[]; place?: Place; mentions?: (string | Partial<Sender>)[] }) {
      withDefaults(plugin);
      const sender = senderOf(plugin, from);
      if (!sender.owner) crowded.add(group);
      if (links && !plugin.permissions?.includes("links")) throw new Error(`${plugin.id}: link details need the "links" permission (Zelfred wouldn't read them)`);
      if (more?.photos && !plugin.permissions?.includes("photos")) throw new Error(`${plugin.id}: photos need the "photos" permission (Zelfred wouldn't pass them on)`);
      if (more?.place && !plugin.permissions?.includes("location")) throw new Error(`${plugin.id}: a position needs the "location" permission (Zelfred wouldn't pass it on)`);
      if (more?.mentions?.length && !plugin.permissions?.includes("members")) throw new Error(`${plugin.id}: who was tagged needs the "members" permission (Zelfred wouldn't pass it on)`);
      if (!text.trim() && !more?.photos?.length && !more?.place && !more?.mentions?.length) throw new Error("t.message: an empty message never reaches a plugin");
      for (const p of more?.photos ?? []) files.set(p.id, { type: p.type, size: p.size });
      here = group;
      try {
        // A vault plugin never hears a message: in Zelfred it arrives locked, as an entry.
        if (plugin.permissions?.includes("vault")) throw new Error(`${plugin.id}: a "vault" plugin gets entries, not messages. Use t.entry().`);
        if (/^(help|\?|menu|commands)$/i.test(text.trim())) return kit.send(plugin.help);
        await plugin.onMessage?.({ text, quotedRef, group, sender, ...(links ? { links: links.map((l) => ({ ...l })) } : {}), ...(more?.photos ? { photos: more.photos.map((p) => ({ ...p })) } : {}), ...(more?.place ? { place: { ...more.place } } : {}), ...(more?.mentions?.length ? { mentions: more.mentions.map((m) => senderOf(plugin, m)) } : {}) }, kit);
      } finally {
        here = null;
      }
    },
    /**
     * An entry was added to, edited in or removed from a "vault" plugin's group. As in Zelfred,
     * the plugin gets no words, only this. `at` defaults to the kit's clock.
     */
    async entry(plugin: PluginDef, event: Partial<EntryEvent> & { id: string }) {
      withDefaults(plugin);
      if (!plugin.permissions?.includes("vault")) throw new Error(`${plugin.id}: entries need the "vault" permission`);
      await plugin.onEntry?.({ change: "added", kind: "text", at: kit.now, source: "whatsapp", sender: senderOf(plugin), ...event }, kit);
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
     * Zelfred: with one person in the group (a plugin without "members", or a group where
     * nobody but the owner has written or answered) the answer settles the question and its
     * `confirm` line is posted; with more people it stays open until `kit.close(ref)`,
     * and a second, different answer from the same person arrives with `changed: true`.
     * A question asked with `keep` stays open and posts no confirm line, whoever is in the group.
     * Throws when no such question is open or the choice isn't one of its options.
     *
     * For a tick list (asked with `multiple`) give an array: everything that person has ticked
     * now. An empty array takes every tick away.
     */
    async answer(plugin: PluginDef, ref: Json | null, choice: number | number[], from?: string | Partial<Sender>) {
      withDefaults(plugin);
      const sender = senderOf(plugin, from);
      const want = JSON.stringify(ref);
      const q = [...asked].reverse().find((a) => a.open && JSON.stringify(a.ref) === want);
      if (!q) throw new Error(`${plugin.id}: no open question with ref ${want}`);
      if (q.multiple !== Array.isArray(choice)) throw new Error(`${plugin.id}: ${q.multiple ? "a tick list is answered with an array of choices" : "this question takes one choice, not an array"}`);
      if (Array.isArray(choice)) {
        const now = [...new Set(choice)].sort((a, b) => a - b);
        for (const c of now) if (!(Number.isInteger(c) && c >= 0 && c < q.options.length)) throw new Error(`${plugin.id}: choice ${c} isn't one of the ${q.options.length} options`);
        if (!sender.owner) crowded.add(q.group);
        const ticks = (ticked.get(q) ?? ticked.set(q, new Map()).get(q))!;
        const before = ticks.get(sender.id);
        if (JSON.stringify(before ?? []) === JSON.stringify(now) && (before !== undefined || !now.length)) return;
        ticks.set(sender.id, now);
        here = q.group;
        try {
          await plugin.onAnswer?.(
            {
              ref: q.ref,
              choice: now[0] ?? -1,
              option: now.length ? q.options[now[0]] : "",
              choices: now,
              added: now.filter((c) => !(before ?? []).includes(c)),
              removed: (before ?? []).filter((c) => !now.includes(c)),
              group: q.group,
              sender,
              ...(before === undefined ? {} : { changed: true }),
            },
            kit,
          );
        } finally {
          here = null;
        }
        return;
      }
      if (!(Number.isInteger(choice) && choice >= 0 && choice < q.options.length)) {
        throw new Error(`${plugin.id}: choice ${choice} isn't one of the ${q.options.length} options`);
      }
      if (!sender.owner) crowded.add(q.group);
      // Shared: the plugin hears everyone and someone besides the owner is in that group.
      const shared = !!plugin.permissions?.includes("members") && crowded.has(q.group);
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
     * Deliver an intent as Zelfred would after kit.unsure(): checks the intent and target are
     * ones the plugin declared, then calls onIntent.
     */
    async intent(plugin: PluginDef, text: string, intent: string, target: string | null = null, confidence = 1, from?: string | Partial<Sender>, group: string | null = null) {
      withDefaults(plugin);
      if (!plugin.understand || !plugin.onIntent) throw new Error(`${plugin.id} doesn't declare understand/onIntent`);
      if (!(intent in plugin.understand.intents)) throw new Error(`${plugin.id} has no intent "${intent}"`);
      if (target !== null) {
        const targets = (await plugin.understand.targets?.(kit)) ?? {};
        if (!(target in targets)) throw new Error(`${plugin.id}: "${target}" isn't one of its targets`);
      }
      here = group;
      try {
        await plugin.onIntent({ text, intent, target, confidence, sender: senderOf(plugin, from), group }, kit);
      } finally {
        here = null;
      }
    },
    /**
     * Deliver a request to a hook as Zelfred would. Throws when the hook isn't open (Zelfred
     * would have answered "not found" without calling the plugin).
     */
    async hook(plugin: PluginDef, key: string, fields: Record<string, string> = {}, files: HookFile[] = [], origin: string | null = null) {
      withDefaults(plugin);
      if (!hooks.has(key)) throw new Error(`${plugin.id}: hook "${key}" isn't open`);
      if (!plugin.onHook) throw new Error(`${plugin.id} has no onHook`);
      await plugin.onHook({ key, fields: { ...fields }, files: files.map((f) => ({ ...f })), origin }, kit);
    },
    /**
     * The person hands the plugin a WhatsApp group they already had (`"joined"`), or takes it
     * back (`"left"`), as Zelfred would. A joined group is listed in `groups` like any other.
     */
    async group(plugin: PluginDef, kind: "joined" | "left", key: string, name: string) {
      withDefaults(plugin);
      if (!plugin.onGroup) throw new Error(`${plugin.id} has no onGroup`);
      if (kind === "joined") groups.set(key, { name, hello: null });
      else groups.delete(key);
      here = kind === "joined" ? key : null;
      try {
        await plugin.onGroup({ kind, key, name }, kit);
      } finally {
        here = null;
      }
    },
    /** Someone gives one of the plugin's groups a new name or description, as Zelfred would report it. `group`: an extra group's key, null for the main one. */
    async groupInfo(plugin: PluginDef, what: "name" | "description", value: string, group: string | null = null) {
      withDefaults(plugin);
      if (!plugin.onGroupInfo) throw new Error(`${plugin.id} has no onGroupInfo`);
      here = group;
      try {
        await plugin.onGroupInfo({ what, value, group }, kit);
      } finally {
        here = null;
      }
    },
    /** One of the person's other systems calls a read endpoint, as Zelfred would after checking its key. */
    async api(plugin: PluginDef, name: string, params: Record<string, string> = {}, scope: { groups: (string | null)[] | null } = { groups: null }) {
      withDefaults(plugin);
      const endpoint = plugin.api?.get[name];
      if (!endpoint) throw new Error(`${plugin.id} has no api endpoint ${name}`);
      return clone(await endpoint.run(kit, { ...params }, scope));
    },
    /**
     * Zelfred read a link the plugin asked for: `onLink` is called with what was found and the
     * ref of that request. Throws when the plugin never asked for this address.
     */
    async link(plugin: PluginDef, found: Link) {
      withDefaults(plugin);
      const at = reads.findIndex((r) => r.url === found.url);
      if (at < 0) throw new Error(`${plugin.id}: nobody asked to read ${found.url}`);
      const [asked] = reads.splice(at, 1);
      if (!plugin.onLink) throw new Error(`${plugin.id} has no onLink`);
      await plugin.onLink({ link: { ...found }, ref: asked.ref }, kit);
    },
    /** What the shared page for `key` shows right now. Throws when that page isn't open (Zelfred would answer "not found"). */
    async shared(plugin: PluginDef, key: string): Promise<SharedPage | null> {
      withDefaults(plugin);
      if (!shares.has(key)) throw new Error(`${plugin.id}: nothing is shared under "${key}"`);
      if (!plugin.web?.shared) throw new Error(`${plugin.id} has no web.shared`);
      const page = await plugin.web.shared(kit, key);
      return page === null ? null : (clone(page as unknown as Json) as unknown as SharedPage);
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
    /** The web page loads for someone else in the plugin's groups (`web.loadFor`). */
    async loadFor(plugin: PluginDef, from: string | Partial<Sender>, args: Record<string, Json> = {}) {
      withDefaults(plugin);
      if (!plugin.web?.loadFor) throw new Error(`${plugin.id} has no web.loadFor`);
      return plugin.web.loadFor(kit, senderOf(plugin, from), args);
    },
    async act(plugin: PluginDef, action: string, args: Record<string, Json> = {}) {
      withDefaults(plugin);
      const fn = plugin.web?.actions?.[action];
      if (!fn) throw new Error(`${plugin.id} has no web action ${action}`);
      return fn(kit, args);
    },
  };
}
