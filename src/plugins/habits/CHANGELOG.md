# Changelog: Habits

All notable changes to this plugin. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## [1.1.1] - 2026-11-16

### Changed
- Declares its platform cost tier: tier 1 (stores a little data, posts a few messages a day). Nothing changes for people using it.

## [1.1.0] - 2026-11-16

### Added
- Each habit can have its own check-in time: `add read at 10pm`, `time meditate 7am`, `time meditate default`. Habits without one are asked at the default check-in time.
- `habits` shows ⏰ next to habits with their own time.
- Web: `setHabitHour` action and an `hour` field on each habit in `load`.

### Changed
- Check-ins run on an hourly schedule (`checkin`) instead of one nightly schedule (`nightly`), so each habit can be asked at its own hour.
- `time 10pm` now sets the default check-in time; `time off` turns the default off (habits with their own time are still asked).

### Data
- `habits` rows gain an optional `hour` (0-23 or null). Existing rows need no change.

## [1.0.0] - 2026-11-16

### Added
- First release as a plugin, in its own WhatsApp group ("🌱 Habits").
- Commands: `add <habit>`, `habits`, `done <habit>`, `undo <habit>`, `stop <habit>`, `time <hour>`, `time off`, `help`.
- Nightly check-in, one message per habit not yet done that day; reacting ✅ 👍 💪 🔥 logs it, removing the reaction undoes it, replying yes/no works too.
- Streaks (days in a row, today not breaking it until answered), best streak, 🟩⬜ grids.
- Web page (lockable with the person's PIN): 30-day grid per habit, tick any past day, add, rename, stop tracking, check-in time.

### Data
- `habits`: key habit id, `{ name, createdDay, archived }`, sort created time.
- `logs`: key `<habitId>:<day>`, `1`, sort day.
- whatodo copies habits kept in the private chat (before plugins) into these collections on install.
