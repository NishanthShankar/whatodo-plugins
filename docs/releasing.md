# Releasing

People install plugins, keep data in them, and (soon) pay for them. A release must never break an existing install. These rules are checked by CI where a machine can check them, and by review where it can't.

## Versions

Every plugin has its own semver `version` in its definition. Every change to a plugin's folder is a release and bumps it:

| Bump | When | Examples |
|---|---|---|
| **PATCH** `1.1.0 → 1.1.1` | Fixes; nothing new for the person to learn | Parser accepts a typo it should have; wording fix; a check-in no longer sent twice |
| **MINOR** `1.1.0 → 1.2.0` | New behaviour that keeps everything old working | A new command, a new optional setting, a new web action, a new optional field in stored data |
| **MAJOR** `1.1.0 → 2.0.0` | Something an existing person relies on changes or goes away | Removing or renaming a command, changing what a command does, removing a setting, changing stored data in a way `onUpgrade` can't fully migrate, raising `tier` |

Prefer MINOR: add the new way, keep the old way working, mark it deprecated in the README and CHANGELOG, and remove it in the next MAJOR. A MAJOR needs a maintainer's explicit approval and a note in the PR on how existing installs are affected.

A new plugin starts at `1.0.0` (or `0.x.y` while it's a preview; previews can break between minors and say so in their README).

## Changelog

Each plugin has `src/plugins/<id>/CHANGELOG.md` in [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format. Every release adds an entry at the top:

```md
## [1.2.0] - 2026-12-01

### Added
- `skip read` marks a habit as skipped today without breaking the streak.

### Changed
- `habits` shows skipped days as 🟨.

### Data
- `logs` values can now be `"skip"` as well as `1`. Older rows are untouched.
```

- The version and date are required; versions go down the file, dates never go up (CI checks).
- Sections: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`, and **`Data`** whenever stored data, refs or settings change. Write for the person using the plugin, plus the Data section for whoever maintains it.
- The SDK has its own changelog at the repo root.

## Data compatibility

Stored data outlives versions. Rules:

1. **Every version must read the data every earlier released version wrote.** That includes refs attached to old messages: a person can react to a check-in from last month.
2. **Adding** an optional field is safe (MINOR). Treat a missing field as the old behaviour.
3. **Changing** a shape needs `onUpgrade`:

   ```ts
   async onUpgrade(fromVersion, kit) {
     if (compareVersions(fromVersion, "2.0.0") < 0) {
       for (const item of await kit.store.list<OldShape>("habits")) {
         if ("legacyField" in item.data) await kit.store.put("habits", item.key, toNewShape(item.data), item.sort ?? undefined);
       }
     }
   }
   ```

   `onUpgrade` runs once per install before any other handler of the new version, with the version that install last ran. It must be **idempotent** (safe to run twice) and must handle every older version, not just the previous one. Test it from each earlier version (see [testing.md](testing.md)).
4. **Never delete** a collection or a setting in a MINOR or PATCH. Stop using it instead.
5. **Never change the `id`**, `groupName` of existing installs (renaming `groupName` only affects new installs), or the meaning of a schedule `id` without handling installs that already ran it.

## Removing a plugin

A released plugin is never deleted from the repo (CI refuses): people have it installed. To retire one, release a MINOR that says so in its description and welcome text, and open an issue so whatodo can hide it from the marketplace for new installs.

## The release, step by step

1. Make the change in a branch.
2. Bump `version` in the plugin definition following the table above.
3. Add the CHANGELOG entry (with `### Data` if anything stored changed).
4. Write or update `onUpgrade` if stored data changed shape, with a test from every earlier version.
5. Update the plugin README so it matches the new behaviour exactly.
6. `pnpm check` and `pnpm release:check` locally.
7. Open a PR with the template filled in. CI runs typecheck, tests, conformance and the release rules against `main`.
8. A maintainer reviews against [review-checklist.md](review-checklist.md) and merges.
9. whatodo bumps its pinned commit of this repo, runs its own tests, and deploys. On the next event for each install, `onUpgrade` runs and the new version takes over.

## SDK releases

Changes to `src/sdk.ts` or `src/testing.ts` are SDK releases: bump `package.json` `version` and `SDK_VERSION` together, and add an entry to the root `CHANGELOG.md`. Adding to the SDK is a MINOR; changing or removing anything plugins use is a MAJOR and needs a migration plan for every plugin. CI checks the bump and the entry.
