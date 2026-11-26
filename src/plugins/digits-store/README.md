# 🔢 Digits

Any number a person wants kept, with a word for what it is: a weight, a ring size, a car's number, the electricity meter, a birthday. Each value is kept with its day, and the ones before are kept too, so the latest can be asked for, every one can be seen, and the page draws a graph. A photo sent with a number is kept with it.

To Digits a value is a string attached to a label. It never asks for a number and never reads meaning into a label. The owner's rulings are in `docs/measurements-brief.md` in the Zelfred repo, section "2026-11-26: becoming any number, named Digits", and in `docs/digits-research.md`, "The owner's answers".

Its id is `digits-store` (the owner, 2026-11-26). It lives in its own WhatsApp group, "🔢 Digits", between the person and Zelfred. It is unlisted while it is tried.

## First five minutes

Written to `docs/plugin-onboarding.md` in the `whatodo` repo. The lines are drafts and wait for og-copy-bot's read and the owner's pick.

| Field | For Digits |
|---|---|
| The promise | "Any number, kept with a word for what it is." |
| The aside | "Ask for it back. I won't make you scroll." |
| The first thing to send | `Amma ring size 14` (weight second, the owner, 2026-11-26) |
| The first time line | "Kept: weight, 72.4. Ask me "weight?" whenever you want it back, with the ones before it. From now on a 👍 means kept." |
| The moment it clicks | Minutes in: they ask "weight?" and get it back with its day. A date gets its reminder the morning it is due. |
| The setup steps | None beyond adding the app. |
| What to learn | Nothing up front. When one name is asked for in place of another ("Mom" for "Amma"), asked once whether they are the same, and remembered. |

What a new person meets, in order. Each is said once and never again.

1. **The welcome** asks for nothing and names one thing to send.
2. **The first number kept** is answered with the first time line. After that, a 👍.
3. **Asking for it back** gives the latest with its day, and the first when there are more.
4. **The page**, named once, the first time they come back on a later day: in the answer to their question, or in place of the 👍 when a label gets its second value ("they make a graph now").

Owed, because a plugin can't do them yet: a link that signs the person in to the page (the address is sent plain), a welcome card, and counting each step with `track`. Today the steps show only as the usual app events, which hold no values and no label text.

## Commands

Send these in the group. Your own words work too.

| Message | What happens |
|---|---|
| `weight 72.4`, `72.4 weight`, `my weight is 86 kg` | Kept under "weight". 👍. The very first keep is said in words instead. |
| `waist 34 hips 39 thigh 22` | Three kept at once. 👍 |
| `height 5'6"`, `bp 120/80`, `salary 1.5 lakh`, `rent ₹25,000`, `steps 10k`, `car MH 12 AB 1234`, `flat 4B`, `mobile +91 98765 43210` | Kept as typed. The number in it (66 inches, 150000) is kept for the graph. |
| `weight 71 yesterday` | Kept on yesterday. |
| `Riya birthday 12/03`, `passport expires 3/3/2031` | A date, said back in words ("12 March"), day first, and reminded (see Schedules). No 👍: the words are the receipt. A short date like `bangle 2/4` is a date only with a date word next to it. |
| `72.4` alone | Under the only label there is. With none or several: "What is 72.4?", and the next words (within the hour) name it. |
| a new value far from the last (`waist 340` after `waist 34`) | Kept, and both said: "The one before was 34." No verdict. |
| `weight?`, `what's my weight`, `Amma ring` | The latest, with its day; with more than one kept, the first too and how many. Every label that fits the words is answered. The photo kept with the latest is sent with it. |
| `history weight`, `weight history` | Every value, newest first, 30 at most; the rest on the page. |
| `list` (also `all`, `everything`) | Every label's latest, the last added first. |
| `undo` (also `remove`, `delete`, `wrong`) | Takes out what the last message kept. |
| `remove weight` (also `delete`, `forget`, `clear`) | Asks first, then takes out the label and everything under it. |
| a photo with a number in its caption | Kept with that value. |
| a photo with no number | With what was kept in the last 15 minutes, or with the label its caption names. Otherwise turned away. Four photos at most per value. |
| `help` | The command list. |

Replying to your own message that kept numbers:

| Reply | What happens |
|---|---|
| a number, `72` | Corrects it. 👍 |
| `remove`, `wrong`, `undo` | Takes it out. |
| ❌ (a reaction) | Takes it out, and the 👍 comes off. |
| deleting it for everyone | Its numbers and photos go too. Nothing is said. |

Replying to an answer about a label: a number adds to it, `history` shows it all, `remove` asks to take it out.

### Recall

