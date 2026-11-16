/**
 * The whatodo plugin SDK.
 *
 * A plugin lives in its own WhatsApp group with one person and the whatodo bot. whatodo sends
 * it events (a message, a reaction, a scheduled moment, a call from its web page, a request from
 * outside to one of its hooks) and hands it
 * a Kit to act with. Plugins never talk to WhatsApp or the database directly, which keeps them
 * portable: the same plugin can run bundled inside whatodo or, later, as a hosted service.
 *
 * Handlers run inside a database transaction on the whatodo side, so they must be
 * deterministic: no network calls, no timers. Use kit.now instead of Date.now().
 */

/**
 * The SDK's own version. Plugins are written against a major version; whatodo refuses a
 * plugin whose `sdk` major differs from the one it runs.
 */
export const SDK_VERSION = "1.6.0";

/**
 * How much a plugin costs the platform to run (not its price): 1 = no or low cost,
 * 2 = medium, 3 = high. Used for pricing and limits later; names will come.
 */
export type Tier = 1 | 2 | 3;

/**
 * What a plugin may do beyond its own group and storage. A plugin lists the ones it needs in
 * `permissions`; whatodo shows them to the person before they add it and refuses the rest.
 * - "hooks": receive requests from outside whatodo (`kit.hooks`, `onHook`, files).
 * - "groups": make extra WhatsApp groups for the install (`kit.groups`).
 * - "replies": be called back when someone replies. Reserved: named so plugins and people can
 *   plan for it, not built yet.
 * Since SDK 1.6.0.
 */
export type Permission = "hooks" | "groups" | "replies";
export const PERMISSIONS: Permission[] = ["hooks", "groups", "replies"];

/** Anything JSON can hold. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export interface StoredItem<T = Json> {
  key: string;
  data: T;
  /** Optional sort value given when it was stored. */
  sort: string | number | null;
}

/** Per-install storage. Collections are just names; keys are unique within a collection. */
export interface Store {
  get<T = Json>(collection: string, key: string): Promise<T | null>;
  put(collection: string, key: string, data: Json, sort?: string | number): Promise<void>;
  delete(collection: string, key: string): Promise<void>;
  /** Items in a collection, by key prefix and/or sort range, in sort (then key) order. */
  list<T = Json>(
    collection: string,
    opts?: { prefix?: string; from?: string | number; to?: string | number; limit?: number },
  ): Promise<StoredItem<T>[]>;
}

export interface Person {
  name: string | null;
  /** IANA zone, like "Asia/Kolkata". */
  timezone: string;
}

export interface Kit {
  /** The moment of the event (ms). */
  now: number;
  /** Today in the person's zone, "YYYY-MM-DD". */
  today: string;
  person: Person;
  /** This install's settings (defaults from the plugin, changed by the person). */
  settings: Record<string, Json>;
  setSettings(patch: Record<string, Json>): Promise<void>;
  store: Store;
  /**
   * Post in the plugin's group. Attach a ref to recognise reactions and replies to this
   * message later (they come back with the same ref). With `group`, post in one of the
   * install's extra groups (`kit.groups.open`); until that group exists the message goes to
   * the main group. While handling a message or reaction from an extra group, the default is
   * that group.
   */
  send(text: string, opts?: { ref?: Json; group?: string }): void;
  /**
   * React to the message being handled. In onMessage that is the person's message; in
   * onReaction it is the plugin's own message they reacted to (so you can acknowledge their
   * reaction). Pass "" to remove the reaction. Ignored in schedules and web calls.
   */
  react(emoji: string): void;
  /**
   * Say you couldn't read the message being handled (onMessage only). If the plugin declares
   * `understand`, whatodo asks its intent model which of your intents the message means and
   * calls `onIntent` with the answer; if the plugin doesn't, or the model isn't sure, whatodo
   * sends `fallback` instead. Call it instead of sending your own "I didn't get that". Since
   * SDK 1.4.0.
   */
  unsure(fallback: string): void;
  /** A short random id for new records. */
  id(): string;
  /**
   * Hooks: web addresses of this install that the outside world can POST to (a form on a
   * website, another service). Each request arrives as `onHook`. Since SDK 1.5.0.
   */
  hooks: {
    /** The address for `key` (lowercase letters, digits and dashes), made on first use. Not on page loads. */
    url(key: string): Promise<string>;
    /** Close a hook: its address stops working. Files it already brought stay until removed. */
    remove(key: string): Promise<void>;
  };
  /**
   * Extra WhatsApp groups for this install, besides its main one: each has the person and
   * whatodo in it, like the main group. For plugins where one thing deserves its own chat
   * (a form, a project). Making a group takes a little while. Since SDK 1.6.0.
   */
  groups: {
    /** Ask for a group for `key` (lowercase letters, digits and dashes). Does nothing if it exists. `hello` is posted in it once it's made. */
    open(key: string, opts: { name: string; hello?: string }): Promise<void>;
    /** Stop using the group for `key`. whatodo stops listening and posting there; the chat itself stays on the person's phone. */
    close(key: string): Promise<void>;
  };
  /** Files that arrived through hooks. The plugin holds their ids; whatodo holds the bytes. Since SDK 1.5.0. */
  files: {
    /** Delete a file for good. */
    remove(id: string): Promise<void>;
  };
  /** Wall-clock helpers in the person's zone. */
  time: {
    /** "YYYY-MM-DD" for an instant. */
    day(ms: number): string;
    /** Add days to a "YYYY-MM-DD". */
    shiftDay(day: string, n: number): string;
    /** Local hour (0-23) of an instant. */
    hour(ms: number): number;
  };
}

