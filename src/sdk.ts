/**
 * The whatodo plugin SDK.
 *
 * A plugin lives in its own WhatsApp group with one person and the whatodo bot. whatodo sends
 * it events (a message, a reaction, a scheduled moment, a call from its web page) and hands it
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
export const SDK_VERSION = "1.2.1";

/**
 * How much a plugin costs the platform to run (not its price): 1 = no or low cost,
 * 2 = medium, 3 = high. Used for pricing and limits later; names will come.
 */
export type Tier = 1 | 2 | 3;

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
   * message later (they come back with the same ref).
   */
  send(text: string, opts?: { ref?: Json }): void;
  /** React to the message being handled (message events only). */
  react(emoji: string): void;
  /** A short random id for new records. */
  id(): string;
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
}

export interface ReactionEvent {
  /** null when the reaction was removed. */
  emoji: string | null;
  /** The ref of the plugin message reacted to. */
  ref: Json;
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
  if (def.listing) {
    const { title, description, h1 } = def.listing;
    if (!title || title.length > 60) throw new Error(`${def.id}: listing.title must be 1-60 characters`);
    if (!description || description.length > 155) throw new Error(`${def.id}: listing.description must be 1-155 characters`);
    if (!h1 || h1.length > 80) throw new Error(`${def.id}: listing.h1 must be 1-80 characters`);
  }
  return def;
}
