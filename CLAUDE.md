# whatodo-plugins

Plugins for telcurio. Read `docs/building-a-plugin.md`, `docs/sdk-reference.md` and `docs/releasing.md` before changing anything. One plugin per PR; SDK changes go in their own PR.

## A plugin's web page

A plugin's page on app.whatodo.today is built in the `whatodo` repo (telcurio), not here. Before designing one, read `docs/plugin-ui-styleguide.md` in that repo and follow it: phone and desktop are different layouts, the page sits in `PluginShell`, Settings and Info have fixed places, and detail opens in a sheet. If something isn't covered, ask the owner and add it to that styleguide.

What this repo decides for the page is its data: `web.load` and `web.actions`. Every setting the page can change should also have a WhatsApp message that does the same.

## Voice

Read `docs/voice.md` in the `whatodo` repo (telcurio) before writing any text a person reads. In short: one voice. Everything a plugin sends in WhatsApp says "I" and is telcurio speaking, not the plugin. No thanks, please, sorry or feelings. A plugin's `tagline` and `description` show in the store and on the site, so they have no "I" and no "we". Tell people to say it in their own words before showing a ready-made message.

## Questions

Whenever a plugin needs a structured answer, a yes or no included, it asks with `kit.ask` (see "Asking a question" in `docs/sdk-reference.md`). Never write your own "reply A, B or C".

Before adding a question to a plugin, new or existing, ask the owner how it should behave, and don't assume: what the confirm line says once it is answered, what happens when several people are in the group, when the question is closed, and whether the options could run past three polls (36). The default is that a one-person question is deleted once answered.

