# 🎁 Wishlist

Send a link to something you want, or type it with its price, and it is kept on a list with its name, picture and price. The list adds up what is left to buy. Lives in its own WhatsApp group, "🎁 Wishlist". Unlisted while it is being tried out.

## Commands

Send these in the Wishlist group, or in any group that holds a list.

| Message | What happens |
|---|---|
| a link | Added with the page's title, picture and price, then 👍. The very first time, one message says how to tick things off and see the total. |
| a link with words | The words are its note. A price in them (`21999`, `rs 21,999`, `$20`) wins over the page's price, and `#labels` are kept as labels. When the page couldn't be read, the words are its name. |
| a link already on that list | One copy stays; new words, labels or a typed price replace the old. 👍 |
| `running shoes 4000` | Something without a link, with its price. 👍 |
| `add umbrella` (also `want`, `buy`, `need`) | Something without a price. 👍 |
| `list` (also `show`, `left`, `total`) | What is left to buy on the list in use here, newest first, with what it adds up to. Up to 10. |
| `bought` | What was already bought. |
| `lists` | Every list: how much is left on each, where it lives, whether it is shared. |
| `diwali` (a list's name alone), `list diwali` | That list. |
| `new list diwali` | Starts a list in this chat. It becomes the list in use here. |
| `new group diwali` | Starts a list with a WhatsApp group of its own. |
| `use diwali` | Makes that list the one bare links go to in this chat. |
| `rename diwali to festival` | Renames a list (and the group made for it). |
| `delete list diwali` | Asks first, with a poll. Yes deletes the list, everything on it, its share link, and closes a group made for it. |
| `share`, `share diwali` | Makes the list's page and sends one message with its link, written to be forwarded. The first time, a second message says what the page shows. |
| `stop sharing` | Closes the link for good. `share` afterwards makes a new one. |
| `undo` | Removes the last thing added in this chat's lists. |
| `currency usd` | The currency typed prices are in. |
| `help` | The command list. |

On something you added (or on a single result the plugin posted):

| You | What happens |
|---|---|
| react ✅ (also ☑️ ✔️ 🛒 🛍️) | Bought. |
| react with anything else (❤️ ⭐ 🔥) | Kept as the thing's mark: shown before its name, and the page can group by it. Only the reaction of the person who added Wishlist counts. |
| change or remove your reaction | Takes back a "bought" the reaction set. Removing a mark's reaction clears the mark; a ✅ put over a mark leaves the mark in place. |
| reply `bought` / `not bought` | Does that. 👍 |
| reply with a price (`2499`, `rs 2,499`) | Sets its price. 👍 |
| reply `#gift` | Adds the label. `no labels` clears them. 👍 |
| reply `call it Blue kettle` | Names it. 👍 |
| reply `move to diwali` | Moves it. 👍 |
| reply `move` | A poll of the other lists (11 at most), last option "Leave it here". Only the person who asked decides. |
| reply `read again` (also `refresh`, `check price`) | Its link is read once more: the name, picture and price it gives now replace the old ones. A price you typed stays. 👍 |
| reply `delete` | Removed. 👍 |
| reply with other words | Kept as its note. 👍 |

Which list a thing goes to:

- A list's name first (`diwali <link>`), or `in diwali` / `for diwali` after the words, names the list. For something typed without a link the leading name needs a colon (`gifts: scarf 800`), because "gifts for mom 2000" may be the thing itself.
- With no name, it goes to the list used last in that chat. A chat starts with its first list.
- When a bare link lands on a list that isn't the chat's first one, a short line says which ("In *diwali*.").

Prices: a number with a currency next to it always counts (`rs 500`, `$20`, `500 rupees`, `85k`, `1.2 lakh`). A bare number counts when it ends the message and is 50 or more, so "iphone 15" has no price. A price can always be set by replying to the thing. Totals are per currency ("₹24,990 + $20"); nothing is converted.

Anything else goes to Zelfred's intent model. Intents: `add_item`, `show_list`, `bought`, `lists`, `new_list`, `share`, `undo`, `help`. No targets.

Limits: 2000 things, 500 on one list, 50 lists, 5 labels a thing, 500 characters of note.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `currency` | `null` | The currency typed prices are in, three letters. `null`: guessed from the person's time zone. `currency usd` on WhatsApp, or on the page. |

## Data

| Collection | Key | Data | Sort |
|---|---|---|---|
| `lists` | list id (`main` for the first) | `{ name, home, created, notes? }` | created (ms) |
| `items` | item id | `{ list, name, url, canonical, site, title, image, price, currency, typed?, bought, boughtAt?, reacted?, mark?, note, tags, at, by?, reading? }` | added (ms) |
| `groups` | group key | `{ name, created, made }` | created (ms) |
| `state` | `last:<group>` | the id of the list used last in that group (empty: the main one) | none |
| `state` | `intro`, `shared` | `1` once that one-time note was sent | none |

`home` is the key of the group a list lives in (`null`: the main one). `made` is true for a group Wishlist made, false for one the person handed over. `image` is the picture's address, never the picture. `currency: null` on a thing means the person's own. `by` is who added it: `{ id, name, owner }` (`id` is not a phone number). Refs: `{ kind: "item", ids }` on the person's message (through `kit.mark`) and on a single result; `{ move, by }` and `{ del, by }` on the two polls.

## Web page

`web.load` returns the person's currency, every list (with how much is left, what it adds up to and its share link if it has one), the extra groups, and every thing, newest first. Actions: `add` (a link is read a moment later through `kit.links.read` and filled in by `onLink`), `edit`, `readAgain`, `setBought`, `move`, `remove`, `createList`, `renameList`, `deleteList`, `share`, `replaceLink`, `setNotes`, `shareText`, `setCurrency`. The page can sit behind the person's PIN.

`web.shared` is what a list's shared page shows: the list's name, the things still wanted and the ones already bought, each with its picture, where it is from, its labels and its price. Notes are left out unless the person turned them on for that list.

## Privacy

- A shared page never says whose it is: no name, no number, nothing from `by`. The list's own name is the person's to choose.
- A thing's note is written for oneself, so it stays off the shared page unless turned on per list.
- Only what a link shows publicly is read: its title, picture and price. Pictures are loaded from the shop, never stored.
- Everyone in a group that holds a list can add to it, tick things off and start a list there; each thing remembers who added it. Only the person who added Wishlist can delete, rename or share a list, make a new group, or change the currency.
- Deleting a list deletes everything on it and closes its link.
