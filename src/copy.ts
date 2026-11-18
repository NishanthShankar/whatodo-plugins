/**
 * The one place a message's wording is chosen.
 *
 * Every message a plugin sends is written in its copy.ts as a list of wordings. A wording is
 * a plain string, or a function of the message's data; every wording of one message takes the
 * same data. Calling the message picks one wording and returns the finished text:
 *
 *   const saved = msg(["Saved."]);                       // copy.saved() -> "Saved."
 *   const noSuchList = msg<{ name: string }>([({ name }) => `There's no list called "${name}".`]);
 *
 * To give a message a second wording, add it to its list. Nothing outside the copy files ever
 * sees the list: callers get a string, and a caller that needs the same text twice (sent, then
 * saved or compared) calls once and passes the string along.
 *
 * Text that code compares against (a poll option matched on a vote, a word the parser reads,
 * a reaction that logic checks for) must never vary: write it with `fixed`, which takes
 * exactly one string.
 *
 * telcurio itself has the same helper (whatodo: convex/copy/pick.ts).
 *
 * A plugin may not call Math.random itself (see docs/sdk-reference.md); it gets variety only
 * through `msg`, in its copy.ts.
 */

/** One way of saying a message: the text itself, or a function that builds it from the message's data. */
export type Wording<D> = string | ((data: D) => string);

/** A message: call it with its data and get the whole text back. `wordings` is how many ways it has of saying it. */
export type Message<D> = ((data: D) => string) & { readonly wordings: number };

let source: () => number = Math.random;

/**
 * Tests only: replace where picks come from, with a function that returns a number from 0 up
 * to (not including) 1. `i / n` picks wording `i` of `n`. Call with nothing to go back to
 * Math.random.
 */
export function useRandom(fn?: () => number): void {
  source = fn ?? Math.random;
}

/** A message with one or more wordings. One is picked each time it is called. */
export function msg<D = void>(wordings: readonly [Wording<D>, ...Wording<D>[]]): Message<D> {
  const say = (data: D): string => {
    // A single wording never asks for a random number.
    const w = wordings.length === 1 ? wordings[0] : wordings[Math.min(wordings.length - 1, Math.max(0, Math.floor(source() * wordings.length)))];
    return typeof w === "string" ? w : w(data);
  };
  return Object.assign(say, { wordings: wordings.length });
}

/**
 * Text with exactly one wording, for good: something code compares against. It takes one
 * string and returns it, so it can't be handed a list.
 */
export function fixed<const T extends string>(text: T): T {
  return text;
}
