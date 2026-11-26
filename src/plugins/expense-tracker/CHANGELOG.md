# Changelog: TripExpenses

## [1.10.0] - 2026-11-26

### Added
- Once people have made two emoji groups on a trip, an expense nobody reacts to within half a minute is put in the group it fits, by Zelfred's sorting model, going by what people put in each group. The emoji takes the place of my 👍 on its message. A reaction always wins, before or after, and only groups people made describe a group. Needs the new `sort` permission (SDK 1.32.0).

### Data
- An expense may carry `sorted: true` while its mark was put by sorting. A reaction or the page clears it.

## [1.9.0] - 2026-11-25

### Added
- Two more ways to take an expense out. React to it with ❌ (also 🗑️ or 🚫): anyone in the group can, and my 👍 comes off the message. Or delete your message for everyone in WhatsApp, and the expenses it held go with it. A closed trip keeps its expenses either way.

### Fixed
- The README's Privacy section said nothing is sent to a model. Since 1.8.0 a message the app can't read is passed to Zelfred's own model to work out what was meant.

## [1.8.0] - 2026-11-25

### Added
- When expenses keep arriving between 3am and 5am by the trip's clock (the third message with one), and nobody has said where the trip is, it asks once whether they have travelled or are up late. The reply is read by the intent model, in whatever words: at home gets a 👍 and it is not asked again; travelling gets "What time is it there, exactly?", and the time or a place puts the trip on that clock.
- The app now declares `understand` (travelling, home, other), used only for that reply.

### Data
- A trip may carry `zoneBy`, `odd`, `timeAsked` and `timeTries`.

## [1.7.0] - 2026-11-25

### Added
- The split is sent by itself at 9pm, on the trip's own clock, on a day something was spent and someone owes: always with more than two people on the trip, and with two once they ask for a `split` or give an expense to the other by tagging them. `split off` stops it, with a note that `split` still works when asked; `split on` starts it.
- `next` (also `who?`, `who next`, `whose turn`, `who pays`) says who should pay next to even things out: whoever is furthest under an equal share.
- `split`, the nightly split and the page name that person too.
- A trip has its own clock, for trips abroad. It moves by itself when the trip is counted in a currency that isn't the person's own and is spent in one time zone (baht, yen, dirhams), and anyone can set it: `time zone tokyo`, `time zone +7`, or `it's 9pm here`. `time zone` alone says what it is. The trip's days and the hour of its split follow it.

### Data
- A trip may carry `zone`. An expense sent while its trip has one keeps `day`, the day it was there; when a trip's zone is set, its earlier expenses are stamped with the days they had.

## [1.6.0] - 2026-11-25

### Added
- Who owes whom. `split` (also `settle`, `tally`, `who owes`) shares the open trip's cost equally among everyone on it and says the fewest payments that settle it, like "Ravi pays Asha ₹75". The same lines close the list when a trip ends, and the page shows them. Each currency is settled on its own.
- Who is on a trip: everyone who spent something, and everyone who wrote, reacted or was tagged in its group while it was open.

### Data
- A trip may carry `crew` (the ids of the people on it besides those who spent). A trip from before is shared by the people who spent on it.

## [1.5.0] - 2026-11-25

### Added
- Who spent it can be changed. Whoever sends an expense spent it; reply to it and tag someone to make it theirs, or reply `mine` (also `me`, `I paid`) to take it. Anyone in the group may, and a closed trip takes it too. The page's sheet for an expense has it as well, among the people already on the trip.
- An expense given to someone whose name isn't known yet (they were tagged before they ever wrote) shows their name by itself from the first time they write, react or answer in the group.
- The page gets a trip's numbers for graphs: what each day, emoji, label and person adds up to, the average per day and the largest expense, in the trip's own currency, with what was paid in other currencies said beside them.
- The page is told the labels and emoji used so far, to offer when one is being set.

### Data
- New collection `people`: the name each person was last heard under, by their id.
- A trip that ends keeps `used` (the labels and emoji its expenses carried). An expense's `by` and `name` now mean who spent it. Nothing stored before changes.

## [1.4.0] - 2026-11-24

### Added
- React to an expense with an emoji and it joins that emoji's group. `total` and the page add up each group, and the page can show the expenses group by group.

### Data
- An expense may carry `mark` (the emoji). Nothing stored before changes.

## [1.3.0] - 2026-11-24

### Added
- A photo of the bill is kept with its expense: send the photo with the expense as its caption, or reply to an expense with the photo. Reply `bill` to see it. On the page a bill can be added, looked at and taken away.
- Labels: `lunch 450 #food`, or reply `#food` to an expense. `total` and the page add up each label.
- On the page, the day an expense was paid can be changed, and its labels set.

### Changed
- New permission: `photos`. A photo that is not a bill is deleted at once and nothing is said.

### Data
- An expense may carry `day` ("YYYY-MM-DD"), `tags` and `bill` (the photo's id). New `state` key `taughtBill`. Nothing stored before changes.

## [1.2.0] - 2026-11-24

### Added
- A page: the open trip with its expenses and total, what each person sent, and the trips that ended, for every group it runs in. An expense can be taken out of the open trip there.
- The amount first now also reads with a mark or "for" after it: `450: lunch`, `450 for lunch`.

### Changed
- The welcome, the help and the note about the format say the amount can come first: `450 lunch`.
- Its page on the site no longer has "WhatsApp" in its title and heading.

## [1.1.0] - 2026-11-24

### Added
- A new description for the group starts a new trip, called what you wrote. The trip that was open is closed and shown first. A new group name does the same.
- It can be chosen for a WhatsApp group you already have. Each group keeps its own trips.

### Changed
- The app is called TripExpenses, like its group. It was "Simple Expense Tracker".
- New permission: `groups`, to take a group the person already had.

### Data
- Trips made in a handed-over group carry `home` (the group's key). New collection `homes`. `state` keys for such a group end in `@<group key>`. Nothing stored by 1.0.0 changes.

## [1.0.0] - 2026-11-23

### Added
- Send what you paid for and the amount (`lunch 450`), and it is kept and added up. Several lines in one message are several expenses.
- An amount with a currency (`dinner 20 usd`, `cab ₹300`) is kept in that currency. A trip's first plain amount asks which currency to count in, with your own first.
- Everyone in the group can send expenses. The list shows who sent what once more than one person has.
- `total`, `end trip`, `trips`, `name goa`, `currency usd`, `undo`.
- Reply to an expense with the right amount to correct it, or `delete` to remove it.

### Data
- Collections `trips`, `expenses` and `state`. Refs `{ kind: "expense", trip, ids }` on a person's own expense message and `{ kind: "currency", trip, codes }` on the currency question.
