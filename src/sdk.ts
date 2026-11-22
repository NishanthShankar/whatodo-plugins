/**
 * The Zelfred plugin SDK.
 *
 * A plugin lives in its own WhatsApp group with one person and the Zelfred bot (and, with the
 * "members" permission, the other people that person adds to the group). Zelfred sends
 * it events (a message, a reaction, a scheduled moment, a call from its web page, a request from
 * outside to one of its hooks) and hands it
 * a Kit to act with. Plugins never talk to WhatsApp or the database directly, which keeps them
 * portable: the same plugin can run bundled inside Zelfred or, later, as a hosted service.
 *
 * Handlers run inside a database transaction on the Zelfred side, so they must be
 * deterministic: no network calls, no timers. Use kit.now instead of Date.now().
 */

/**
 * The SDK's own version. Plugins are written against a major version; Zelfred refuses a
 * plugin whose `sdk` major differs from the one it runs.
 */
export const SDK_VERSION = "1.24.0";

/**
 * How much a plugin costs the platform to run (not its price): 1 = no or low cost,
 * 2 = medium, 3 = high. Used for pricing and limits later; names will come.
 */
export type Tier = 1 | 2 | 3;

/**
 * What a plugin may do beyond its own group and storage. A plugin lists the ones it needs in
 * `permissions`; Zelfred shows them to the person before they add it and refuses the rest.
 * - "hooks": receive requests from outside Zelfred (`kit.hooks`, `onHook`, files).
 * - "groups": make extra WhatsApp groups for the install (`kit.groups`).
 * - "replies": be called back when someone replies. Reserved: named so plugins and people can
 *   plan for it, not built yet.
 * - "lock-members": block adding members. The plugin's groups (its main one and any extra ones)
 *   are made with Zelfred as the only admin and set so only admins can add people, so nobody
 *   else can be brought in. Reserved since SDK 1.7.0: named, not enforced yet.
 * - "members": hear everyone in its groups, not only the person who added it. Without it,
 *   messages and reactions from other people in the group never reach the plugin. Each event
 *   says who sent it (`event.sender`). Can't be combined with "lock-members". Since SDK 1.8.0.
 * - "links": have Zelfred read the public details of the links people send (title, caption,
 *   who posted it, picture address). A plugin can't reach the internet itself; with this,
 *   Zelfred opens each link and hands over what it found in `event.links`. Since SDK 1.10.0.
 * - "api": let the person's own other systems read this install's data and be told when
 *   something happens (`api` on the plugin, `kit.emit`). Nothing is open until the person
 *   makes a key on the plugin's page; Zelfred checks the key, limits how often it is used
 *   and signs every callback. Since SDK 1.19.0.
 * - "vault": nobody but the person can read what is written in the plugin's group, the plugin
 *   and Zelfred included. Every message there is locked the moment it arrives, with a key only
 *   the person's browser holds, and kept as a locked entry. The plugin is told that an entry
 *   arrived, was edited or was removed (`onEntry`), with its id, what kind it is and when, and
 *   never what it says. There are no typed commands in such a group: a message is always an
 *   entry. So a vault plugin has no `onMessage`, no `understand` and no "links" or "members"
 *   permission, and it can't take groups the person already had (`onGroup`). Reactions,
 *   answers to `kit.ask` and schedules work as everywhere. Its `welcome` is pinned in the
 *   group, since "help" can't be asked for. The person reads the entries on the plugin's page
 *   after unlocking with their passphrase; that page is built by Zelfred, and the plugin's
 *   `web.load` only ever returns what the plugin itself knows (counts and dates).
 *   Since SDK 1.21.0.
 * - "share": make pages anyone with the link can open, signed in or not (`kit.share`,
 *   `web.shared`). The plugin says what a page shows; Zelfred makes the address, draws the
 *   page, limits how often it is opened and can take it down. The page never says whose it
 *   is: no name, no number. Can't be combined with "vault". Since SDK 1.24.0.
 * Since SDK 1.6.0.
 */
