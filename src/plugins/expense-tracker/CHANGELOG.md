# Changelog: TripExpenses

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
