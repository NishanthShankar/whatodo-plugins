/**
 * Everything Forms puts on WhatsApp: its welcome and help, every reply, every submission's
 * message, every group name and every reaction. index.ts decides what to say; this file
 * decides how.
 *
 * Each message is a list with one wording today (see src/copy.ts). A message takes its data
 * and returns the whole text.
 */
import { fixed, msg } from "../../sdk";

// ── Words the parser in index.ts reads back, and the examples shown to people. ──
// A message that names a command uses these, so a rewrite can't break one by accident.

/** The platform's own word: it sends this plugin's help. */
export const HELP = fixed("help");
export const NEW_FORM = fixed("new form");
export const NEW_FORM_EXAMPLE = fixed("new form contact");
/** Added to "new form <name>": the form gets a WhatsApp group of its own. */
export const OWN_GROUP = fixed("in its own group");
export const GROUP_EXAMPLE = fixed("group contact");
export const FORMS = fixed("forms");
export const RENAME_EXAMPLE = fixed("rename contact to Contact us");
export const ADDRESS = fixed("address");
export const ADDRESS_EXAMPLE = fixed("address contact");
export const LAST = fixed("last");
export const LAST_EXAMPLE = fixed("last contact");
export const NEW_ADDRESS_EXAMPLE = fixed("new address contact");
export const CLOSE_EXAMPLE = fixed("close contact");

// ── Reactions ──

/** On the message that closed a form. */
export const CLOSED = fixed("👍");
/** Put back on a submission's message once it is marked as dealt with. */
export const MARKED_DONE = fixed("✅");

