/**
 * Everything Journal puts on WhatsApp: the note pinned in its group, the one line after the
 * first entry, the evening prompt and the streak line. index.ts decides what to say; this
 * file decides how.
 *
 * Journal never reads a message, so there are no command words here: nothing typed in its
 * group is ever compared against anything.
 *
 * What we may promise is narrow, and the wording keeps to it: each message is read once, to
 * lock it, and can't be opened by us after that. Never "end to end encrypted".
 */
import { msg } from "../../sdk";

/** Where the journal is read. */
export const PAGE = "app.whatodo.today/plugins/journal";

export const copy = {
  /** The main group's name. */
  groupName: msg(["📓 Journal"]),

  /**
   * The note pinned at the top of the group: what I can and can't do, and the three things
   * to know. It stands in for "help", which can't exist here. Three instructions at most.
   */
  welcome: msg([
    `📓 *Your journal*\nI read each message here once, to lock it away. After that I can't open it. Only you can, with your passphrase.\n\n• Every message is an entry: words, photos, voice notes.\n• ❌ on a message removes it.\n• Read it all at ${PAGE}`,
  ]),

  /** After the 👍 on the very first entry. */
  firstEntry: msg([`That's your first entry, locked and kept. Open your journal at ${PAGE} with your passphrase to read it.`]),

  /** The evening prompt, when the person turned it on and hasn't written today. */
  prompt: msg(["How was today?"]),

  /** Said once when a streak reaches a round number. Counted from dates alone. */
  streak: msg<{ days: number }>([({ days }) => `${days} days in a row.`]),
};
