/**
 * A test harness for plugins: an in-memory Kit that behaves like whatodo's, plus helpers to
 * drive events and read what the plugin did. Every plugin's tests use this, so a plugin that
 * passes here behaves the same inside whatodo.
 *
 *   const t = createTestKit({ today: "2026-11-15", hour: 21 });
 *   await t.message(plugin, "add meditate");
 *   expect(t.reactions).toEqual(["👍"]);
 */
import type { Json, Kit, PluginDef, StoredItem } from "./sdk";

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
}

function shiftDay(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

const MAX_TEXT = 4000;

export function createTestKit(opts: TestKitOptions = {}) {
  const rows = new Map<string, { data: Json; sort: string | number | null }>();
  const sent: Sent[] = [];
  const reactions: string[] = [];
  /** Fallback texts from kit.unsure(), in order. In whatodo these trigger intent understanding. */
  const unsures: string[] = [];
  let counter = 0;
  const state = { today: opts.today ?? "2026-11-15", hour: opts.hour ?? 21 };
  const settings: Record<string, Json> = { ...(opts.settings ?? {}) };

  // Data must survive a JSON round trip, exactly as it does in whatodo's database.
  const clone = (v: Json): Json => JSON.parse(JSON.stringify(v));

  const kit: Kit = {
    get now() {
      return Date.parse(`${state.today}T${String(state.hour).padStart(2, "0")}:00:00Z`);
    },
    get today() {
      return state.today;
    },
    person: opts.person ?? { name: "Test Person", timezone: "Asia/Kolkata" },
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
      sent.push({ text, ref: o?.ref === undefined ? null : clone(o.ref) });
    },
    react(emoji) {
      reactions.push(emoji);
    },
    unsure(fallback) {
      if (typeof fallback !== "string" || !fallback.trim()) throw new Error("kit.unsure: give a fallback message");
      unsures.push(fallback);
    },
    id: () => `id${++counter}`,
    time: {
      day: () => state.today,
      shiftDay,
      hour: () => state.hour,
    },
  };

  const withDefaults = (plugin: PluginDef) => {
    for (const [k, v] of Object.entries(plugin.settings ?? {})) if (!(k in settings)) settings[k] = v;
  };

  return {
    kit,
    sent,
    reactions,
    unsures,
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
    async message(plugin: PluginDef, text: string, quotedRef: Json | null = null) {
      withDefaults(plugin);
      if (/^(help|\?|menu|commands)$/i.test(text.trim())) return kit.send(plugin.help);
      await plugin.onMessage?.({ text, quotedRef }, kit);
    },
    async react(plugin: PluginDef, emoji: string | null, ref: Json) {
      withDefaults(plugin);
      await plugin.onReaction?.({ emoji, ref }, kit);
    },
    /** What understand.targets() returns right now. */
    async targets(plugin: PluginDef) {
      withDefaults(plugin);
      return (await plugin.understand?.targets?.(kit)) ?? {};
    },
    /**
     * Deliver an intent as whatodo would after kit.unsure(): checks the intent and target are
     * ones the plugin declared, then calls onIntent.
     */
    async intent(plugin: PluginDef, text: string, intent: string, target: string | null = null, confidence = 1) {
      withDefaults(plugin);
      if (!plugin.understand || !plugin.onIntent) throw new Error(`${plugin.id} doesn't declare understand/onIntent`);
      if (!(intent in plugin.understand.intents)) throw new Error(`${plugin.id} has no intent "${intent}"`);
      if (target !== null) {
        const targets = (await plugin.understand.targets?.(kit)) ?? {};
        if (!(target in targets)) throw new Error(`${plugin.id}: "${target}" isn't one of its targets`);
      }
      await plugin.onIntent({ text, intent, target, confidence }, kit);
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
