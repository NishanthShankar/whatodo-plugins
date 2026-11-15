import { describe, expect, it } from "vitest";
import __CAMEL__ from "..";
import { createTestKit } from "../../../testing";

describe("__ID__", () => {
  it("stores an example and reacts", async () => {
    const t = createTestKit();
    await t.message(__CAMEL__, "example");
    expect(t.reactions).toEqual(["👍"]);
    expect(t.dump()["examples/2026-11-15"]).toBeTruthy();
  });

  it("answers help and unknown messages in words", async () => {
    const t = createTestKit();
    await t.message(__CAMEL__, "help");
    expect(t.sent[0].text).toBe(__CAMEL__.help);
    await t.message(__CAMEL__, "something else");
    expect(t.sent[1].text).toContain("help");
  });
});
