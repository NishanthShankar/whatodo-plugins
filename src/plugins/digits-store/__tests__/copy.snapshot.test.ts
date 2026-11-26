/**
 * Everything Digits can say, captured exactly, so the wording changes on purpose and never by
 * accident: a change here is a change people see.
 */
import { expect, it } from "vitest";
import digits from "..";
import { copy } from "../copy";

const line = { name: "weight", value: "72.4 kg", when: "today", count: 6, first: { value: "75", when: "on 3 August" } };

it("digits copy", () => {
  expect({
    groupName: digits.groupName,
    welcome: digits.welcome,
    help: digits.help,
    tagline: digits.tagline,
    description: digits.description,
    listing: digits.listing,
    firstKept: copy.firstKept({ name: "weight", value: "72.4" }),
    whatIsIt: copy.whatIsIt({ value: "72.4" }),
    jump: copy.jump({ name: "waist", value: "340", before: "34" }),
    secret: copy.secret({ what: "aadhaar" }),
    lockedCard: copy.locked({ what: "card" }),
    lockedPin: copy.locked({ what: "pin" }),
    keptDateYearly: copy.keptDate({ name: "Riya birthday", date: "12 March", remind: "yearly" }),
    keptDateOnce: copy.keptDate({ name: "passport", date: "3 March 2031", remind: "once" }),
    keptDatePast: copy.keptDate({ name: "joined office", date: "1 June 2019", remind: null }),
    remindToday: copy.reminder({ name: "Riya birthday", date: "12 March", due: "today", kind: "yearly" }),
    remindSoon: copy.reminder({ name: "passport", date: "3 March 2031", due: "soon", kind: "once" }),
    keptWithPage: copy.keptWithPage({ name: "weight", count: 2 }),
    recallOne: copy.recall({ line: { ...line, first: null, count: 1 } }),
    recall: copy.recall({ line }),
    recallMany: copy.recallMany({ lines: [line, { ...line, name: "waist", value: "34" }] }),
    list: copy.list({ lines: [line], more: 3 }),
    history: copy.history({ name: "weight", rows: [{ value: "72.4", when: "today" }, { value: "73", when: "yesterday" }], more: 0 }),
    notFound: copy.notFound({ words: "shoe size" }),
    nothingYet: copy.nothingYet(),
    page: copy.page(),
    takenOut: copy.takenOut({ what: "weight, 79" }),
    nothingToUndo: copy.nothingToUndo(),
    askRemove: copy.askRemove({ name: "weight", count: 6 }),
    removedLabel: copy.removedLabel({ name: "weight" }),
    keptLabel: copy.keptLabel({ name: "weight" }),
    samePerson: copy.samePerson({ asked: "mom", kept: "amma" }),
    sameKept: copy.sameKept({ asked: "mom", kept: "amma" }),
    sameNot: copy.sameNot(),
    nowCounting: copy.nowCounting({ name: "gym" }),
    counted: copy.counted({ name: "gym", count: 14 }),
    takenOutCount: copy.takenOutCount({ name: "gym", count: "13" }),
    photoAlone: copy.photoAlone(),
    photosFull: copy.photosFull(),
    full: copy.full({ max: 300 }),
  }).toMatchSnapshot();
});
