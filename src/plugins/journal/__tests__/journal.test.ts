import { describe, expect, it } from "vitest";
import journal, { bestOf, streakOf } from "..";
import { definePlugin, type PluginDef } from "../../../sdk";
import { createTestKit } from "../../../testing";
import { copy } from "../copy";

const T = (o = {}) => createTestKit({ today: "2026-11-20", hour: 21, ...o });
const shift = (day: string, n: number) => {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
};

describe("journal", () => {
  it("is a vault: it can't hear messages, and the SDK refuses one that tries", async () => {
    expect(journal.permissions).toContain("vault");
    expect(journal.onMessage).toBeUndefined();
    expect(journal.understand).toBeUndefined();
    const t = T();
    await expect(t.message(journal, "dear diary")).rejects.toThrow(/entries, not messages/);
    const bad = (extra: Partial<PluginDef>) => () => definePlugin({ ...journal, ...extra });
    expect(bad({ onMessage: async () => {} })).toThrow(/onMessage/);
    expect(bad({ permissions: ["vault", "links"] })).toThrow(/links/);
    expect(bad({ permissions: ["vault", "members"] })).toThrow(/members/);
    expect(bad({ permissions: [] })).toThrow(/onEntry needs/);
  });

  it("never promises what it can't keep", () => {
    for (const text of [journal.welcome, journal.help, journal.description, journal.tagline, journal.listing!.description]) {
      expect(text.toLowerCase()).not.toContain("end to end");
      expect(text.toLowerCase()).not.toContain("end-to-end");
    }
  });

  it("says one line after the first entry, then stays quiet", async () => {
    const t = T();
    await t.entry(journal, { id: "a" });
    expect(t.sent.map((s) => s.text)).toEqual([copy.firstEntry()]);
    await t.entry(journal, { id: "b", kind: "image" });
    await t.entry(journal, { id: "c", change: "edited" });
    expect(t.sent).toHaveLength(1);
    expect(t.dump()["days/2026-11-20"]).toBe(2);
  });

  it("says nothing about an entry written on the page, but counts it", async () => {
    const t = T();
    await t.entry(journal, { id: "w", source: "web" });
    expect(t.sent).toHaveLength(0);
    expect(t.dump()["days/2026-11-20"]).toBe(1);
  });

  it("uncounts a removed entry, on the day it belonged to", async () => {
    const t = T();
    const at = Date.parse("2026-11-18T10:00:00Z");
    await t.entry(journal, { id: "a", at });
    await t.entry(journal, { id: "b", at });
    await t.entry(journal, { id: "a", at, change: "removed" });
    expect(t.dump()["days/2026-11-18"]).toBe(1);
    await t.entry(journal, { id: "b", at, change: "removed" });
    expect(t.dump()["days/2026-11-18"]).toBeUndefined();
  });

  it("announces a streak of 7 once, on the entry that completes it", async () => {
    const t = T({ today: "2026-11-14" });
    for (let i = 0; i < 6; i++) {
      t.setToday(shift("2026-11-14", i));
      await t.entry(journal, { id: `d${i}`, at: Date.parse(`${shift("2026-11-14", i)}T15:00:00Z`) });
    }
    t.setToday("2026-11-20");
    const at = Date.parse("2026-11-20T15:00:00Z");
    await t.entry(journal, { id: "seventh", at });
    expect(t.sent.at(-1)?.text).toBe(copy.streak({ days: 7 }));
    const said = t.sent.length;
    await t.entry(journal, { id: "again", at });
    expect(t.sent).toHaveLength(said);
  });

  it("asks how today was only when turned on and nothing was written", async () => {
    const off = T();
    await off.schedule(journal, "prompt");
    expect(off.sent).toHaveLength(1); // the test kit runs a schedule whatever its setting; Zelfred doesn't
    const t = T({ settings: { promptHour: 21 } });
    await t.schedule(journal, "prompt");
    expect(t.sent.map((s) => s.text)).toEqual([copy.prompt()]);
    await t.entry(journal, { id: "a", source: "web" });
    await t.schedule(journal, "prompt");
    expect(t.sent).toHaveLength(1);
  });

  it("the page gets counts and streaks, and can set the prompt", async () => {
    const t = T();
    for (const d of ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-19", "2026-11-20"]) await t.entry(journal, { id: d, at: Date.parse(`${d}T12:00:00Z`), source: "web" });
    expect(await t.load(journal)).toEqual({
      today: "2026-11-20",
      days: { "2026-11-10": 1, "2026-11-11": 1, "2026-11-12": 1, "2026-11-19": 1, "2026-11-20": 1 },
      total: 5,
      streak: 2,
      best: 3,
      promptHour: null,
    });
    await t.act(journal, "setPromptHour", { hour: 21 });
    expect(((await t.load(journal)) as { promptHour: number }).promptHour).toBe(21);
    await t.act(journal, "setPromptHour", { hour: null });
    expect(((await t.load(journal)) as { promptHour: number | null }).promptHour).toBeNull();
    await expect(t.act(journal, "setPromptHour", { hour: 30 })).rejects.toThrow(/between 0 and 23/);
  });

  it("streaks count back from today, or from yesterday before today's entry", () => {
    const days = new Set(["2026-11-17", "2026-11-18", "2026-11-19"]);
    expect(streakOf(days, "2026-11-20", shift)).toBe(3);
    expect(streakOf(days, "2026-11-19", shift)).toBe(3);
    expect(streakOf(days, "2026-11-21", shift)).toBe(0);
    expect(bestOf(["2026-11-01", "2026-11-17", "2026-11-18", "2026-11-19"], shift)).toBe(3);
  });
});