export type Permission = "hooks" | "groups" | "replies" | "lock-members" | "members" | "links" | "api" | "vault" | "share";
export const PERMISSIONS: Permission[] = ["hooks", "groups", "replies", "lock-members", "members", "links", "api", "vault", "share"];

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
  /**
   * The id their own events carry as `sender.id`. With it a plugin that hears several people
   * can find the owner's own records outside an event too (a page load, a schedule). Not a
   * phone number. Zelfred always sets it since SDK 1.15.0.
   */
  id?: string;
  name: string | null;
  /** IANA zone, like "Asia/Kolkata". */
  timezone: string;
}

/**
 * Who sent a message or reaction. Without the "members" permission it is always the person who
 * added the plugin. Since SDK 1.8.0.
 */
export interface Sender {
  /**
   * The same for this person on every event, and different for everyone else. Use it as a key
   * when you store who did what. It is not a phone number and says nothing about the person.
   */
  id: string;
  /** Their WhatsApp name, when Zelfred knows it. Names change and repeat: show it, don't key on it. */
  name: string | null;
  /** True for the person who added the plugin. */
  owner: boolean;
  /**
   * Whether they have a Zelfred profile of their own. Always true for the owner. Someone a
   * friend brought into a group usually has none: they can be offered one, and
   * `kit.signUp(sender.id)` records their yes. Since SDK 1.13.0.
   */
  profile?: boolean;
}

