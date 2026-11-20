/**
 * Everything Journal can say, captured exactly, so the wording changes on purpose and never
 * by accident: a change here is a change people see.
 */
import { expect, it } from "vitest";
import journal from "..";
import { copy } from "../copy";

it("journal copy", () => {
  expect({
    groupName: journal.groupName,
    welcome: journal.welcome,
    tagline: journal.tagline,
    description: journal.description,
    listing: journal.listing,
    prompt: copy.prompt(),
    streak: copy.streak({ days: 7 }),
  }).toMatchSnapshot();
});
