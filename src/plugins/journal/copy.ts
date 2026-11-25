/**
 * Everything Journal puts on WhatsApp: the note pinned in its group, the evening prompt and
 * the streak line. index.ts decides what to say; this file decides how.
 *
 * Journal never reads a message, so there are no command words here: nothing typed in its
 * group is ever compared against anything.
 *
 * Nothing here says who can or can't open the journal. That depends on who holds its key at
 * the time (a journal started in WhatsApp is locked by its person a little later), so Zelfred
 * adds that line to the pinned note itself and says the line after the first entry.
 * Never "end to end encrypted".
 */
import { msg } from "../../sdk";

/** Where the journal is read. */
export const PAGE = "app.zelfred.com/plugins/journal";

export const copy = {
  /** The main group's name. */
  groupName: msg(["📓 Journal"]),

  /**
   * The note pinned at the top of the group: the three things to know. It stands in for
   * "help", which can't exist here. Zelfred adds what it can promise about the lock below it.
   */
  welcome: msg([`📓 *Your journal*\n\n• Every message is an entry: words, photos, voice notes.\n• ❌ on a message removes it.\n• Read it all at ${PAGE}`]),

  /** The evening prompt, when the person turned it on and hasn't written today. */
  prompt: msg(["How was today?"]),

  /** Said once when a streak reaches a round number. Counted from dates alone. */
  streak: msg<{ days: number }>([({ days }) => `${days} days in a row.`]),
};
