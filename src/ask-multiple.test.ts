import { describe, expect, it } from "vitest";
import { definePlugin, type AnswerEvent } from "./sdk";
import { createTestKit } from "./testing";

const seen: AnswerEvent[] = [];
const plugin = definePlugin({
  id: "ticks",
  version: "1.0.0",
  sdk: "1",
  name: "Ticks",
  icon: "✅",
  tagline: "A tick list.",
  description: "A tick list.",
  groupName: "Ticks",
  price: 0,
  welcome: "Hello.",
  help: "Help.",
  async onMessage(_e, kit) {
    kit.ask("What did you do?", ["A", "B", "C"], { multiple: true, ref: "day" });
  },
  async onAnswer(event) {
    seen.push(event);
  },
});

describe("kit.ask with multiple", () => {
  it("hands over what is ticked now, and what changed", async () => {
    const t = createTestKit();
    await t.message(plugin, "go");
    expect(t.asked[0]).toMatchObject({ multiple: true, keep: true, open: true });
    await t.answer(plugin, "day", [0, 2]);
    await t.answer(plugin, "day", [2]);
    await t.answer(plugin, "day", []);
    expect(seen.map((e) => [e.choice, e.choices, e.added, e.removed, e.changed ?? false])).toEqual([
      [0, [0, 2], [0, 2], [], false],
      [2, [2], [], [0], true],
      [-1, [], [], [2], true],
    ]);
    expect(t.asked[0].open).toBe(true);
    expect(t.sent).toEqual([]);
  });

  it("takes 2 to 12 options, and an array as its answer", async () => {
    const t = createTestKit();
    expect(() => t.kit.ask("Q", Array.from({ length: 13 }, (_, i) => `o${i}`), { multiple: true })).toThrow(/at most 12/);
    await t.message(plugin, "go");
    await expect(t.answer(plugin, "day", 0)).rejects.toThrow(/array/);
  });
});
