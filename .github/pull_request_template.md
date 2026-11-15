## What changes

<!-- One or two sentences. Link the plugin README section if behaviour changes. -->

## Plugin(s) and version

- Plugin: `id` `old version` -> `new version` (patch / minor / major, and why)

## Checklist (docs/review-checklist.md)

- [ ] `pnpm check` passes locally (typecheck, tests, conformance)
- [ ] Version bumped and a CHANGELOG entry added, with a `### Data` section if stored data changed
- [ ] Stored data from the previous version still works (`onUpgrade` written and tested if it had to change)
- [ ] README updated (commands, schedules, settings, data, web page, privacy)
- [ ] Tests cover every new command, schedule, reaction and web action, and the error answers
- [ ] No breaking change in a minor or patch (removed command, changed data shape, renamed setting)
- [ ] Copy is plain and human; WhatsApp messages stay short
