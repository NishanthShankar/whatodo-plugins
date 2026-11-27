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
export const SDK_VERSION = "1.39.0";

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
 * - "photos": get the photos people send in its groups. A plugin never holds a picture: Zelfred
 *   keeps the file and hands over its id, type and size in `event.photos`. A photo sent with no
 *   words arrives too, with an empty `event.text`. The plugin can send one of its photos back
 *   (`kit.send(text, { photo: id })`) and its page can add one. Videos, voice notes and other
 *   files are not passed on. Can't be combined with "vault". Since SDK 1.25.0.
 * - "location": get the position a person shares in its groups (WhatsApp's "Location"), as
 *   `event.place`. Can't be combined with "vault". Since SDK 1.25.0.
 * - "parcels": have Zelfred ask a carrier (FedEx, UPS) where a parcel is. The plugin hands over
 *   a tracking link or number (`kit.parcels.read`) and gets the latest status back in
 *   `onParcel`. Zelfred does the asking, with its own account at the carrier, and says so
 *   plainly when it has no way to track something. Since SDK 1.31.0.
 * - "sort": have Zelfred put a few words (what an expense was, say) in one of the plugin's own
 *   groups, a while later (`kit.sort`, answered in `onSorted`). Zelfred takes out numbers before
 *   the words go to the sorting model, which is run outside Zelfred. Since SDK 1.32.0.
 * - "mail": be told of mail that comes to the person's Zelfred mail address (name@zelfred.com)
 *   from a sender they accepted (`onMail`). Zelfred keeps the mail's PDFs and hands over their ids,
 *   type and size, as with photos; the plugin never holds a file. Every plugin with "mail" is told
 *   of every such mail and must answer: "took" (the files stay with it until it removes them),
 *   "not-for-me", or "could-not-read". Misses are counted per plugin and sender's domain, never
 *   per person. The mail's text and subject are not passed on. Can't be combined with "vault";
 *   health apps never get it. Since SDK 1.33.0.
 * Since SDK 1.6.0.
 */
export type Permission = "hooks" | "groups" | "replies" | "lock-members" | "members" | "links" | "api" | "vault" | "share" | "photos" | "location" | "parcels" | "sort" | "mail";
export const PERMISSIONS: Permission[] = ["hooks", "groups", "replies", "lock-members", "members", "links", "api", "vault", "share", "photos", "location", "parcels", "sort", "mail"];

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
  /**
   * The currency this person counts in, as a three letter code ("INR"), or null while Zelfred
   * doesn't know it. A plugin that finds out tells Zelfred with `kit.learn`, so no other
   * plugin has to ask. Since SDK 1.27.0.
   */
  currency?: string | null;
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
   * that group. With `photo` (the id of one of this install's photos; needs the "photos"
   * permission), the picture is sent and `text` is its caption, up to 1000 characters; an
   * empty text sends the picture alone. Since SDK 1.25.0.
   */
  send(text: string, opts?: { ref?: Json; group?: string; photo?: string }): void;
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
   * React to the person's own messages you marked with this ref (`kit.mark`), from anywhere:
   * a call from the page, a schedule, another message. For showing in WhatsApp something that
   * changed elsewhere, like a ✅ on a thing ticked on the page. The ref must equal the one
   * given to `kit.mark`. Zelfred holds one reaction a message, so this replaces the one put
   * there before; pass "" to take it off. Nothing happens when no message carries the ref.
   * Since SDK 1.26.0.
   */
  reactTo(ref: Json, emoji: string): void;
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
  /**
   * Tell Zelfred something about the person who added the plugin that it didn't know yet, so
   * they are asked once and not by every plugin. Today that is `currency`: a three letter
   * code ("INR"). Zelfred keeps it only while it knows nothing: what the person said first
   * stands, and a later call changes nothing. Only pass what that person said themselves, in
   * a message or an answer of their own, never a guess and never what someone else in the
   * group said. `kit.person.currency` reads it back. Not on page loads. Since SDK 1.27.0.
   */
  learn(what: { currency?: string }): Promise<void>;
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
  /**
   * Where a parcel is. Give a tracking link or a bare tracking number, as the person sent it:
   * Zelfred works out the carrier, asks it, and calls `onParcel` with the latest status and
   * the `ref` given here, a moment later. Every call gets an answer, also when the parcel
   * can't be tracked (`parcel.found` is false and `parcel.reason` says why). At most 30 calls
   * while handling one event. Needs the "parcels" permission. Not on page loads.
   * Since SDK 1.31.0.
   */
  parcels: {
    read(what: string, ref: Json): Promise<void>;
  };
  /**
   * Put a few words in one of the plugin's own groups: `choices` is id -> what belongs there
   * ({ "🍔": "food: lunch, chai, dinner" }), 1 to 20 of them. After `opts.after` seconds (0 to
   * 600, default 0) Zelfred takes the numbers out of `text`, asks its sorting model which choice
   * fits, and calls `onSorted` with the answer and `ref`. Every call is answered: `choice` is
   * null when none fits well enough, the model is off or it failed. The wait lets people do it
   * themselves first; check that nobody did before acting on the answer. `text` up to 200
   * characters. At most 30 calls while handling one event. Needs the "sort" permission. Not on
   * page loads. Since SDK 1.32.0.
   */
  sort(text: string, choices: Record<string, string>, ref: Json, opts?: { after?: number }): Promise<void>;
  /**
   * Files that arrived through hooks, and photos (the "photos" permission). The plugin holds
   * their ids; Zelfred holds the bytes. Since SDK 1.5.0.
   */
  files: {
    /** Delete a file for good. */
    remove(id: string): Promise<void>;
    /**
     * One of this install's files, or null when the id isn't one. Check an id that came from
     * the page before storing it. Since SDK 1.25.0.
     */
    get(id: string): Promise<{ id: string; type: string; size: number } | null>;
    /**
     * Read one of this install's PDFs again with Zelfred's bill reader (as a mailed bill is read before `onMail`):
     * a moment later `onFileRead` gets what the bill says and the `ref` given here. Every call is answered, with
     * `read.state` "failed" when it could not be read. For a page button such as "Read again". At most 20 a day for a
     * person. Needs the "mail" permission. Since SDK 1.36.0.
     */
    read(id: string, ref: Json): Promise<void>;
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
 * What a carrier says about a parcel right now, for plugins with the "parcels" permission.
 * Since SDK 1.31.0.
 */
export interface Parcel {
  /** The carrier's id ("fedex", "ups"), or null when Zelfred couldn't tell whose parcel it is. */
  carrier: string | null;
  /** The carrier as people write it ("FedEx"), or null. */
  carrierName: string | null;
  /** The tracking number, without spaces, or null when none could be read from what was given. */
  number: string | null;
  /** False: there is no status. `reason` says why. */
  found: boolean;
  /**
   * Why there is no status. "unsupported": Zelfred has no way to track this (a carrier it
   * doesn't ask, or nothing that reads as a tracking link or number); asking again won't help.
   * "unknown": the carrier doesn't know this number. "unavailable": the carrier couldn't be
   * asked just now; ask again later. Null when `found`.
   */
  reason: "unsupported" | "unknown" | "unavailable" | null;
  /**
   * Where the parcel is on its way: "label" (the carrier has the details, not the parcel yet),
   * "transit", "out" (out for delivery), "delivered", "problem" (held, delayed, an exception,
   * going back), or null when the carrier's words fit none.
   */
  stage: "label" | "transit" | "out" | "delivered" | "problem" | null;
  /** The latest status in the carrier's own words ("Departed FedEx hub"), or null. */
  status: string | null;
  /** Where that happened ("Memphis, TN, US"), or null. */
  place: string | null;
  /** When that happened (ms), or null when the carrier doesn't say. */
  at: number | null;
  /** The day it is expected ("YYYY-MM-DD", the carrier's own date), or null. */
  due: string | null;
}

/** Zelfred asked a carrier about a parcel the plugin asked for with `kit.parcels.read`. Since SDK 1.31.0. */
export interface ParcelEvent {
  parcel: Parcel;
  /** The ref given to `kit.parcels.read`. */
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

/**
 * A photo someone sent, for plugins with the "photos" permission. Zelfred keeps the file; the
 * plugin keeps the id. Show it on the page through Zelfred, send it back with
 * `kit.send(text, { photo: id })`, delete it with `kit.files.remove(id)`. Since SDK 1.25.0.
 */
export interface Photo {
  id: string;
  /** "image/jpeg", "image/png", "image/webp". */
  type: string;
  /** Bytes. */
  size: number;
}

/** A PDF that came with a mail, for plugins with the "mail" permission. Like a photo: the plugin keeps the id. Since SDK 1.33.0. */
export interface MailFile {
  id: string;
  type: "application/pdf";
  /** Bytes. */
  size: number;
  /**
   * The attachment's name as its sender wrote it ("Airtel_Nov_2026.pdf"), made safe to show: no control or
   * direction-changing characters, no slashes, at most 100 characters. Sender-written text: show it, never trust it.
   * Missing when the mail gave none. Since SDK 1.34.0.
   */
  name?: string;
  /**
   * What Zelfred read inside the PDF, with its own code in a closed place that keeps nothing. Since SDK 1.35.0.
   * Missing when it was not read in time. `state` says whether it could be read: "locked" (a password), "picture" (a
   * scan with no text) or "failed". Every fact is "the bill says": show it as something the person can change, never
   * state it as true in Zelfred's voice, and never turn `due` into a reminder unless the person agreed once for that
   * sender. A fact Zelfred was not sure of is left out, never guessed. `seller` is the sender's own words, like `name`.
   */
  read?: MailRead;
}

/** What Zelfred read in a mailed PDF (MailFile.read). Since SDK 1.35.0. */
export interface MailRead {
  state: "read" | "locked" | "picture" | "failed";
  /** The bill's total, with at most 2 decimals. */
  amount?: number;
  /** ISO 4217: INR, USD, EUR, GBP, AED or SGD. */
  currency?: string;
  /** The bill's date, YYYY-MM-DD. */
  date?: string;
  /** When it is due, YYYY-MM-DD. */
  due?: string;
  /** The bill's own number (invoice, bill, receipt or order), never an account or card number. At most 40 characters. */
  number?: string;
  /** GST numbers found, the seller's and the buyer's alike, at most 4, each with a valid check character. */
  gstins?: string[];
  /** The seller's name as printed, at most 80 characters. */
  seller?: string;
  /**
   * The company it seems to be from: the one web domain that clearly wins in the PDF's own text ("airtel.in"), mail
   * services left out. Printed by whoever made the PDF, so a name only, never proof. Since SDK 1.38.0.
   */
  site?: string;
  /**
   * Whether it is a bill at all, from words Zelfred found in it and its file's name (since SDK 1.37.0): "not-bill" only
   * when the signs are clear, "unsure" when they are mixed or thin. Treat "unsure" as a bill: nothing should be set
   * aside on a guess. Locked or unreadable PDFs are "unsure" unless their name alone says otherwise.
   */
  kind?: "bill" | "not-bill" | "unsure";
  /** For what is not a bill (or may not be): what it seems to be. Since SDK 1.37.0. */
  sort?: "ticket" | "statement" | "insurance" | "papers" | "quote" | "proforma" | "pay" | "other";
}

/**
 * A mail came to the person's Zelfred mail address from a sender they accepted. Since SDK 1.33.0.
 * What the plugin gets is who sent it and its PDFs, never the mail's text or subject.
 */
export interface MailEvent {
  /** Zelfred's id for this mail; the same for every plugin told of it. */
  id: string;
  /** When it arrived (ms). */
  at: number;
  /** The person's own label from after the plus (name+hdfc@zelfred.com gives "hdfc"), or "". Never a plugin's name. */
  label: string;
  /** Who sent it, as proven: the From address, its domain, and whether it is a company or the person's own mailbox. */
  from: { address: string; domain: string; kind: "company" | "mailbox" };
  /** Its PDFs, up to 3. */
  files: MailFile[];
  /**
   * How many WhatsApp lines (sends and questions) the plugin may still send for this mail. 0 when the person's
   * lines caused by mail are used up for the day (2 across all apps), when the mail is old (the plugin was just
   * added), or at hours Zelfred keeps quiet. Zelfred drops anything past it; read it before starting something that
   * waits for an answer. Since SDK 1.34.0.
   */
  lines?: number;
  /**
   * The mail's own Message-ID, cleaned (angle brackets off, no control or format characters, at most 200 characters),
   * to build a link back to the mail in the person's Gmail:
   * `https://mail.google.com/mail/u/0/#search/rfc822msgid:${encodeURIComponent(messageId)}`. It works only in Gmail,
   * and only in the mailbox the mail came through (a forward from their own Gmail); say so beside the link. Never
   * show it as text, never put it in a message, a log or a count. Missing when the mail had none. Since SDK 1.36.0.
   */
  messageId?: string;
  /**
   * For a mail the person forwarded from their own mailbox: the domain of the original sender, read from the one
   * forwarded header block in the mail ("airtel.com"). A domain only, never a name or an address; the original sender
   * was not checked, so use it to name or sort, never to trust. Missing otherwise. Since SDK 1.37.0.
   */
  forwarded?: { domain: string };
}

/** What a plugin says about a mail it was told of. Since SDK 1.33.0. */
export type MailAnswer = "took" | "not-for-me" | "could-not-read";

/** A position someone shared, for plugins with the "location" permission. Since SDK 1.25.0. */
export interface Place {
  lat: number;
  lng: number;
  /** The place's name and address, when the person picked a named place. */
  name: string | null;
  address: string | null;
}

export interface MessageEvent {
  /**
   * What was written. Never empty, except with the "photos" or "location" permission: a photo
   * or a position sent with no words arrives with an empty text. A photo's caption is its text.
   * With "members" a message that only tags people is empty too (see `mentions`).
   */
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
  /**
   * The photo in the message. WhatsApp sends each photo as its own message, so several photos
   * sent together arrive one after another, each with one photo here, and only the one that
   * carries the caption has a text. Only with the "photos" permission. Since SDK 1.25.0.
   */
  photos?: Photo[];
  /** The position shared in the message. Only with the "location" permission. Since SDK 1.25.0. */
  place?: Place;
  /** The key of the extra group it was sent in; null or unset for the main group. Since SDK 1.6.0. */
  group?: string | null;
  /** Who sent it. Zelfred always sets it since SDK 1.8.0. */
  sender?: Sender;
  /**
   * The people tagged in the message with an @, in the order they were tagged, Zelfred itself
   * left out. Each has the same `id` they have as a `sender`, so a tag can be matched to what
   * that person sent; `name` is null for someone who has not written yet. Their tags are taken
   * out of `text`, so a message that is only a tag arrives with an empty text. Only with the
   * "members" permission, and only when someone was tagged. Since SDK 1.29.0.
   */
  mentions?: Sender[];
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

/**
 * Someone in one of the plugin's groups gave the group a new name or a new description.
 * Zelfred's own changes (the name it gives a group, the description it writes) never arrive.
 * Zelfred finds out when the next message in that group comes in, and tells the plugin first,
 * so this always runs before the `onMessage` of that message. `kit.send` posts in that group.
 * Since SDK 1.28.0.
 */
export interface GroupInfoEvent {
  /** The key of the extra group it happened in; null or unset for the main group. */
  group?: string | null;
  what: "name" | "description";
  /** The new name (without Zelfred's ending), or the new description. Empty when it was removed. */
  value: string;
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

/** What Zelfred's sorting model made of words a plugin asked about with `kit.sort`. Since SDK 1.32.0. */
export interface SortEvent {
  /** The ref given to `kit.sort`. */
  ref: Json;
  /** One of the ids in the choices given, or null: none fitted well enough, or nothing could be asked. */
  choice: string | null;
  /** 0 to 1; 0 when `choice` is null because nothing was asked. */
  confidence: number;
}

/** A PDF given to `kit.files.read` was read. Since SDK 1.36.0. */
export interface FileReadEvent {
  /** The file's id, as given. */
  fileId: string;
  /** The ref given to `kit.files.read`. */
  ref: Json;
  /** What the bill says, as `MailFile.read`; state "failed" when it could not be read or the day's limit was reached. */
  read: MailRead;
}

/** A person deleted, for everyone, a message of theirs that the plugin had marked. Since SDK 1.30.0. */
export interface DeletedEvent {
  /** The ref the message was marked with (`kit.mark`). */
  ref: Json;
  /** The key of the extra group the message was in; null or unset for the main group. */
  group?: string | null;
  /** Who deleted it, when WhatsApp says. */
  sender?: Sender;
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
   * Names of `actions` that need the person's lock: their passkey, passphrase or recovery key,
   * the one lock they have across Zelfred. Zelfred runs such an action only when the call comes
   * signed by that lock, for this plugin, this action and these very arguments, minutes ago at
   * most and never twice. Without that the action does not run, so what it returns never leaves
   * the server. The plugin does nothing else: no check of its own, and no way to switch it off.
   * Use it for an action that hands back something kept hidden (a card number whole). Not for
   * `load`, which runs with a login alone: keep what is hidden out of it. Since SDK 1.39.0.
   */
  locked?: string[];
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
  /**
   * A person deleted for everyone a message of theirs that the plugin marked with `kit.mark`: what it stood for is
   * usually to be taken back. Not called for messages that were never marked, nor for the plugin's own. `kit.react`
   * does nothing here: the message is gone. Since SDK 1.30.0.
   */
  onDeleted?(event: DeletedEvent, kit: Kit): Promise<void>;
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
   * A group of the plugin's got a new name or description from someone in it. Having this
   * makes Zelfred look at both whenever a message arrives there. Since SDK 1.28.0.
   */
  onGroupInfo?(event: GroupInfoEvent, kit: Kit): Promise<void>;
  /**
   * An entry was added, edited or removed in this plugin's vault. Needs the "vault" permission,
   * and is the only word a vault plugin gets about what people write. Since SDK 1.21.0.
   */
  onEntry?(event: EntryEvent, kit: Kit): Promise<void>;
  /** A link asked for with `kit.links.read` was read. Needs the "links" permission. Since SDK 1.24.0. */
  onLink?(event: LinkEvent, kit: Kit): Promise<void>;
  /** A parcel asked about with `kit.parcels.read` was looked up. Needs the "parcels" permission. Since SDK 1.31.0. */
  onParcel?(event: ParcelEvent, kit: Kit): Promise<void>;
  /** A PDF given to `kit.files.read` was read. Needs the "mail" permission. Since SDK 1.36.0. */
  onFileRead?(event: FileReadEvent, kit: Kit): Promise<void>;
  /** Words given to `kit.sort` were sorted. Needs the "sort" permission. Since SDK 1.32.0. */
  onSorted?(event: SortEvent, kit: Kit): Promise<void>;
  /**
   * A mail came to the person's Zelfred mail address from a sender they accepted. Answer "took" to keep its files
   * (as with photos: `kit.files.get`, `kit.files.remove`), "not-for-me", or "could-not-read" (a miss, counted).
   * Needs the "mail" permission. Since SDK 1.33.0.
   */
  onMail?(event: MailEvent, kit: Kit): Promise<MailAnswer>;
  /**
   * The one line Zelfred posts in the app's group at 8pm when the app's lines caused by mail were held back past the
   * owner's cap (2 a day across all apps). `one` for a single held line, `many` with "{n}" for more. Name no sender
   * and nothing from a mail: only the count and where to look. Without it Zelfred says it in plain words of its own.
   * Needs the "mail" permission. Since SDK 1.34.0.
   */
  mailSummary?: { one: string; many: string };
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
  for (const name of def.web?.locked ?? []) {
    if (!def.web?.actions || !Object.hasOwn(def.web.actions, name)) throw new Error(`${def.id}: web.locked names "${name}", which is not one of web.actions`);
  }
  if (new Set(def.web?.locked ?? []).size !== (def.web?.locked ?? []).length) throw new Error(`${def.id}: web.locked names an action twice`);
  if (def.web?.loadFor && !def.permissions?.includes("members")) throw new Error(`${def.id}: web.loadFor needs the "members" permission`);
  if (def.onEntry && !def.permissions?.includes("vault")) throw new Error(`${def.id}: onEntry needs the "vault" permission`);
  if (def.permissions?.includes("vault")) {
    // Nothing written in a vault plugin's group may reach the plugin or anything that reads.
    if (def.onMessage) throw new Error(`${def.id}: a "vault" plugin can't have onMessage (it never sees what people write; use onEntry)`);
    if (def.understand || def.onIntent) throw new Error(`${def.id}: a "vault" plugin can't have understand (nothing written there is read)`);
    if (def.onGroup) throw new Error(`${def.id}: a "vault" plugin can't take groups the person already had (onGroup)`);
    if (def.onGroupInfo) throw new Error(`${def.id}: a "vault" plugin isn't told about its group's name or description (onGroupInfo)`);
    for (const p of ["links", "members", "photos", "location"] as const) {
      if (def.permissions.includes(p)) throw new Error(`${def.id}: "vault" and "${p}" can't be used together`);
    }
  }
  if (def.permissions?.includes("share") && def.permissions.includes("vault")) throw new Error(`${def.id}: "share" and "vault" can't be used together`);
  if (def.web?.shared && !def.permissions?.includes("share")) throw new Error(`${def.id}: web.shared needs the "share" permission`);
  if (def.permissions?.includes("share") && !def.web?.shared) throw new Error(`${def.id}: the "share" permission needs web.shared (what a shared page shows)`);
  if ((def.onLink || def.links) && !def.permissions?.includes("links")) throw new Error(`${def.id}: onLink and links need the "links" permission`);
  if (def.onParcel && !def.permissions?.includes("parcels")) throw new Error(`${def.id}: onParcel needs the "parcels" permission`);
  if (def.permissions?.includes("parcels") && !def.onParcel) throw new Error(`${def.id}: the "parcels" permission needs onParcel (where the answer arrives)`);
  if (def.onSorted && !def.permissions?.includes("sort")) throw new Error(`${def.id}: onSorted needs the "sort" permission`);
  if (def.permissions?.includes("sort") && !def.onSorted) throw new Error(`${def.id}: the "sort" permission needs onSorted (where the answer arrives)`);
  if (def.permissions?.includes("sort") && def.permissions.includes("vault")) throw new Error(`${def.id}: "sort" can't be combined with "vault" (nothing written there is read)`);
  if (def.onMail && !def.permissions?.includes("mail")) throw new Error(`${def.id}: onMail needs the "mail" permission`);
  if (def.permissions?.includes("mail") && !def.onMail) throw new Error(`${def.id}: the "mail" permission needs onMail (where mail arrives)`);
  if (def.permissions?.includes("mail") && def.permissions.includes("vault")) throw new Error(`${def.id}: "mail" can't be combined with "vault"`);
  if (def.mailSummary) {
    if (!def.permissions?.includes("mail")) throw new Error(`${def.id}: mailSummary needs the "mail" permission`);
    const { one, many } = def.mailSummary;
    if (!one?.trim() || !many?.includes("{n}") || one.length > 200 || many.length > 200) throw new Error(`${def.id}: mailSummary needs one and many (with "{n}"), each at most 200 characters`);
  }
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
