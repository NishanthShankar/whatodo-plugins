# Changelog: Simple Expense Tracker

## [1.0.0] - 2026-11-23

### Added
- Send what you paid for and the amount (`lunch 450`), and it is kept and added up. Several lines in one message are several expenses.
- An amount with a currency (`dinner 20 usd`, `cab ₹300`) is kept in that currency. A trip's first plain amount asks which currency to count in, with your own first.
- Everyone in the group can send expenses. The list shows who sent what once more than one person has.
- `total`, `end trip`, `trips`, `name goa`, `currency usd`, `undo`.
- Reply to an expense with the right amount to correct it, or `delete` to remove it.

### Data
- Collections `trips`, `expenses` and `state`. Refs `{ kind: "expense", trip, ids }` on a person's own expense message and `{ kind: "currency", trip, codes }` on the currency question.