export interface MessageEvent {
  text: string;
  /** The ref of the plugin message this one replies to, if any. */
  quotedRef: Json | null;
  /** The key of the extra group it was sent in; null or unset for the main group. Since SDK 1.6.0. */
  group?: string | null;
}

export interface ReactionEvent {
  /** null when the reaction was removed. */
  emoji: string | null;
  /** The ref of the plugin message reacted to. */
  ref: Json;
  /** The key of the extra group the message is in; null or unset for the main group. Since SDK 1.6.0. */
  group?: string | null;
}

/** A file that came with a hook request. Only whatodo can read its bytes; the plugin keeps the id. */
export interface HookFile {
  id: string;
  /** The form field it was sent in. */
  field: string;
  /** The file's name as uploaded. */
  name: string;
  /** MIME type as sent, like "application/pdf". */
  type: string;
  /** Bytes. */
  size: number;
}

/** A request from outside whatodo to one of the install's hooks. Since SDK 1.5.0. */
export interface HookEvent {
  /** The key the hook was made with (`kit.hooks.url(key)`). */
  key: string;
  /** The text fields, as sent. Names and values are capped by whatodo. */
  fields: Record<string, string>;
  files: HookFile[];
  /** The site the request came from (its Origin header), when it said. */
  origin: string | null;
}

/** What whatodo's intent model made of a message the plugin was unsure about. */
export interface IntentEvent {
  /** The message, as sent. */
  text: string;
  /** One of the ids in `understand.intents`. */
  intent: string;
  /** One of the ids `understand.targets` returned, or null when none fits or there were none. */
  target: string | null;
  /** 0 to 1. Below the platform's threshold onIntent isn't called at all. */
  confidence: number;
}

/**
 * Lets whatodo work out what an unclear message means. The model only picks: an intent from
 * this list, and optionally the thing it's about from `targets`. It never writes text, so the
 * plugin still reads names, days and times out of the message itself in `onIntent`.
 */
export interface UnderstandDef {
  /**
   * id -> a plain description of what the person wants: { add_habit: "Start tracking a new
   * habit" }. Ids are lowercase snake_case. 2 to 20 intents.
   */
  intents: Record<string, string>;
  /**
   * The things a message could be about, id -> label (for example your habits by id and
   * name). Read-only: called with a kit that can't write or send. At most 50.
   */
  targets?(kit: Kit): Promise<Record<string, string>>;
}

export interface ScheduleEvent {
  id: string;
}

export interface ScheduleDef {
  id: string;
  /**
   * When it runs, in the person's zone:
   * - a number: once a day at that hour
   * - { setting }: once a day at the hour held in that setting (null in the setting: off)
   * - "hourly": at the start of every hour (use kit.time.hour(kit.now) to decide what to do)
   */
  hour: number | { setting: string } | "hourly";
}

export interface WebDef {
  /** Whether the person can put this plugin's page behind their whatodo PIN. */
  lockable?: boolean;
  /** Data for the plugin's web page. */
  load(kit: Kit, args: Record<string, Json>): Promise<Json>;
  /** Changes the web page can ask for. */
  actions?: Record<string, (kit: Kit, args: Record<string, Json>) => Promise<Json | void>>;
}

/**
 * How the plugin is presented on its public page on whatodo.today (search results and the
 * page heading). Write for what people search, not the plugin's name.
 */
export interface Listing {
  /** The full page title, brand included, 60 characters at most: "Habit Tracker on WhatsApp: Daily Check-ins | whatodo". */
  title: string;
  /** Meta description, 155 characters at most. */
  description: string;
  /** The page's main heading: "Habit tracker on WhatsApp". */
  h1: string;
}

