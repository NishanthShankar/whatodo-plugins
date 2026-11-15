/**
 * Rules every plugin must meet before it can merge. CI runs this on every pull request.
 * Each rule is explained in docs/review-checklist.md; fix the plugin, never this file.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { plugins } from ".";
import { compareVersions } from "./sdk";

const ROOT = resolve(__dirname, "plugins");
const folders = readdirSync(ROOT).filter((f) => statSync(join(ROOT, f)).isDirectory());

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

/** Things a plugin's code must never use: they break determinism or the sandbox. */
const FORBIDDEN: [RegExp, string][] = [
  [/\bfetch\s*\(/, "network access (fetch)"],
  [/\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b/, "network access"],
  [/\bDate\.now\s*\(/, "Date.now() (use kit.now)"],
  [/\bnew\s+Date\s*\(\s*\)/, "new Date() without an argument (use kit.now)"],
  [/\bMath\.random\s*\(/, "Math.random() (use kit.id())"],
  [/\bcrypto\s*\./, "crypto (use kit.id())"],
  [/\bset(?:Timeout|Interval|Immediate)\s*\(/, "timers (use schedules)"],
  [/\bprocess\s*\./, "process"],
  [/\brequire\s*\(/, "require()"],
  [/\bimport\s*\(/, "dynamic import()"],
  [/\beval\s*\(|\bnew\s+Function\s*\(/, "eval / new Function"],
  [/\bglobalThis\b|\bwindow\b|\bdocument\b|\blocalStorage\b/, "globals"],
];

function codeOnly(src: string) {
  // Drop comments and string contents so prose can mention the words above.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

describe("plugin registry", () => {
  it("registers every plugin folder, and nothing else", () => {
    expect(plugins.map((p) => p.id).sort()).toEqual([...folders].sort());
  });
  it("has unique ids", () => {
    expect(new Set(plugins.map((p) => p.id)).size).toBe(plugins.length);
  });
});

for (const plugin of plugins) {
  const dir = join(ROOT, plugin.id);

  describe(`plugin ${plugin.id}`, () => {
    it("lives in a folder named after its id", () => {
      expect(existsSync(dir)).toBe(true);
    });

    it("has a well-formed definition", () => {
      expect(plugin.name.length).toBeGreaterThan(0);
      expect(plugin.name.length).toBeLessThanOrEqual(30);
      expect(plugin.tagline.length).toBeGreaterThan(0);
      expect(plugin.tagline.length).toBeLessThanOrEqual(80);
      expect(plugin.description.length).toBeGreaterThanOrEqual(40);
      expect(plugin.groupName.length).toBeGreaterThan(0);
      expect(plugin.groupName.length).toBeLessThanOrEqual(25);
      expect([...plugin.icon].length).toBeLessThanOrEqual(2);
      expect(plugin.welcome.trim().length).toBeGreaterThan(0);
      expect(plugin.help.trim().length).toBeGreaterThan(0);
      expect(plugin.welcome.length).toBeLessThanOrEqual(4000);
      expect(plugin.help.length).toBeLessThanOrEqual(4000);
    });

    it("is free (paid plugins are not enabled yet)", () => {
      expect(plugin.price).toBe(0);
    });

    it("declares its platform cost tier", () => {
      expect([1, 2, 3], "set tier: 1, 2 or 3 (see docs/sdk-reference.md)").toContain(plugin.tier);
    });

    it("has unique, valid schedules", () => {
      const ids = (plugin.schedules ?? []).map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const s of plugin.schedules ?? []) {
        if (typeof s.hour === "number") expect(Number.isInteger(s.hour) && s.hour >= 0 && s.hour <= 23).toBe(true);
        if (typeof s.hour === "object") expect(plugin.settings && s.hour.setting in plugin.settings).toBe(true);
      }
      if (plugin.schedules?.length) expect(plugin.onSchedule).toBeTypeOf("function");
    });

    it("has a README with the required sections", () => {
      const readme = join(dir, "README.md");
      expect(existsSync(readme), "README.md is missing").toBe(true);
      const text = readFileSync(readme, "utf8");
      for (const section of ["## Commands", "## Data", "## Privacy"]) {
        expect(text, `README.md needs a "${section}" section`).toContain(section);
      }
      if (plugin.schedules?.length) expect(text).toContain("## Schedules");
      if (plugin.settings && Object.keys(plugin.settings).length) expect(text).toContain("## Settings");
      if (plugin.web) expect(text).toContain("## Web page");
    });

    it("has a CHANGELOG whose newest entry is this version", () => {
      const path = join(dir, "CHANGELOG.md");
      expect(existsSync(path), "CHANGELOG.md is missing").toBe(true);
      const text = readFileSync(path, "utf8");
      const entries = [...text.matchAll(/^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/gm)];
      expect(entries.length, "CHANGELOG.md has no '## [x.y.z] - YYYY-MM-DD' entries").toBeGreaterThan(0);
      expect(entries[0][1], "newest CHANGELOG entry must match the plugin's version").toBe(plugin.version);
      for (let i = 1; i < entries.length; i++) {
        expect(compareVersions(entries[i - 1][1], entries[i][1]), "CHANGELOG versions must go down").toBeGreaterThan(0);
        expect(entries[i - 1][2] >= entries[i][2], "CHANGELOG dates must not go up").toBe(true);
      }
      // Every entry says something.
      const bodies = text.split(/^## \[/m).slice(1);
      for (const b of bodies) expect(b.split("\n").slice(1).join("\n").trim().length).toBeGreaterThan(0);
    });

    it("has tests", () => {
      const tests = files(dir).filter((f) => /\.test\.ts$/.test(f));
      expect(tests.length, "add tests under __tests__/").toBeGreaterThan(0);
    });

    it("only imports the SDK and its own files", () => {
      for (const file of files(dir).filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f))) {
        const src = readFileSync(file, "utf8");
        for (const m of src.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+["']([^"']+)["']/gm)) {
          const spec = m[1];
          const fromDir = resolve(file, "..");
          const ok =
            spec === "whatodo-plugins/sdk" ||
            (spec.startsWith(".") &&
              (resolve(fromDir, spec).startsWith(dir) || resolve(fromDir, spec) === resolve(ROOT, "..", "sdk")));
          expect(ok, `${relative(ROOT, file)} imports "${spec}"`).toBe(true);
        }
      }
    });

    it("uses no forbidden APIs", () => {
      for (const file of files(dir).filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f))) {
        const code = codeOnly(readFileSync(file, "utf8"));
        for (const [re, what] of FORBIDDEN) {
          expect(re.test(code), `${relative(ROOT, file)} uses ${what}`).toBe(false);
        }
      }
    });
  });
}
