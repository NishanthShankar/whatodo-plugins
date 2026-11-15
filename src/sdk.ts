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
  /** Runs once a day at this local hour; a number, or the name of a setting holding one (null in the setting: off). */
  hour: number | { setting: string };
}

export interface WebDef {
  /** Whether the person can put this plugin's page behind their whatodo PIN. */
  lockable?: boolean;
  /** Data for the plugin's web page. */
  load(kit: Kit, args: Record<string, Json>): Promise<Json>;
  /** Changes the web page can ask for. */
  actions?: Record<string, (kit: Kit, args: Record<string, Json>) => Promise<Json | void>>;
}

export interface PluginDef {
  /** Stable id, lowercase: "habits". */
  id: string;
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
  /** Sent in the group right after install. */
  welcome: string;
  /** Sent when the person writes "help" in the group. */
  help: string;
  /** Default settings for a new install. */
  settings?: Record<string, Json>;
  schedules?: ScheduleDef[];
  onInstall?(kit: Kit): Promise<void>;
  onMessage?(event: MessageEvent, kit: Kit): Promise<void>;
  onReaction?(event: ReactionEvent, kit: Kit): Promise<void>;
  onSchedule?(event: ScheduleEvent, kit: Kit): Promise<void>;
  web?: WebDef;
}

export function definePlugin(def: PluginDef): PluginDef {
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(def.id)) throw new Error(`Bad plugin id: ${def.id}`);
  return def;
}