export interface PluginDef {
  /** Stable id, lowercase: "habits". Never changes once released. */
  id: string;
  /** The plugin's version, semver "MAJOR.MINOR.PATCH". Every release bumps it and adds a CHANGELOG entry. */
  version: string;
  /** The SDK major it was written for: "1". */
  sdk: string;
  name: string;
  /** One emoji shown in the marketplace. */
  icon: string;
  /** One line for the marketplace card. */
  tagline: string;
  description: string;
  /** The WhatsApp group's name when someone installs it. */
  groupName: string;
  /** Price in the smallest currency unit. Everything is free for now: 0. */
  price: number;
  /**
   * Platform cost tier. Optional in SDK 1.x for compatibility; plugins in this repo must set it.
   * A plugin that keeps state and posts a few messages a day is tier 1.
   */
  tier?: Tier;
  /** Public page text for search. Optional in SDK 1.x; the conformance suite requires it in this repo. */
  listing?: Listing;
  /** What it may do beyond its own group and storage. See `Permission`. Since SDK 1.6.0. */
  permissions?: Permission[];
  /**
   * Not offered to everyone: left out of the store and the public site, and only people whatodo
   * allows can add it. For plugins still being tried out. Since SDK 1.5.0.
   */
  unlisted?: boolean;
  /** Sent in the group right after install. */
  welcome: string;
  /** Sent when the person writes "help" in the group. */
  help: string;
  /** Default settings for a new install. */
  settings?: Record<string, Json>;
  schedules?: ScheduleDef[];
  onInstall?(kit: Kit): Promise<void>;
  /**
   * Runs once per install, before any other handler, the first time a new version of the
   * plugin handles an event for it. Migrate stored data here. Must be idempotent.
   */
  onUpgrade?(fromVersion: string, kit: Kit): Promise<void>;
  onMessage?(event: MessageEvent, kit: Kit): Promise<void>;
  onReaction?(event: ReactionEvent, kit: Kit): Promise<void>;
  onSchedule?(event: ScheduleEvent, kit: Kit): Promise<void>;
  /**
   * A request arrived at one of this install's hooks. It runs like any other handler (it can
   * store and `kit.send`); whatodo has already answered the sender. Since SDK 1.5.0.
   */
  onHook?(event: HookEvent, kit: Kit): Promise<void>;
  /** Opt in to intent understanding for messages onMessage marks with kit.unsure(). Since SDK 1.4.0. */
  understand?: UnderstandDef;
  /** Called with the intent whatodo found for an unclear message. Required with `understand`. */
  onIntent?(event: IntentEvent, kit: Kit): Promise<void>;
  web?: WebDef;
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Compare two "MAJOR.MINOR.PATCH" versions: negative, zero or positive. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

export function definePlugin(def: PluginDef): PluginDef {
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(def.id)) throw new Error(`Bad plugin id: ${def.id}`);
  if (!SEMVER.test(def.version)) throw new Error(`${def.id}: version must be MAJOR.MINOR.PATCH, got ${def.version}`);
  if (def.sdk !== SDK_VERSION.split(".")[0]) throw new Error(`${def.id}: written for SDK ${def.sdk}, this is SDK ${SDK_VERSION}`);
  if (!Number.isInteger(def.price) || def.price < 0) throw new Error(`${def.id}: price must be a whole number >= 0`);
  if (def.tier !== undefined && ![1, 2, 3].includes(def.tier)) throw new Error(`${def.id}: tier must be 1, 2 or 3`);
  for (const p of def.permissions ?? []) {
    if (!PERMISSIONS.includes(p)) throw new Error(`${def.id}: unknown permission "${p}"`);
  }
  if (def.onHook && !def.permissions?.includes("hooks")) throw new Error(`${def.id}: onHook needs the "hooks" permission`);
  if (def.understand) {
    const ids = Object.keys(def.understand.intents ?? {});
    if (ids.length < 2 || ids.length > 20) throw new Error(`${def.id}: understand.intents needs 2 to 20 intents`);
    for (const id of ids) {
      if (!/^[a-z][a-z0-9_]{0,39}$/.test(id)) throw new Error(`${def.id}: intent id "${id}" must be lowercase snake_case`);
      if (!def.understand.intents[id]?.trim()) throw new Error(`${def.id}: intent "${id}" needs a description`);
    }
    if (!def.onIntent) throw new Error(`${def.id}: understand needs onIntent`);
  }
  if (def.listing) {
    const { title, description, h1 } = def.listing;
    if (!title || title.length > 60) throw new Error(`${def.id}: listing.title must be 1-60 characters`);
    if (!description || description.length > 155) throw new Error(`${def.id}: listing.description must be 1-155 characters`);
    if (!h1 || h1.length > 80) throw new Error(`${def.id}: listing.h1 must be 1-80 characters`);
  }
  return def;
}
