import { describe, expect, it } from "vitest";
import { directMatch, readNumbers, readValue, secretOf, shapeWords, tidyLabel, wordsOf } from "../read";

/** [label, value as typed, shape, number] for each piece of a message. */
const read = (text: string) => readNumbers(text)?.pieces.map((p) => [p.label, p.value.text, p.value.shape, p.value.num]) ?? null;

describe("reading numbers as people type them", () => {
  it("reads a number with a word, either side, with filler taken off", () => {
    expect(read("weight 72.4")).toEqual([["weight", "72.4", "number", 72.4]]);
    expect(read("72.4 weight")).toEqual([["weight", "72.4", "number", 72.4]]);
    expect(read("my weight is 86 kg")).toEqual([["weight", "86 kg", "number", 86]]);
    expect(read("Amma ring size 14")).toEqual([["Amma ring size", "14", "number", 14]]);
    expect(read("electricity meter: 04512")).toEqual([["electricity meter", "04512", "number", 4512]]);
  });

  it("reads a number alone with no label", () => {
    expect(read("72.4")).toEqual([["", "72.4", "number", 72.4]]);
  });

  it("finds nothing in words alone", () => {
    expect(readNumbers("weight?")).toBeNull();
    expect(readNumbers("what's Amma's ring size")).toBeNull();
  });

  it("keeps the unit with the number", () => {
    const unit = (t: string) => readNumbers(t)!.pieces[0].value.unit;
    expect(unit("weight 72.4kg")).toBe("kg");
    expect(unit("weight 160 lbs")).toBe("lb");
    expect(unit("waist 34 in")).toBe("in");
    expect(unit("waist 34 inches")).toBe("in");
    expect(unit("mileage 18 kmpl")).toBe("kmpl");
    expect(unit("sugar 110 mg/dl")).toBe("mg/dl");
    expect(read("waist 34 in")![0][0]).toBe("waist");
  });

  it("reads heights in feet and inches as inches for a graph", () => {
    expect(read("height 5'6\"")).toEqual([["height", "5'6\"", "height", 66]]);
    expect(read("height 5' 6")).toEqual([["height", "5' 6", "height", 66]]);
    expect(read("height 5 ft 6 in")).toEqual([["height", "5 ft 6 in", "height", 66]]);
    expect(read("Riya height 4 feet 2 inches")).toEqual([["Riya height", "4 feet 2 inches", "height", 50]]);
  });

  it("reads two numbers with a slash as one reading", () => {
    const r = readNumbers("bp 120/80")!.pieces[0].value;
    expect([r.text, r.shape, r.num, r.num2]).toEqual(["120/80", "reading", 120, 80]);
    expect(readNumbers("bp 120 80")!.pieces[0].value.text).toBe("120 80");
  });

  it("reads lakh, crore, thousands and rupees", () => {
    expect(read("salary 1.5 lakh")).toEqual([["salary", "1.5 lakh", "amount", 150000]]);
    expect(read("flat 2 crore")).toEqual([["flat", "2 crore", "amount", 20000000]]);
    expect(read("rent ₹25,000")).toEqual([["rent", "₹25,000", "amount", 25000]]);
    expect(read("rent rs 25000")).toEqual([["rent", "rs 25000", "amount", 25000]]);
    expect(read("FD 12,34,567")).toEqual([["FD", "12,34,567", "number", 1234567]]);
    expect(read("steps 10k")).toEqual([["steps", "10k", "number", 10000]]);
  });

  it("reads dates as dates, with no number for a graph", () => {
    expect(read("birthday 12/03/1990")).toEqual([["birthday", "12/03/1990", "date", null]]);
    expect(read("Riya birthday 12 March")).toEqual([["Riya birthday", "12 March", "date", null]]);
    expect(read("anniversary March 3rd 2015")).toEqual([["anniversary", "March 3rd 2015", "date", null]]);
  });

  it("reads ids, phone numbers and registration numbers as one value", () => {
    expect(read("aadhaar 2341 2341 2346")).toEqual([["aadhaar", "2341 2341 2346", "id", null]]);
    expect(read("mobile +91 98765 43210")).toEqual([["mobile", "+91 98765 43210", "id", null]]);
    expect(read("account 501004567891")).toEqual([["account", "501004567891", "id", null]]);
    expect(read("car number MH 12 AB 1234")).toEqual([["car number", "MH 12 AB 1234", "alnum", null]]);
    expect(read("car MH12AB1234")).toEqual([["car", "MH12AB1234", "alnum", null]]);
    expect(read("flat 4B")).toEqual([["flat", "4B", "alnum", null]]);
  });

  it("reads several at once, labels before or after", () => {
    expect(read("waist 34 hips 39 thigh 22")).toEqual([
      ["waist", "34", "number", 34],
      ["hips", "39", "number", 39],
      ["thigh", "22", "number", 22],
    ]);
    expect(read("34 waist, 39 hips")).toEqual([
      ["waist", "34", "number", 34],
      ["hips", "39", "number", 39],
    ]);
  });

  it("says when a number belongs to yesterday", () => {
    expect(readNumbers("weight 71 yesterday")).toMatchObject({ daysBack: 1, pieces: [{ label: "weight" }] });
    expect(readNumbers("weight 71 today")).toMatchObject({ daysBack: 0, pieces: [{ label: "weight" }] });
  });

  it("reads a value alone, and nothing that has a word with it", () => {
    expect(readValue("71.8")?.num).toBe(71.8);
    expect(readValue("5'7\"")?.num).toBe(67);
    expect(readValue("weight 71")).toBeNull();
    expect(readValue("hello")).toBeNull();
  });
});

