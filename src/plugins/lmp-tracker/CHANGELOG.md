# Changelog: LMP Tracker

All notable changes to this plugin. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-11-16

### Added
- First release, in its own WhatsApp group ("🌸 LMP Tracker").
- Periods: `period started` / `period ended` with dates like `today`, `yesterday`, `12 nov`, `12/11`; `cycle` (next period or days late, fertile window, likely ovulation, average cycle and period length); `history`; `undo`; `delete <date>`; `cycle length <days>`.
- Pregnancy: `lmp <date>` or `due date <date>` (Naegele's rule) with weeks and days, trimester and due date; `week`; `not pregnant`.
- Daily schedule at `reminderHour`: "may start in about 2 days", one "3 days late" nudge, optional fertile window reminder; in pregnancy, an update each new week. Each sent once. Replying `started` to a period reminder logs the start.
- Settings: `reminderHour`, `cycleLength`, `periodReminders`, `fertileReminders`.

### Data
- `periods`: key start day, `{ start, end? }`, sort start day.
- `pregnancy`: key `current`, `{ lmp, since }`. Deleted by `not pregnant`.
- `sent`: key `<kind>:<day>`, `1`, sort day.
