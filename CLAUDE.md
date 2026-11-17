# whatodo-plugins

Plugins for whatodo. Read `docs/building-a-plugin.md`, `docs/sdk-reference.md` and `docs/releasing.md` before changing anything. One plugin per PR; SDK changes go in their own PR.

## A plugin's web page

A plugin's page on app.whatodo.today is built in the `whatodo` repo, not here. Before designing one, read `docs/plugin-ui-styleguide.md` in that repo and follow it: phone and desktop are different layouts, the page sits in `PluginShell`, Settings and Info have fixed places, and detail opens in a sheet. If something isn't covered, ask the owner and add it to that styleguide.

What this repo decides for the page is its data: `web.load` and `web.actions`. Every setting the page can change should also have a WhatsApp message that does the same.
