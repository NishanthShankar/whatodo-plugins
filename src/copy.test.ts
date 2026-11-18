import { afterEach, describe, expect, it } from "vitest";
import { fixed, msg, useRandom } from "./copy";

afterEach(() => useRandom());

describe("a message", () => {
  it("with one wording always comes back as written, and asks for no random number", () => {
    useRandom(() => {
      throw new Error("no pick needed");
    });
    const saved = msg(["Saved."]);
    expect(saved()).toBe("Saved.");
    expect(saved()).toBe("Saved.");
    expect(saved.wordings).toBe(1);
  });

  it("hands its data to a function wording", () => {
    const hello = msg<{ name: string; n: number }>([({ name, n }) => `Hi ${name}, ${n} left.`]);
    expect(hello({ name: "Asha", n: 3 })).toBe("Hi Asha, 3 left.");
  });

  it("with several wordings only ever returns one of them", () => {
    const list = ["one", "two", "three"] as const;
    const m = msg([...list]);
    expect(m.wordings).toBe(3);
    for (let i = 0; i < 200; i++) expect(list).toContain(m());
  });

  it("lets a test force each wording in turn, strings and functions alike", () => {
    const m = msg<{ name: string }>(["Done.", ({ name }) => `Done, ${name}.`, ({ name }) => `${name}: done.`]);
    const got = [];
    for (let i = 0; i < m.wordings; i++) {
      useRandom(() => i / m.wordings);
      got.push(m({ name: "Asha" }));
    }
    expect(got).toEqual(["Done.", "Done, Asha.", "Asha: done."]);
  });

  it("stays inside the list whatever the random source returns", () => {
    const m = msg(["a", "b"]);
    useRandom(() => 1);
    expect(m()).toBe("b");
    useRandom(() => -0.5);
    expect(m()).toBe("a");
    useRandom(() => 0.999999);
    expect(m()).toBe("b");
  });

  it("goes back to real randomness when the test hook is cleared", () => {
    const m = msg(["a", "b"]);
    useRandom(() => 0);
    expect(m()).toBe("a");
    useRandom();
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(m());
    expect(seen).toEqual(new Set(["a", "b"]));
  });
});

describe("fixed text", () => {
  it("is the string itself", () => {
    const more = fixed("View more apps");
    expect(more).toBe("View more apps");
    // @ts-expect-error a list is not allowed: fixed text has one wording
    fixed(["a", "b"]);
  });
});
