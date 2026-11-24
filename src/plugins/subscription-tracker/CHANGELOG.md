# Changelog: SubscriptionTracker

## [1.0.0] - 2026-11-24

### Added
- Tell it what you pay for (`Netflix 649 monthly on the 5th`) or forward your bank's message, and it is kept.
- Tell it what runs out (`car insurance 14 Feb`, `passport expires 3 March 2031`): told early by how far away the date is, the day before, and after the date until it is marked done.
- A list of what renews each week, on Sunday evening by default, only when something does. A word the day before every renewal.
- Before a renewal of something you could drop: "Did you use it this month?" After two "Not at all" in a row, where to cancel it.
- Free trials: told two days before they start charging.
- `list`, `this week`, `remove`, `done`, `don't ask`, `kind`, `currency`. Reply to a message about one thing with an amount or a date to correct it.
- A 👍 on a notice about something that expires is asked about once (done, or just okay), learnt per person, and can be changed on the page.

### Data
- Collections `subs`, `thumbs` and `state`. Settings `weeklyDay` and `weeklyHour`. Refs of kinds `sub`, `notice`, `use`, `kind`, `thumb`, `next`, `currency` and `bank`.
