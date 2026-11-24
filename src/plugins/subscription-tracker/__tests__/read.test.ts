import { describe, expect, it } from "vitest";
import { addMonths, daysBetween, findDate, nextAfter, sayNear, sayWhen } from "../dates";
import { leads, serviceKind, thingOf } from "../lists";
import { readBank, readSub } from "../read";

const TODAY = "2026-11-15";

describe("reading what is typed", () => {
  it("takes a name, an amount, how often and the day of the month", () => {
    expect(readSub("Netflix 649 monthly on the 5th", TODAY)).toEqual({ name: "Netflix", amount: 649, currency: null, day: "2026-12-05", every: "monthly", via: "unknown", trial: false, expires: null });
    expect(readSub("netflix rs 649 every month", TODAY)).toMatchObject({ name: "netflix", amount: 649, currency: "INR", day: null, every: "monthly" });
    expect(readSub("Google One ₹1,300 yearly 14 March", TODAY)).toMatchObject({ name: "Google One", amount: 1300, currency: "INR", day: "2027-03-14", every: "yearly" });
    expect(readSub("gym 2500 a quarter", TODAY)).toMatchObject({ name: "gym", amount: 2500, every: "quarterly" });
    expect(readSub("Office 365 6199 yearly", TODAY)).toMatchObject({ name: "Office 365", amount: 6199 });
    expect(readSub("spotify 119", TODAY)).toMatchObject({ name: "spotify", amount: 119, day: null, every: null });
  });

  it("takes a day of the month alone as monthly, and the next one that comes", () => {
    expect(readSub("icloud 75 on the 20th", TODAY)).toMatchObject({ day: "2026-11-20", every: "monthly" });
    expect(readSub("icloud 75 on the 15th", TODAY)).toMatchObject({ day: "2026-12-15" });
    expect(readSub("icloud 75 on 31st", "2027-01-31")).toMatchObject({ day: "2027-02-28" });
  });

  it("takes a thing that runs out, with its date and no amount", () => {
    expect(readSub("car insurance 14 Feb", TODAY)).toEqual({ name: "car insurance", amount: null, currency: null, day: "2027-02-14", every: null, via: "unknown", trial: false, expires: null });
    expect(readSub("Amma's passport expires 3 March 2031", TODAY)).toMatchObject({ name: "Amma's passport", day: "2031-03-03", expires: true });
    expect(readSub("PUC valid till 12/05/2027", TODAY)).toMatchObject({ name: "PUC", day: "2027-05-12", expires: true });
    expect(readSub("warranty fridge until 2028-01-09", TODAY)).toMatchObject({ name: "warranty fridge", day: "2028-01-09", expires: true });
  });

  it("reads a trial, how it is paid, and a word that it renews", () => {
    expect(readSub("Spotify trial ends 5 Dec 119", TODAY)).toMatchObject({ name: "Spotify", trial: true, day: "2026-12-05", amount: 119, expires: null });
    expect(readSub("hotstar 299 monthly by upi autopay", TODAY)).toMatchObject({ name: "hotstar", via: "upi" });
    expect(readSub("zee5 99 monthly on card", TODAY)).toMatchObject({ name: "zee5", via: "card" });
    expect(readSub("duolingo 499 monthly play store", TODAY)).toMatchObject({ name: "duolingo", via: "store" });
    expect(readSub("domain renews 4 jan 899", TODAY)).toMatchObject({ name: "domain", expires: false, amount: 899 });
    expect(readSub("credit card expires 30 june 2028", TODAY)).toMatchObject({ name: "credit card", via: "unknown" });
  });

  it("returns nothing for a line with no name, or with neither an amount nor a date", () => {
    expect(readSub("649", TODAY)).toBeNull();
    expect(readSub("netflix", TODAY)).toBeNull();
    expect(readSub("who is paying for dinner", TODAY)).toBeNull();
    expect(readSub("14 feb", TODAY)).toBeNull();
    expect(readSub("", TODAY)).toBeNull();
  });
});