Our own matching first: the label's words in any order, plurals, one slip in a longer word (never in the first letter, so "height" is not "weight"), part of a label ("ring" finds every ring), or a label inside a longer question. Only when that finds nothing is the sorting model asked (`kit.sort`, the "sort" permission), with up to 20 labels, the likeliest first, each with its value's shape in words ("ring Amma: a two digit number"). It never gets a value, and Zelfred takes every digit out of what goes to it as well. When it finds nothing: "Nothing kept as ...".

### Two names for one person

When the sorting model answers a question with a label that differs from it by one word on each side ("ring Mom" answered by "ring Amma"), one question follows the answer, once per pair:

| Question | Options | Closes | Confirm line |
|---|---|---|---|
| Are Mom and Amma the same person? | Yes / No | On the first answer | Off. Yes: "Noted. Mom and Amma are one and the same. I shan't ask again."; No: "Noted. Two, then. I'll keep them apart." |

After a yes, our own matching tries the other name, so the model isn't asked again.

### Removing a label

| Question | Options | Closes | Confirm line |
|---|---|---|---|
| Remove weight, all 6 kept? | Remove / Keep it | On the first answer | Off. "Weight is gone, with everything kept under it." or "No problem. Weight stays." |

### Numbers people may not want in a chat

Never refused (the owner, 2026-11-26).

- **A card number or a PIN** (also a CVV, an OTP, a password: a 3 to 6 digit value with one of those words) **is hidden**: kept whole (not encrypted), shown in WhatsApp and on the page only as "•••• 1111", or "••••" for a PIN. A card is found by its check digit, a PIN by its word; a postal PIN code is not a PIN. The answer says so and suggests deleting the message.
- **An Aadhaar number** (12 digits with a valid check digit) is kept as typed, and the answer offers a way out: delete the message for everyone and Digits forgets it too. Whether Aadhaar, PAN, passport and bank numbers should lock as well is the owner's open question.

## Schedules

| Id | When | What it sends |
|---|---|---|
| `dates` | 9am daily | For each label whose latest value is a date: a birthday or an anniversary on its day every year ("Today: *Riya birthday*, 12 March."); any other date still to come a week before and on the day. A date gone (a date of joining) is never reminded. Each is sent once; nothing when nothing is due. How early is my default, not the owner's. |

## Data

| Collection | Key | Data | Sort |
|---|---|---|---|
| `labels` | id | `{ name, words, count, current, first, touched }`: current and first are the latest and the first entry as they may be shown | the label's words |
| `entries` | `<label>:<entry>` | `{ text, num, num2, unit, shape, day, at, photos, from, locked?, date? }` | `"<day>\|<at>"` |
| `state` | `taught`, `firstDay`, `page` | said once | |
| `state` | `pending` | a number waiting for its word, with its photos | |
| `state` | `last` | what the last message kept, for undo | |
| `state` | `aliases`, `asked:<a>\|<b>` | names the person said are one, and pairs already asked | |
| `state` | `told:<label>:<day>:<when>` | a reminder already sent | |

At most 300 labels and 2000 values under each.

## Web page

`lockable`. The page is built in the Zelfred repo (`apps/web/src/pages/Digits.tsx`).

`load()` returns `{ labels: [{ id, name, count, current, first, touched, unit, series: [{ day, num, num2 }] }], max }`, the last added first. `series` is the last 60 values that have a number, oldest first; locked values are left out.

`load({ label })` returns `{ label: { id, name, count }, entries: [{ id, text, locked, num, num2, unit, shape, day, at, photos }] }`, newest first. A locked value's `text` is masked and its `num` null.

| Action | Arguments | What it does |
|---|---|---|
| `add` | `{ label }` or `{ name }`, `value`, `day?` | Keeps a value on any day up to today. Returns `{ label, entry }`. |
| `edit` | `label, entry, value?, day?` | Corrects a value, its day, or both. |
| `reveal` | `label, entry` | A hidden value whole: `{ text }`. The page calls it only behind the same unlock as a vault, the person's passkey or passphrase (the owner, 2026-11-26), once Zelfred has one lock for every page. |
| `remove` | `label, entry` | Takes one value out, with its photos. |
| `rename` | `label, name` | Renames a label; refused when another has the same words. |
| `removeLabel` | `label` | A label and everything under it. The page asks first. |
| `removeAll` | | Everything. The page asks first. |

## Privacy

- Values are private to the person: the group has only them and Zelfred, and the plugin has no "members" permission.
- No model ever sees a value. Our own matching reads every message. Only an unplaced question goes to the sorting model, with labels and each value's shape in words, after Zelfred takes every digit out.
- Card numbers and PINs are shown masked everywhere; whole only behind the vault's unlock (passkey or passphrase), once that lock reaches every page.
- Zelfred counts that the app was used (messages, answers), never a value or a label's text.
- Deleting a message for everyone forgets what it kept, photos included. The page removes any value, any label, or everything.
- Ordinary care, as for every app; no special handling of health numbers (the owner, 2026-11-26).
