# Changelog: Habits

All notable changes to this plugin. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## [1.6.1] - 2026-11-17

### Fixed
- The check-in starts with 🌱, Habits' own icon, instead of 🌙. The moon belongs to Period Tracker.

## [1.6.0] - 2026-11-17

### Changed
- With simple messages on (the `quickLog` setting), the check-in is just the habit's name and nothing else: no question, no squares, no hint. You react ✅, 👍 or ❌ as before. Sending just a habit's name still logs it.

### Added
- _simple on_ and _simple off_ turn it on and off. _quick log on_ and _quick log off_ still work.

### Data
- No change.

## [1.5.1] - 2026-11-17

### Changed
- The product is now called telcurio. This plugin's page title, description and wording use the new name. Nothing changes in how it works, and addresses like app.whatodo.today stay as they are.

## [1.5.0] - 2026-11-17

### Added
- Quick log, off by default. Turn it on with _quick log on_ (or on the web page), then send just a habit's name, like _meditate_, to log it for today. I react ✅. Only an exact name counts; anything else is read as before. _quick log off_ turns it off.

### Data
- New setting `quickLog` (default `false`). The web page data gains `quickLog`, and there's a `setQuickLog { on }` web action.

## [1.4.1] - 2026-11-16

### Fixed
- Habit names read from sentences drop "also", "just", "really", "kindly" and "and": "can you also track reading every day at 10pm" adds *Reading*, not *Also track reading*.

## [1.4.0] - 2026-11-16

### Added
- Understands messages that aren't exact commands, through telcurio's intent model (SDK 1.4.0): "I want to start going to the gym on mondays and thursdays", "finished my workout", "skipped reading today", "move gym to tuesdays", "check in with me at 8pm instead". Intents: add_habit, log_done, missed, undo_done, remove_habit, set_days, set_time, default_time, list, help. Targets are your habits by name. Names, days and times are read from the text by the plugin.
- When the text doesn't say which habit, days or time, it asks with the exact command.

### Changed
- A message it can't read goes to telcurio's intent model first (`kit.unsure`); "I didn't get that" is only sent when the model isn't sure either.

### Requires
- telcurio with SDK 1.4.0 intent support. On an older runtime nothing changes: unclear messages get "I didn't get that".

## [1.3.0] - 2026-11-16

### Added
- Habits can be for some days only: `add gym on mon wed fri`, `add walk at 7am on weekdays`, `days gym tue thu`, `days gym every day`. Day words: Mon to Sun (short or full), weekdays, weekends, every day / daily.
- The check-in only goes out on a habit's days.
- `habits` shows 📅 with the days for habits that aren't every day.
- Web: `setHabitDays` action (`days`: weekdays 0 Sunday to 6 Saturday, or null for every day), optional `days` on `create`, and `days` on each habit in `load`.

### Changed
- Streaks skip days a habit isn't due on, so a rest day doesn't break them; doing it on a rest day still counts. Best streak follows the same rule.
- The 🟩⬜ grid shows ▫️ for days a habit isn't due on.

### Data
- `habits` rows gain an optional `days` (array of 0-6, or null). Rows without it are every day; nothing to migrate.

## [1.2.0] - 2026-11-16

### Added
- React ❌ (or ✖️ ❎ 👎 🚫) to a check-in to say you didn't do it. It counts the same as no answer for streaks, but closes the day: that habit isn't asked again that day. Removing the ❌ reopens it, and `done read` still logs it later. Replying _no_ to a check-in closes the day the same way.
- Every reaction to a check-in gets a 👍 back, so you know it was recorded. Removing your reaction removes the 👍.

### Changed
- Check-in, welcome and help text mention ❌.

### Data
- New `missed` collection: key `<habitId>:<day>`, data `1`, sort = day. Nothing existing changes.

### Requires
- The telcurio runtime that delivers `kit.react` in `onReaction` (SDK 1.3.0). On an older runtime the 👍 is simply not sent.

## [1.1.2] - 2026-11-16

### Changed
- Marketplace text says "daily check-in at the time you pick" instead of "nightly", matching per-habit check-in times from 1.1.0.
- Adds its public page listing (search title, description and heading) for whatodo.today.

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
- telcurio copies habits kept in the private chat (before plugins) into these collections on install.
