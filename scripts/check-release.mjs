#!/usr/bin/env node
// Release rules, checked against the base branch (CI passes it, default origin/main):
//   1. A plugin whose files changed must have a higher version than on the base branch,
//      and a CHANGELOG entry for it. A brand-new plugin starts at 1.0.0 (or 0.x for a preview).
//      Raising a plugin's `tier` needs a MAJOR bump.
//   2. A released plugin id can't disappear (removing a plugin breaks everyone who installed it).
//   3. If the SDK or the test kit changed, package.json's version goes up and CHANGELOG.md
//      (the SDK changelog) gets an entry for it. A major bump of the SDK needs SDK_VERSION to match.
// Usage: node scripts/check-release.mjs [baseRef]
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const base = process.argv[2] ?? "origin/main";
const sh = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();
const show = (path) => {
  try {
    return execSync(`git show ${base}:${path}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
};
const cmp = (a, b) => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
};
const versionIn = (src) => src?.match(/version:\s*"(\d+\.\d+\.\d+)"/)?.[1] ?? null;
const tierIn = (src) => Number(src?.match(/\btier:\s*([123])\b/)?.[1] ?? 0) || null;
const topEntry = (md) => md?.match(/^## \[(\d+\.\d+\.\d+)\]/m)?.[1] ?? null;

const changed = sh(`git diff --name-only ${base}...HEAD`).split("\n").filter(Boolean);
const errors = [];

// 1 + 2: plugins
const pluginIds = new Set(changed.filter((f) => f.startsWith("src/plugins/")).map((f) => f.split("/")[2]));
const baseIds = (() => {
  try {
    return sh(`git ls-tree --name-only ${base} src/plugins/`).split("\n").filter(Boolean).map((p) => p.split("/").pop());
  } catch {
    return [];
  }
})();
for (const id of baseIds) {
  if (!existsSync(`src/plugins/${id}`)) errors.push(`Plugin "${id}" was released and can't be removed. Deprecate it instead (see docs/releasing.md).`);
}
for (const id of pluginIds) {
  const path = `src/plugins/${id}/index.ts`;
  if (!existsSync(path)) continue;
  const now = versionIn(readFileSync(path, "utf8"));
  const baseSrc = show(path);
  const before = versionIn(baseSrc);
  const existedUnversioned = baseSrc !== null && before === null; // released before versions were required
  const log = existsSync(`src/plugins/${id}/CHANGELOG.md`) ? readFileSync(`src/plugins/${id}/CHANGELOG.md`, "utf8") : "";
  if (!now) {
    errors.push(`${id}: no version in index.ts`);
    continue;
  }
  if (before && cmp(now, before) <= 0) errors.push(`${id}: files changed but version is still ${now} (base has ${before}). Bump it (see docs/releasing.md).`);
  if (!before && !existedUnversioned && !/^(1\.0\.0|0\.\d+\.\d+)$/.test(now)) errors.push(`${id}: a new plugin starts at 1.0.0 (or 0.x.y for a preview), not ${now}.`);
  if (topEntry(log) !== now) errors.push(`${id}: CHANGELOG.md has no entry for ${now} at the top.`);
  // Raising the platform cost tier changes what people may pay: it's a MAJOR release.
  const tierNow = tierIn(readFileSync(path, "utf8"));
  const tierBefore = tierIn(baseSrc);
  if (before && tierBefore && tierNow && tierNow > tierBefore && Number(now.split(".")[0]) <= Number(before.split(".")[0])) {
    errors.push(`${id}: tier went from ${tierBefore} to ${tierNow}; raising the tier needs a MAJOR version bump (see docs/releasing.md).`);
  }
}

// 3: SDK
const sdkFiles = ["src/sdk.ts", "src/testing.ts", "src/index.ts"];
if (changed.some((f) => sdkFiles.includes(f) && f !== "src/index.ts")) {
  const now = JSON.parse(readFileSync("package.json", "utf8")).version;
  const before = JSON.parse(show("package.json") ?? '{"version":"0.0.0"}').version;
  if (cmp(now, before) <= 0) errors.push(`SDK changed but package.json version is still ${now}. Bump it (see docs/releasing.md).`);
  if (topEntry(readFileSync("CHANGELOG.md", "utf8")) !== now) errors.push(`CHANGELOG.md (SDK) has no entry for ${now} at the top.`);
  const sdkConst = readFileSync("src/sdk.ts", "utf8").match(/SDK_VERSION = "(\d+\.\d+\.\d+)"/)?.[1];
  if (sdkConst !== now) errors.push(`SDK_VERSION in src/sdk.ts (${sdkConst}) must equal package.json version (${now}).`);
}

if (errors.length) {
  console.error("Release check failed:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}
console.log(`Release check passed (${pluginIds.size} plugin(s) changed against ${base}).`);
