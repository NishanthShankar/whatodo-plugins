/** The SDK's own rules and the test kit's, for the parts no plugin exercises yet. */
import { describe, expect, it } from "vitest";
import { definePlugin, type PluginDef, type Sender } from "./sdk";
import { createTestKit } from "./testing";

const base: PluginDef = {
  id: "probe",
  version: "1.0.0",
  sdk: "1",
  name: "Probe",
  icon: "🔎",
  tagline: "Says who wrote.",
  description: "A plugin used by the SDK's tests.",
  groupName: "🔎 Probe",
  price: 0,
  welcome: "hi",
  help: "help text",
};

function probe(permissions: PluginDef["permissions"]) {
  const seen: (Sender | undefined)[] = [];
  const plugin = definePlugin({
    ...base,
    permissions,
    understand: { intents: { one: "First thing", two: "Second thing" } },
    onMessage: async (e) => void seen.push(e.sender),
    onReaction: async (e) => void seen.push(e.sender),
    onIntent: async (e) => void seen.push(e.sender),
  });
  return { plugin, seen };
}

describe("members and sender", () => {
  it("says the owner sent it when nobody else is named", async () => {
    const { plugin, seen } = probe([]);
    const t = createTestKit({ person: { name: "Nisha", timezone: "Asia/Kolkata" } });
    await t.message(plugin, "hello");
    await t.react(plugin, "✅", { a: 1 });
    await t.intent(plugin, "hello", "one");
    expect(seen).toEqual(Array(3).fill({ id: "owner", name: "Nisha", owner: true }));
  });

  it("delivers another member's events to a plugin with the members permission", async () => {
    const { plugin, seen } = probe(["members"]);
    const t = createTestKit();
    await t.message(plugin, "hello", null, null, "Asha Rao");
    await t.react(plugin, "✅", { a: 1 }, null, "Asha Rao");
    await t.intent(plugin, "hello", "two", null, 1, { id: "u2", name: null });
    expect(seen).toEqual([
      { id: "asha-rao", name: "Asha Rao", owner: false },
      { id: "asha-rao", name: "Asha Rao", owner: false },
      { id: "u2", name: null, owner: false },
    ]);
  });

  it("keeps kit.person as the owner whoever writes", async () => {
    let person: unknown;
    const plugin = definePlugin({ ...base, permissions: ["members"], onMessage: async (_e, kit) => void (person = kit.person) });
    const t = createTestKit({ person: { name: "Nisha", timezone: "Asia/Kolkata" } });
    await t.message(plugin, "hello", null, null, "Asha");
    expect(person).toEqual({ name: "Nisha", timezone: "Asia/Kolkata" });
  });

  it("refuses another member's event without the permission", async () => {
    const { plugin, seen } = probe([]);
    const t = createTestKit();
    await expect(t.message(plugin, "hello", null, null, "Asha")).rejects.toThrow(/"members" permission/);
    await expect(t.react(plugin, "✅", { a: 1 }, null, "Asha")).rejects.toThrow(/"members" permission/);
    expect(seen).toEqual([]);
  });

  it("refuses members together with lock-members", () => {
    expect(() => definePlugin({ ...base, permissions: ["members", "lock-members"] })).toThrow(/can't be used together/);
  });
});
