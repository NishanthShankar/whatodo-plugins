# whatodo-plugins

Plugins for Zelfred. Read `docs/building-a-plugin.md`, `docs/sdk-reference.md` and `docs/releasing.md` before changing anything. One plugin per PR; SDK changes go in their own PR.

## The pipeline: read this before building or changing a plugin

Every plugin goes through one pipeline, in order, from idea to published, and none may be left half way (the owner, 2026-11-24). The guide is `docs/plugin-pipeline.md` in the `whatodo` repo (Zelfred); the stages are `STAGES` and `PRIVATE_STAGES` in its `convex/lib/pipeline.ts`. Read the guide first. In short:

1. **Before any work**, find where the plugin stands. In the `whatodo` checkout: `npx convex run --prod pipeline:status '{"appId":"<plugin id>"}'`. If you can't run that, ask the owner which stage it is at. Do not guess.
2. **A new plugin is entered the day its brief is written**, before any code: `npx convex run --prod pipeline:add '{"name":"<Name>","appId":"<plugin id>"}'`. Add `"track":"private"` only if the owner said it is a private app (ours alone, never listed). Private is not the same as `unlisted`. If it is not clear which it is, ask.
3. **Work on its current stage only.** A new plugin ships `unlisted: true`. Never remove `unlisted`, set a price, or build its landing page ahead of its turn.
4. **When a stage's gate is true**, record it: `npx convex run --prod pipeline:record '{"appId":"<plugin id>","stage":"build"}'`. Only "build" and "landing" can be recorded this way. Every other stage is the owner's to mark, on admin.whatodo.today under "Race": ask, never mark it for them.
5. **End your reply, and the PR description, with the stage the plugin is at and what the next gate needs.**

A plugin that exists but was never entered shows up in the owners' twice weekly reminder by name. Enter it first.

## The first five minutes

A plugin is not built until a new person can get from adding it to their first useful moment without being confused once (the owner, 2026-11-24). Read `docs/plugin-onboarding.md` in the `whatodo` repo (Zelfred) before designing the conversation: one thing to send first, a welcome that asks for nothing, the first time said in words and then the mark, the moment it clicks inside the first day. Write its fields in the plugin's README under **First five minutes**. It is part of the Build gate.

## A plugin's web page

A plugin's page on app.whatodo.today is built in the `whatodo` repo (Zelfred), not here. Before designing one, read `docs/plugin-ui-styleguide.md` in that repo and follow it: phone and desktop are different layouts, the page sits in `PluginShell`, Settings and Info have fixed places, and detail opens in a sheet. If something isn't covered, ask the owner and add it to that styleguide.

What this repo decides for the page is its data: `web.load` and `web.actions`. Every setting the page can change should also have a WhatsApp message that does the same.

## Voice

Read `docs/voice.md` in the `whatodo` repo (Zelfred) before writing any text a person reads. In short: one voice. Everything a plugin sends in WhatsApp says "I" and is Zelfred speaking, not the plugin. No thanks, please, sorry or feelings. A plugin's `tagline` and `description` show in the store and on the site, so they have no "I" and no "we". Tell people to say it in their own words before showing a ready-made message.

## Questions

Whenever a plugin needs a structured answer, a yes or no included, it asks with `kit.ask` (see "Asking a question" in `docs/sdk-reference.md`). Never write your own "reply A, B or C".

Before adding a question to a plugin, new or existing, ask the owner how it should behave, and don't assume: what the confirm line says once it is answered, what happens when several people are in the group, when the question is closed, and whether the options could run past three polls (36). The default is that a one-person question is deleted once answered.

