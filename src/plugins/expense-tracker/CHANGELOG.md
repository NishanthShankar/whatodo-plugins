# Changelog: TripExpenses

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