describe("labels", () => {
  it("tidies a label as written", () => {
    expect(tidyLabel("my weight is")).toBe("weight");
    expect(tidyLabel("Amma's ring size:")).toBe("Amma's ring size");
  });

  it("matches labels by their words, in any order, with plurals and a slip", () => {
    const kept = [
      { id: "w", words: wordsOf("weight") },
      { id: "ra", words: wordsOf("ring Amma") },
      { id: "rp", words: wordsOf("Papa ring size") },
      { id: "h", words: wordsOf("hips") },
    ];
    const ids = (q: string) => directMatch(wordsOf(q), kept).map((l) => l.id);
    expect(ids("weight")).toEqual(["w"]);
    expect(ids("what's my weight")).toEqual(["w"]);
    expect(ids("wieght")).toEqual(["w"]);
    expect(ids("Amma ring")).toEqual(["ra"]);
    expect(ids("what's Amma's ring size now")).toEqual(["ra"]);
    expect(ids("ring")).toEqual(["ra", "rp"]);
    expect(ids("hip")).toEqual(["h"]);
    expect(ids("mother's ring")).toEqual([]);
    expect(ids("height")).toEqual([]);
  });
});

describe("what the sorting model hears about a value", () => {
  it("describes its shape in words, with no digit", () => {
    const shape = (t: string) => shapeWords(readNumbers(t)!.pieces[0].value);
    expect(shape("aadhaar 2341 2341 2346")).toBe("a twelve digit number");
    expect(shape("ring 14")).toBe("a two digit number");
    expect(shape("weight 72.4 kg")).toBe("a decimal number in kilograms");
    expect(shape("car MH12AB1234")).toBe("letters and digits");
    expect(shape("birthday 12/03/1990")).toBe("a date");
    expect(shape("height 5'6\"")).toBe("a height in feet and inches");
    expect(shape("rent ₹25,000")).toBe("an amount of money in rupees");
    for (const t of ["aadhaar 2341 2341 2346", "ring 14", "weight 72.4 kg", "bp 120/80", "steps 10k"]) expect(shape(t)).not.toMatch(/\d/);
  });
});

describe("numbers people may not want in a chat", () => {
  const secret = (t: string) => {
    const p = readNumbers(t)!.pieces[0];
    return secretOf(wordsOf(p.label), p.value);
  };
  it("spots an Aadhaar number by its check digit", () => {
    expect(secret("aadhaar 2341 2341 2346")).toBe("aadhaar");
    expect(secret("my number 2341 2341 2346")).toBeNull();
    expect(secret("id 2341 2341 2345")).toBeNull();
  });
  it("spots a card number by its check digit", () => {
    expect(secret("card 4111 1111 1111 1111")).toBe("card");
    expect(secret("card 4111 1111 1111 1112")).toBeNull();
  });
  it("spots a PIN by its word, and leaves a postal PIN code alone", () => {
    expect(secret("atm pin 4821")).toBe("pin");
    expect(secret("upi pin 482190")).toBe("pin");
    expect(secret("pin code 560001")).toBeNull();
    expect(secret("pincode 560001")).toBeNull();
    expect(secret("weight 72")).toBeNull();
  });
});