export interface Kit {
  /** The moment of the event (ms). */
  now: number;
  /** Today in the person's zone, "YYYY-MM-DD". */
  today: string;
  /** The person who added the plugin, whoever sent the event being handled (that is `event.sender`). */
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
   * Ask for a choice between options. Use it whenever the plugin needs a structured answer,
   * a plain yes or no included. Zelfred sends a WhatsApp poll (the question with a numbered
   * list when a poll can't be sent) and each answer arrives as `onAnswer` with the `ref` given
   * here. A typed answer (the option's number or its text) counts too.
   *
   * - In a group of one person and Zelfred, the first answer settles it: the poll is deleted
   *   so it can't be changed, and `confirm` is posted as the record.
   * - In a group with more people (the "members" permission) the poll stays, everyone's first
   *   answer counts, and the question stays open until the plugin calls `kit.close(ref)`.
   *
   * 2 to 100 different options of up to 100 characters; the question up to 255. More than 12
   * options go out as several polls, at most three at a time with "See more" as the last
   * option. Asking again with the same `ref` replaces the earlier question.
   *
   * `confirm`: the line posted once a one-person question is answered. `{{question}}` and
   * `{{option}}` are filled in. Default "{{question}}: {{option}}"; false for none (then say
   * something in `onAnswer`, since the poll is gone). `group` works as in `send`.
   *
   * `keep: true` is for an answer the person may want to correct, like a daily check-in. The
   * poll is not deleted when it is answered and no confirm line is posted: the poll itself
   * shows the answer. They can change it as often as they like while the question is open,
   * and each change arrives as `onAnswer` with `changed: true`. It closes when you call
   * `kit.close(ref)` or ask again with the same ref; the poll stays in the chat, and a later
   * change on it is refused. Since SDK 1.11.0.
   *
   * `intro`: a message posted just before the poll, for what a poll's question can't carry:
   * more than 255 characters, *bold*, or a mention. With `mention` (a `sender.id`), write
   * `{{mention}}` in the intro where that person should be tagged; they are notified. A
   * mention needs the "members" permission. Where no poll can go, the intro and the question
   * go out as one message. Since SDK 1.16.0.
   *
   * `multiple: true` makes it a tick list: one poll where each person ticks every option that
   * applies, like a day's habits. It takes 2 to 12 options. It always works like `keep` (the
   * poll stays, no confirm line, every change counts while it is open), and `onAnswer` gets
   * the whole of what the person has ticked now in `choices`, with what this change `added`
   * and `removed`. Taking every tick away arrives too, with `choices` empty. Since SDK 1.23.0.
   * Since SDK 1.9.0.
   */
  ask(question: string, options: string[], opts?: { ref?: Json; group?: string; confirm?: string | false; keep?: boolean; multiple?: boolean; intro?: string; mention?: string }): void;
  /**
   * The question asked with `ref` is settled: its polls are deleted (left in place for a
   * question asked with `keep`) and no more answers are taken. Call it when a message that wasn't one of the options answered the question ("3
   * days" to "When shall I remind you?"), or when a group's vote is decided. Does nothing if
   * no such question is open. Since SDK 1.9.0.
   */
  close(ref: Json): void;
  /**
   * React to the message being handled. In onMessage that is the person's message; in
   * onReaction it is the plugin's own message they reacted to (so you can acknowledge their
   * reaction); in onAnswer it is the question, or the number they sent. Pass "" to remove the
   * reaction. Ignored in schedules and web calls.
   */
  react(emoji: string): void;
  /**
   * Remember the person's message being handled (onMessage only), the way `ref` on `kit.send`
   * remembers one of yours: a reaction to it arrives in `onReaction` with this ref, and a
   * reply to it carries it as `quotedRef`. For messages that are the record itself (a link
   * they saved, a photo of a receipt). Since SDK 1.10.0.
   */
  mark(ref: Json): void;
  /**
   * Say you couldn't read the message being handled (onMessage only). If the plugin declares
   * `understand`, Zelfred asks its intent model which of your intents the message means and
   * calls `onIntent` with the answer; if the plugin doesn't, or the model isn't sure, Zelfred
   * sends `fallback` instead. Call it instead of sending your own "I didn't get that". Since
   * SDK 1.4.0.
   */
  unsure(fallback: string): void;
  /**
   * This person said yes to having their own Zelfred profile (ask first, with `kit.ask`;
   * never call it without their yes). Zelfred records that they agreed, when and in which
   * plugin, and from then on their events arrive with `sender.profile: true`. Give the
   * `sender.id` of someone who has written or answered in one of the plugin's groups. Needs
   * the "members" permission. Since SDK 1.13.0.
   */
  signUp(senderId: string): Promise<void>;
  /**
   * Tell the person's other systems that something happened: Zelfred sends `data` to the
   * address they set up for callbacks, if they did and asked for this event. `event` must be
   * one of the plugin's `api.events`. Send only what `api.get` would also show. Needs the
   * "api" permission. Not on page loads. Since SDK 1.19.0.
   *
   * `opts.group`: which of the install's groups it happened in (a key from `kit.groups.open`
   * or `onGroup`; null for the main group), or several when it touches more than one, like a
   * move. The person can limit a callback address to some groups; an event with no group only
   * goes to addresses that take everything. Since SDK 1.20.0.
   */
  emit(event: string, data: Json, opts?: { group?: string | null | (string | null)[] }): Promise<void>;
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
   * Zelfred in it, like the main group. For plugins where one thing deserves its own chat
   * (a form, a project). Making a group takes a little while. Since SDK 1.6.0.
   */
  groups: {
    /** Ask for a group for `key` (lowercase letters, digits and dashes). Does nothing if it exists. `hello` is posted in it once it's made. */
    open(key: string, opts: { name: string; hello?: string }): Promise<void>;
    /** Stop using the group for `key`. Zelfred stops listening and posting there; the chat itself stays on the person's phone. */
    close(key: string): Promise<void>;
    /**
     * Give the group for `key` a new name (1-25 characters). A group that is still being made
     * is made with the new name. Does nothing when there is no open group for `key`, or when it
     * is a group the person already had and handed over (that one is theirs to name).
     * Since SDK 1.22.0.
     */
    rename(key: string, name: string): Promise<void>;
  };
  /**
   * Shared pages: addresses of this install that anyone can open in a browser without signing
   * in. What a page shows comes from `web.shared(kit, key)`, read again on every visit, so the
   * page is always current. Needs the "share" permission. Since SDK 1.24.0.
   */
  share: {
    /** The address for `key` (lowercase letters, digits and dashes), made on first use. Not on page loads. */
    url(key: string): Promise<string>;
    /** The address for `key` if one was made, else null. Works on page loads too. */
    find(key: string): Promise<string | null>;
    /** Stop sharing: the address stops working for good. `url(key)` afterwards makes a new one, so old copies of the link stay dead. */
    remove(key: string): Promise<void>;
  };
  /**
   * Links the plugin wants read that didn't arrive in a WhatsApp message (one typed on its
   * page). A handler can't wait for a page to be read, so this asks Zelfred to read it and
   * call `onLink` with what it found and the `ref` given here, a moment later. Needs the
   * "links" permission. Not on page loads. Since SDK 1.24.0.
   */
  links: {
    read(url: string, ref: Json): Promise<void>;
  };
  /** Files that arrived through hooks. The plugin holds their ids; Zelfred holds the bytes. Since SDK 1.5.0. */
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

/**
 * What Zelfred read from a link's public page, for plugins with the "links" permission.
 * Anything it couldn't read is null; a private, deleted or unreachable link has `found: false`
 * and only `url`, `canonical`, `site` and `kind`. Since SDK 1.10.0.
 */
export interface Link {
  /** The link as it was sent. */
  url: string;
  /**
   * The same link without tracking parts, and the same however it was shared (youtu.be, a
   * shorts link and a watch link of one video are one `canonical`). Use it to spot a repeat.
   */
  canonical: string;
  /** Where it is: "YouTube", "Instagram", or the site's own name ("example.com" when it gives none). */
  site: string;
  /** "video", "short" (YouTube), "reel", "post" (Instagram) or "page" (anything else). */
  kind: "video" | "short" | "reel" | "post" | "page";
  /** False when Zelfred couldn't read the page. */
  found: boolean;
  title: string | null;
  /** The description or caption, up to 5000 characters. */
  description: string | null;
  /** The channel or account that posted it. */
  author: string | null;
  /** The address of its picture. Some sites' addresses stop working after a while. */
  image: string | null;
  /** Length in seconds, when the site says. */
  seconds: number | null;
  /**
   * What the page says the thing costs, in the currency's ordinary unit (24990 or 19.99). Only
   * looked for when the plugin asks for it (`links: { price: true }`), and null when the page
   * names no price. A shop can show a different price to a different visitor: treat it as a
   * first guess the person can correct. Since SDK 1.24.0.
   */
  price?: number | null;
  /** The price's currency as a three letter code ("INR"), when the page says. Since SDK 1.24.0. */
  currency?: string | null;
}

/** Zelfred read a link the plugin asked for with `kit.links.read`. Since SDK 1.24.0. */
export interface LinkEvent {
  link: Link;
  /** The ref given to `kit.links.read`. */
  ref: Json;
}

/**
 * What a shared page shows (`web.shared`). The plugin gives words, addresses and numbers;
 * Zelfred draws the page, so every shared page looks and behaves the same and no plugin can
 * put code on it. Leave out anything that says who the person is. Zelfred cuts what is too
 * long: 80 characters for a title, 300 for a line, 500 items in all. Since SDK 1.24.0.
 */
export interface SharedPage {
  /** The page's heading, and its title when the link is pasted into a chat. */
  title: string;
  /** One or two lines under the heading. */
  intro?: string | null;
  /** The address of a picture for the chat preview. */
  image?: string | null;
  sections: SharedSection[];
  /** Closing lines, like totals: a label and its value. */
  summary?: { label: string; value: string }[];
}

export interface SharedSection {
  /** Leave out for a page with one section. */
  heading?: string | null;
  items: SharedItem[];
}

export interface SharedItem {
  title: string;
  /** Where the item leads. Zelfred refuses addresses that aren't ordinary web links. */
  url?: string | null;
  /** The address of its picture. */
  image?: string | null;
  /** One muted line under the title: where it is from, its labels. */
  detail?: string | null;
  /** Shown at the right: a price, an amount. Already formatted. */
  value?: string | null;
  /** The person's own words about it. Only pass them when the person chose to show them. */
  note?: string | null;
  /** Settled: shown struck through with `doneLabel` (a wish already bought). */
  done?: boolean;
  /** What a done item is marked with: "Bought". */
  doneLabel?: string | null;
}

export interface MessageEvent {
  text: string;
  /** The ref of the message this one replies to (one of the plugin's, or one marked with `kit.mark`), if any. */
  quotedRef: Json | null;
  /**
   * The links in the message with what Zelfred read from each, in the order they appear (at
   * most 3). Only with the "links" permission, and only when the message has a link. Reading
   * takes a second or two, so the message reaches the plugin that much later.
   * Since SDK 1.10.0.
   */
  links?: Link[];
  /** The key of the extra group it was sent in; null or unset for the main group. Since SDK 1.6.0. */
  group?: string | null;
  /** Who sent it. Zelfred always sets it since SDK 1.8.0. */
  sender?: Sender;
}

export interface ReactionEvent {
  /** null when the reaction was removed. */
  emoji: string | null;
  /** The ref of the message reacted to: one the plugin sent with a ref, or one of the person's it marked with `kit.mark`. */
  ref: Json;
  /** The key of the extra group the message is in; null or unset for the main group. Since SDK 1.6.0. */
  group?: string | null;
  /** Who reacted. Zelfred always sets it since SDK 1.8.0. */
  sender?: Sender;
}

/**
 * Someone answered a question asked with `kit.ask`. A person's first answer is the one that
 * counts. In a group with several people a person may change it once, ever (Zelfred tells
 * them so); that arrives as a second event with `changed: true` and replaces their first.
 * A question asked with `keep` takes every change while it is open, each with `changed: true`.
 * Since SDK 1.9.0.
 */
export interface AnswerEvent {
  /** The ref given to `kit.ask`; null when there was none. */
  ref: Json | null;
  /** Which option they chose, counting from 0 in the order given to `kit.ask`. On a tick list: the first one ticked, or -1 when nothing is. */
  choice: number;
  /** The text of that option; "" when nothing is ticked on a tick list. */
  option: string;
  /** Only on a question asked with `multiple`: every option this person has ticked now, in the options' order. Since SDK 1.23.0. */
  choices?: number[];
  /** Only with `multiple`: what this change ticked. */
  added?: number[];
  /** Only with `multiple`: what this change took the tick off. */
  removed?: number[];
  /** True when this replaces an earlier answer from the same person. */
  changed?: boolean;
  /** The key of the extra group the question is in; null or unset for the main group. */
  group?: string | null;
  /** Who answered. Without the "members" permission only the person who added the plugin is heard. */
  sender?: Sender;
}

/**
 * Something happened to a locked entry in a plugin with the "vault" permission. This is all a
 * vault plugin ever learns about an entry: the plugin never sees its words, its file, or the
 * locked bytes. Enough to count days, keep a streak, or say something after the first one.
 * Since SDK 1.21.0.
 */
export interface EntryEvent {
  /**
   * "added": a new entry was stored (in WhatsApp: after Zelfred's 👍). "edited": its words were
   * replaced. "removed": it is gone for good (❌ on the message, or deleted on the page).
   */
  change: "added" | "edited" | "removed";
  /** The entry's id. The same on every event about this entry. Says nothing about its content. */
  id: string;
  /** What kind of thing it is. */
  kind: "text" | "image" | "voice" | "audio" | "video" | "file" | "sticker" | "location" | "contact" | "other";
  /** The moment the entry belongs to (ms): when it was sent, or the date given to it on the page. */
  at: number;
  /** Where it was written: in the WhatsApp group, or on the plugin's page. `kit.send` only makes sense to answer the first. */
  source: "whatsapp" | "web";
  /** Who wrote it. Always the person who added the plugin unless someone else got into the group. */
  sender?: Sender;
}

/** A file that came with a hook request. Only Zelfred can read its bytes; the plugin keeps the id. */
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

/** A request from outside Zelfred to one of the install's hooks. Since SDK 1.5.0. */
/**
 * A WhatsApp group the person already had was handed to the plugin, or taken back. From then
 * on it works like a group made with `kit.groups.open`: messages there arrive with
 * `group: key`, and `kit.send(text, { group: key })` posts there. The differences: Zelfred
 * didn't make it, other people may already be in it, and `kit.groups.close(key)` only stops
 * listening there (nobody is taken out and nothing is said). Since SDK 1.17.0.
 */
export interface GroupEvent {
  /**
   * "joined": the person chose this plugin for the group. `kit.send` in the handler posts in
   * that group. "left": they chose something else for it; Zelfred has already stopped
   * listening there, so only tidy up your own records.
   */
  kind: "joined" | "left";
  /** Zelfred's key for the group. Never the same as a key the plugin picked itself: it starts with "x-". */
  key: string;
  /** The WhatsApp group's name. */
  name: string;
}

export interface HookEvent {
  /** The key the hook was made with (`kit.hooks.url(key)`). */
  key: string;
  /** The text fields, as sent. Names and values are capped by Zelfred. */
  fields: Record<string, string>;
  files: HookFile[];
  /** The site the request came from (its Origin header), when it said. */
  origin: string | null;
}

/** What Zelfred's intent model made of a message the plugin was unsure about. */
export interface IntentEvent {
  /** The message, as sent. */
  text: string;
  /** One of the ids in `understand.intents`. */
  intent: string;
  /** One of the ids `understand.targets` returned, or null when none fits or there were none. */
  target: string | null;
  /** 0 to 1. Below the platform's threshold onIntent isn't called at all. */
  confidence: number;
  /** Who sent the message. Zelfred always sets it since SDK 1.8.0. */
  sender?: Sender;
  /**
   * The key of the extra group the message was sent in; null or unset for the main group.
   * While handling it, `kit.send` answers in that group. Since SDK 1.12.0.
   */
  group?: string | null;
}

/**
 * Lets Zelfred work out what an unclear message means. The model only picks: an intent from
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

/**
 * What a plugin opens to the person's own other systems (their scripts, their backend), once
 * they make a key on the plugin's page. Since SDK 1.19.0.
 *
 * Zelfred does the plumbing: it checks the key, counts the calls, and turns `GET
 * /api/v1/<plugin id>/<name>?a=b` into `get[name](kit, { a: "b" })`. The kit is read-only, as
 * on a page load. Whatever the handler returns is sent back as JSON, so return only what the
 * person themselves may see, keep it small, and take `limit` and `after` for long lists.
 */
export interface ApiDef {
  /** Read endpoints by name (lowercase letters, digits and dashes). Query values arrive as strings. */
  get: Record<string, ApiEndpoint>;
  /**
   * The events the plugin emits with `kit.emit`, by name ("link.added"), each with one line
   * saying when it happens. The person picks which ones their address is called for.
   */
  events?: Record<string, string>;
}

export interface ApiEndpoint {
  /** One line for the person's page: what it returns. */
  about: string;
  /** The query parameters it reads, each with one line. */
  params?: Record<string, string>;
  /**
   * `scope` says what the key that called may see. The person can limit a key to some of the
   * install's groups; then `scope.groups` lists them (null in the list is the main group) and
   * the handler must return nothing from any other group. `scope.groups` null: everything.
   * Since SDK 1.20.0; before that every key saw everything.
   */
  run(kit: Kit, params: Record<string, string>, scope: ApiScope): Promise<Json>;
}

/** What a key may see. Since SDK 1.20.0. */
export interface ApiScope {
  /** The groups it is limited to, by key (null: the main group). null: no limit. */
  groups: (string | null)[] | null;
}

export interface WebDef {
  /** Whether the person can put this plugin's page behind their Zelfred PIN. */
  lockable?: boolean;
  /** Data for the plugin's web page. */
  load(kit: Kit, args: Record<string, Json>): Promise<Json>;
  /**
   * Data for the page of someone else in the plugin's groups: a friend who takes part in what
   * the owner set up and has logged in to Zelfred themselves. `sender` is that person. Return
   * only what they may see (their own numbers, and what the group already shows everyone).
   * Read-only, like `load`. Without it such a person sees nothing of this plugin. Needs the
   * "members" permission. Since SDK 1.14.0.
   */
  loadFor?(kit: Kit, sender: Sender, args: Record<string, Json>): Promise<Json>;
  /** Changes the web page can ask for. */
  actions?: Record<string, (kit: Kit, args: Record<string, Json>) => Promise<Json | void>>;
  /**
   * What the shared page for `key` shows to anyone holding its address (`kit.share.url(key)`).
   * Read-only, like `load`, and called on every visit. Return null when there is nothing to
   * show any more (the list was deleted): the visitor is told the page is gone. Needs the
   * "share" permission. Since SDK 1.24.0.
   */
  shared?(kit: Kit, key: string): Promise<SharedPage | null>;
}

/**
 * How the plugin is presented on its public page on whatodo.today (search results and the
 * page heading). Write for what people search, not the plugin's name.
 */
export interface Listing {
  /** The full page title, brand included, 60 characters at most: "Habit Tracker on WhatsApp: Daily Check-ins | Zelfred". */
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
   * What more Zelfred should look for on the links it reads for this plugin. `price`: what the
   * thing costs (`link.price`, `link.currency`), for plugins about things to buy; some pages
   * are then read a second time, the way a shopper's browser would. Needs the "links"
   * permission. Since SDK 1.24.0.
   */
  links?: { price?: boolean };
  /**
   * Not offered to everyone: left out of the store and the public site, and only people Zelfred
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
  /** Someone answered a question asked with `kit.ask`. Since SDK 1.9.0. */
  onAnswer?(event: AnswerEvent, kit: Kit): Promise<void>;
  /**
   * A request arrived at one of this install's hooks. It runs like any other handler (it can
   * store and `kit.send`); Zelfred has already answered the sender. Since SDK 1.5.0.
   */
  onHook?(event: HookEvent, kit: Kit): Promise<void>;
  /** Read endpoints and events for the person's other systems. Needs the "api" permission. Since SDK 1.19.0. */
  api?: ApiDef;
  /**
   * Having this means the person can hand the plugin a WhatsApp group they already had (one
   * Zelfred didn't make): on the web, or when they add Zelfred to a group. Needs the
   * "groups" permission. Since SDK 1.17.0.
   */
  onGroup?(event: GroupEvent, kit: Kit): Promise<void>;
  /**
   * An entry was added, edited or removed in this plugin's vault. Needs the "vault" permission,
   * and is the only word a vault plugin gets about what people write. Since SDK 1.21.0.
   */
  onEntry?(event: EntryEvent, kit: Kit): Promise<void>;
  /** A link asked for with `kit.links.read` was read. Needs the "links" permission. Since SDK 1.24.0. */
  onLink?(event: LinkEvent, kit: Kit): Promise<void>;
  /** Opt in to intent understanding for messages onMessage marks with kit.unsure(). Since SDK 1.4.0. */
  understand?: UnderstandDef;
  /** Called with the intent Zelfred found for an unclear message. Required with `understand`. */
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

/** The limits of a question (`kit.ask`), shared by Zelfred and the test kit. Throws a plain sentence when one is broken. */
export function checkAsk(question: string, options: string[], opts?: { intro?: string; mention?: string; multiple?: boolean }): void {
  if (opts?.intro !== undefined) {
    if (typeof opts.intro !== "string" || !opts.intro.trim()) throw new Error("kit.ask: the intro is empty");
    if (opts.intro.length > 1000) throw new Error("kit.ask: the intro is longer than 1000 characters");
  }
  if (opts?.mention !== undefined) {
    if (typeof opts.mention !== "string" || !opts.mention) throw new Error("kit.ask: mention takes a sender id");
    if (!opts.intro?.includes("{{mention}}")) throw new Error("kit.ask: write {{mention}} in the intro where the person should be tagged");
  } else if (opts?.intro?.includes("{{mention}}")) throw new Error("kit.ask: the intro has {{mention}} but no mention was given");
  if (typeof question !== "string" || !question.trim()) throw new Error("kit.ask: give a question");
  if (question.length > 255) throw new Error("kit.ask: the question is longer than 255 characters");
  if (!Array.isArray(options) || options.length < 2 || options.length > 100) throw new Error("kit.ask: give 2 to 100 options");
  if (opts?.multiple === true && options.length > 12) throw new Error("kit.ask: a tick list (multiple) takes at most 12 options");
  for (const o of options) {
    if (typeof o !== "string" || !o.trim()) throw new Error("kit.ask: an option is empty");
    if (o.length > 100) throw new Error("kit.ask: an option is longer than 100 characters");
  }
  if (new Set(options.map((o) => o.trim().toLowerCase())).size !== options.length) throw new Error("kit.ask: two options are the same");
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
  if (def.permissions?.includes("members") && def.permissions.includes("lock-members")) {
    throw new Error(`${def.id}: "members" and "lock-members" can't be used together`);
  }
  if (def.web?.loadFor && !def.permissions?.includes("members")) throw new Error(`${def.id}: web.loadFor needs the "members" permission`);
  if (def.onEntry && !def.permissions?.includes("vault")) throw new Error(`${def.id}: onEntry needs the "vault" permission`);
  if (def.permissions?.includes("vault")) {
    // Nothing written in a vault plugin's group may reach the plugin or anything that reads.
    if (def.onMessage) throw new Error(`${def.id}: a "vault" plugin can't have onMessage (it never sees what people write; use onEntry)`);
    if (def.understand || def.onIntent) throw new Error(`${def.id}: a "vault" plugin can't have understand (nothing written there is read)`);
    if (def.onGroup) throw new Error(`${def.id}: a "vault" plugin can't take groups the person already had (onGroup)`);
    for (const p of ["links", "members"] as const) {
      if (def.permissions.includes(p)) throw new Error(`${def.id}: "vault" and "${p}" can't be used together`);
    }
  }
  if (def.permissions?.includes("share") && def.permissions.includes("vault")) throw new Error(`${def.id}: "share" and "vault" can't be used together`);
  if (def.web?.shared && !def.permissions?.includes("share")) throw new Error(`${def.id}: web.shared needs the "share" permission`);
  if (def.permissions?.includes("share") && !def.web?.shared) throw new Error(`${def.id}: the "share" permission needs web.shared (what a shared page shows)`);
  if ((def.onLink || def.links) && !def.permissions?.includes("links")) throw new Error(`${def.id}: onLink and links need the "links" permission`);
  if (def.onGroup && !def.permissions?.includes("groups")) throw new Error(`${def.id}: onGroup needs the "groups" permission`);
  if (def.api) {
    if (!def.permissions?.includes("api")) throw new Error(`${def.id}: api needs the "api" permission`);
    const names = Object.keys(def.api.get ?? {});
    if (!names.length) throw new Error(`${def.id}: api.get needs at least one endpoint`);
    for (const n of names) {
      if (!/^[a-z][a-z0-9-]{0,39}$/.test(n)) throw new Error(`${def.id}: api endpoint "${n}" must be lowercase letters, digits and dashes`);
      if (!def.api.get[n].about?.trim()) throw new Error(`${def.id}: api endpoint "${n}" needs an about line`);
    }
    for (const [e, about] of Object.entries(def.api.events ?? {})) {
      if (!/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){0,3}$/.test(e)) throw new Error(`${def.id}: api event "${e}" must look like "link.added"`);
      if (!about?.trim()) throw new Error(`${def.id}: api event "${e}" needs a line saying when it happens`);
    }
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

// Wordings for a plugin's messages (see src/copy.ts). Since SDK 1.18.0.
export { fixed, msg, useRandom, type Message, type Wording } from "./copy";
