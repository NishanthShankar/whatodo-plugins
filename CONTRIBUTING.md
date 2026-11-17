# Contributing

Thanks for building on telcurio. Plugins reach people's WhatsApp, so every change goes through the same strict path.

## Before you start

- Read [docs/building-a-plugin.md](docs/building-a-plugin.md) for a new plugin, or [docs/releasing.md](docs/releasing.md) to change one.
- For a new plugin or a MAJOR change, open an issue first describing the conversation (commands, what the plugin posts, what it stores). It saves a rewrite.
- One plugin per pull request. SDK changes go in their own PR.

## Workflow

```sh
git switch -c <plugin-id>/<short-change>
pnpm install
pnpm new <id> "<Name>" "<emoji>"     # new plugins only
# … build, test, document …
pnpm check                           # typecheck + tests + conformance
pnpm release:check                   # release rules against origin/main
```

Open the PR with the template filled in honestly. CI must be green. A maintainer reviews against [docs/review-checklist.md](docs/review-checklist.md); expect questions about data compatibility and wording.

## Commit messages

Conventional commits, scoped to the plugin: `feat(habits): skip a day without breaking the streak`, `fix(habits): don't ask twice after midnight`, `docs(sdk): explain refs`. The plugin's CHANGELOG is the user-facing record; commits are for maintainers.

## Code style

- TypeScript, strict. No `any` in plugin code.
- Small pure helpers in your plugin folder; one `onMessage` parser at the top of the handler.
- Messages: short, plain, human. No emdashes. Acknowledge with reactions, answer with messages.

## Licensing

By contributing you agree your contribution is licensed under the repo's MIT license. Terms for paid plugins will be separate and published before they exist ([docs/earning.md](docs/earning.md)).