describe("reading a forwarded bank message", () => {
  it("reads a UPI AutoPay debit, and leaves the balance", () => {
    const b = readBank("Rs.649.00 debited from A/c XX4321 on 05-11-26 to NETFLIX via UPI AutoPay. Avl Bal Rs 12,345.10 -HDFC Bank", TODAY);
    expect(b).toEqual({ name: "Netflix", amount: 649, currency: "INR", day: "2026-11-05", via: "upi", account: "HDFC xx4321" });
  });

  it("reads a card charge", () => {
    expect(readBank("INR 1,499.00 spent on ICICI Bank Card XX9876 at Adobe Systems on 02-Nov-26. Avl Limit INR 80,000.", TODAY)).toMatchObject({ name: "Adobe Systems", amount: 1499, via: "card", account: "ICICI xx9876", day: "2026-11-02" });
  });

  it("reads a mandate that was run", () => {
    expect(readBank("Your UPI-Mandate for Rs 199.00 towards Spotify India is successfully executed from A/c X1234 on 10/11/2026.", TODAY)).toMatchObject({ name: "Spotify India", amount: 199, via: "upi", day: "2026-11-10" });
  });

  it("gives the amount with no name when the name can't be read", () => {
    expect(readBank("Rs 499.00 debited from your account XX1111 on 12-11-26. Ref 4455667788.", TODAY)).toMatchObject({ name: null, amount: 499, account: "xx1111" });
  });

  it("is not fooled by a typed line or by chatter", () => {
    expect(readBank("Netflix 649 monthly on the 5th", TODAY)).toBeNull();
    expect(readBank("i paid for lunch yesterday, you get dinner", TODAY)).toBeNull();
  });
});

describe("dates", () => {
  it("finds a date and gives back the rest", () => {
    expect(findDate("car insurance 14 feb", TODAY)).toEqual({ day: "2027-02-14", monthly: false, rest: "car insurance" });
    expect(findDate("renews dec 3", TODAY)).toMatchObject({ day: "2026-12-03" });
    expect(findDate("x 30/02/2027", TODAY)).toBeNull();
    expect(findDate("debited on 05-11-26", TODAY, true)).toMatchObject({ day: "2026-11-05" });
    expect(findDate("debited on 20 dec", TODAY, true)).toMatchObject({ day: "2025-12-20" });
  });

  it("keeps the day of the month through a short month", () => {
    expect(nextAfter("2027-01-31", "monthly", 31)).toBe("2027-02-28");
    expect(nextAfter("2027-02-28", "monthly", 31)).toBe("2027-03-31");
    expect(nextAfter("2026-11-15", "weekly")).toBe("2026-11-22");
    expect(nextAfter("2026-11-15", "quarterly")).toBe("2027-02-15");
    expect(nextAfter("2026-11-15", "yearly")).toBe("2027-11-15");
    expect(addMonths("2026-12-05", 120)).toBe("2036-12-05");
    expect(daysBetween("2026-11-15", "2026-12-05")).toBe(20);
  });

  it("says how near a date is", () => {
    expect(sayWhen("2026-11-16", TODAY)).toBe("tomorrow");
    expect(sayWhen("2026-11-20", TODAY)).toBe("Friday");
    expect(sayWhen("2027-02-14", TODAY)).toBe("on 14 February 2027");
    expect(sayNear(21)).toBe("in 3 weeks");
    expect(sayNear(30)).toBe("in a month");
    expect(sayNear(91)).toBe("in 3 months");
  });
});

describe("the lists", () => {
  it("knows the kind of a well-known service, and the things that run out", () => {
    expect(serviceKind("Netflix")).toBe("use");
    expect(serviceKind("Google One 2TB")).toBe("keeps");
    expect(serviceKind("Milkman")).toBeNull();
    expect(thingOf("Amma's passport")).toMatchObject({ months: 120, floor: 270 });
    expect(thingOf("car insurance")).toMatchObject({ either: true });
    expect(thingOf("Netflix")).toBeNull();
  });

  it("times the first notice by how far away the date was when entered", () => {
    // The table in the brief: 1.5 x the square root of the wait, rounded to something a person would say.
    expect(leads(10, 0).first).toBe(5);
    expect(leads(30, 0).first).toBe(7);
    expect(leads(90, 0).first).toBe(14);
    expect(leads(182, 0).first).toBe(21);
    expect(leads(365, 0)).toEqual({ first: 30, middle: null, late: false });
    expect(leads(1095, 0).first).toBe(49);
    expect(leads(3650, 0)).toEqual({ first: 90, middle: 30, late: false });
  });

  it("never speaks later than the time the thing takes, and says when that has gone", () => {
    expect(leads(3650, 270)).toEqual({ first: 270, middle: 90, late: false });
    expect(leads(42, 270)).toEqual({ first: null, middle: null, late: true });
    expect(leads(2, 0)).toEqual({ first: null, middle: null, late: false });
  });
});