export const copy = {
  // ── What the plugin says about itself ──
  welcome: msg([
    `📬 You've installed *Forms*.\n\nSend _${NEW_FORM_EXAMPLE}_ to make your first form. I'll give you an address to paste into your website, and every submission will arrive here.\n\nSend _${HELP}_ for more.`,
  ]),
  help: msg([
    [
      "*Forms*",
      "",
      `_${NEW_FORM_EXAMPLE}_ makes a form and gives you its address`,
      `_${NEW_FORM_EXAMPLE} ${OWN_GROUP}_ also makes a WhatsApp group just for it`,
      `_${GROUP_EXAMPLE}_ gives a form you already have its own group`,
      `_${FORMS}_ lists your forms and their addresses`,
      `_${ADDRESS_EXAMPLE}_ shows one form's address again`,
      `_${LAST}_ (or _${LAST_EXAMPLE}_) shows the latest submission`,
      `_${RENAME_EXAMPLE}_ gives a form a new name; its address stays`,
      `_${NEW_ADDRESS_EXAMPLE}_ replaces a form's address if the old one is being misused`,
      `_${CLOSE_EXAMPLE}_ stops a form taking submissions`,
      "",
      "Each submission arrives here as a message. React ✅ when you've dealt with it.",
      "Everything is kept on app.whatodo.today, where you can open the files and delete things.",
    ].join("\n"),
  ]),
  /** The main group's name. */
  groupName: msg(["📬 Forms"]),
  /** Sent when a message is nothing Forms knows. */
  notUnderstood: msg([`I didn't get that. Send _${HELP}_ to see what I can do.`]),

  // ── Making a form, and its address ──
  /** Also shown on the web page when making a form there fails (without the _ and *). */
  formNeedsName: msg([`Give the form a name, like _${NEW_FORM_EXAMPLE}_.`]),
  /** Also shown on the web page (without the _ and *). */
  formExists: msg<{ name: string; key: string }>([({ name, key }) => `You already have a form called *${name}*. Send _${ADDRESS} ${key}_ for its address.`]),
  /** Also shown on the web page (without the _ and *). */
  tooManyForms: msg<{ max: number }>([({ max }) => `That's the most forms I can keep (${max}). Delete one on app.whatodo.today first.`]),
  /** A form's address. `fresh`: it was just made (or opened again). `ownGroup`: it has a WhatsApp group of its own. */
  address: msg<{ key: string; name: string; url: string; fresh: boolean; ownGroup: boolean }>([
    ({ key, name, url, fresh, ownGroup }) =>
      [
        fresh ? `📬 Your form *${name}* is ready.` : `📬 *${name}*`,
        "",
        "Post to this address:",
        url,
        "",
        "Use it as your form's _action_ (method POST), or send JSON to it from a script. Files work with a normal file field.",
        fresh
          ? `\n${ownGroup ? `I'm making a WhatsApp group just for this form. Submissions will arrive there (here until it's ready).` : "Submissions will arrive here."} Send _${ADDRESS} ${key}_ to see this again.`
          : "",
      ]
        .join("\n")
        .trim(),
  ]),
  newAddress: msg<{ name: string; url: string }>([
    ({ name, url }) => `📬 *${name}* has a new address. The old one no longer works, so update your website:\n\n${url}\n\nEverything it received is still here.`,
  ]),
  /** A form got a new name. Its key, and so its address, stay as they were. */
  renamed: msg<{ from: string; to: string }>([({ from, to }) => `📬 *${from}* is now *${to}*. Its address hasn't changed.`]),
  renameNeedsName: msg([`Tell me the new name too, like _${RENAME_EXAMPLE}_.`]),
  nameTaken: msg<{ name: string }>([({ name }) => `You already have a form called "${name}". Pick another name.`]),
  noSuchForm: msg<{ name: string }>([({ name }) => `I don't have a form called "${name}". Send _${FORMS}_ to see yours.`]),
  /** Asked for the address, or a new one, of a closed form. */
  closedReopen: msg<{ name: string; key: string }>([({ name, key }) => `*${name}* is closed. Send _${NEW_FORM} ${key}_ to open it again with a new address.`]),

  // ── The list ──
  noForms: msg([`No forms yet. Send _${NEW_FORM_EXAMPLE}_ to make one.`]),
  /** A closed form has no address to show. */
  formsList: msg<{ forms: { name: string; closed: boolean; count: number; url: string }[] }>([
    ({ forms }) => {
      const lines = ["*Your forms*", ""];
      for (const { name, closed, count, url } of forms) {
        lines.push(`*${name}*${closed ? " (closed)" : ""}: ${count} submission${count === 1 ? "" : "s"}`);
        if (!closed) lines.push(url);
        lines.push("");
      }
      return lines.join("\n").trim();
    },
  ]),

  // ── Submissions ──
  /**
   * One submission. `fields`: the ones shown, in the form's order, values already cut to
   * length. `more`: how many fields were left out. `files`: each with its size written out.
   * index.ts cuts the whole message to what WhatsApp takes.
   */
  submission: msg<{ form: string; fields: { name: string; value: string }[]; more: number; files: { name: string; size: string }[] }>([
    ({ form, fields, more, files }) => {
      const lines = [`📬 *${form}*`];
      for (const { name, value } of fields) lines.push(`*${name}:* ${value}`);
      if (more > 0) lines.push(`_and ${more} more fields_`);
      if (!fields.length && !files.length) lines.push("_An empty submission._");
      if (files.length) lines.push(`📎 ${files.map((f) => `${f.name} (${f.size})`).join(", ")}`);
      if (files.length) lines.push("_Open the files on app.whatodo.today._");
      return lines.join("\n");
    },
  ]),
  nothingYet: msg(["Nothing has come in yet."]),
  /** Said once on the day a form goes past its daily number of messages. */
  tooManyToday: msg<{ name: string; limit: number }>([
    ({ name, limit }) => `📬 *${name}* has had more than ${limit} submissions today. I'll stop messaging about it until tomorrow. They're all on app.whatodo.today.`,
  ]),

  // ── Closing ──
  closed: msg<{ name: string }>([({ name }) => `*${name}* is closed. Its address no longer works. What it received is still on app.whatodo.today.`]),

  // ── A form's own group ──
  /** The WhatsApp group's name. index.ts cuts it to the 25 characters a group name can have. */
  groupTitle: msg<{ name: string }>([({ name }) => `📬 ${name}`]),
  /** The first message in the group. */
  groupHello: msg<{ name: string }>([
    ({ name }) => `📬 This group is for your form *${name}*. Every submission to it arrives here.\n\nSend _${LAST}_ for the latest one or _${ADDRESS}_ for the form's address.`,
  ]),
  makingGroup: msg<{ name: string }>([({ name }) => `📬 I'm making a WhatsApp group just for *${name}*. Its submissions will arrive there (here until it's ready).`]),
  alreadyOwnGroup: msg<{ name: string }>([({ name }) => `*${name}* already has its own group.`]),
  /** Asked to give a closed form a group. */
  closedReopenWithGroup: msg<{ name: string; key: string }>([({ name, key }) => `*${name}* is closed. Send _${NEW_FORM} ${key} ${OWN_GROUP}_ to open it again.`]),
};
