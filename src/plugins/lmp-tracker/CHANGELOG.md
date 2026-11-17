# Changelog: Period Tracker (was LMP Tracker)

All notable changes to this plugin. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## [3.1.1] - 2026-11-17

### Changed
- Replies use everyday words: "your period started 9 Nov" instead of "your LMP has been recorded", "your periods" in the history, "usually come about every 28 days" instead of "usual cycle", and "home pregnancy test" without "urine" or "UPT". What you can send is unchanged, _LMP_ included.

## [3.1.0] - 2026-11-17

### Added
- A date on its own records that day: _yesterday_, _9 nov_, _3 days ago_. So does _period 9 nov_.

### Changed
- Messages, help and the store card now say to send _period_ or _today_ (both already worked) instead of _LMP_. _LMP_ still works everywhere it did.

### Data
- No change.

## [3.0.3] - 2026-11-17

### Changed
- Plainer words on the store card and the public page: the tagline, description and search description no longer say "last menstrual period" or "cycle". Nothing changes in the chat; you still send _LMP_.

## [3.0.2] - 2026-11-17

### Changed
- The plugin is now called Period Tracker instead of LMP Tracker: its name, help heading, welcome message, page title and the name of the WhatsApp group made for new installs ("🌙 Period Tracker"). Groups that already exist keep the name they have. The plugin id is still `lmp-tracker`, and you still send _LMP_ when your period starts.

## [3.0.1] - 2026-11-17

### Changed
- The product is now called telcurio. This plugin's page title, description and wording use the new name. Nothing changes in how it works, and addresses like app.whatodo.today stay as they are.

## [3.0.0] - 2026-11-16

A simpler tracker. It keeps one thing, your LMP, and reminds you when the next one is due.

### Changed
- `LMP` records your last menstrual period (LMP). No date means today (`lmp`, `today`, `now`, `periods came`); add one only if it started another day (`LMP 9 nov`). In 2.x `lmp <date>` started pregnancy tracking.
- The first LMP you send is confirmed in words. After that a clear LMP just gets a 👍; words come back only when a date changes an LMP already recorded or something isn't clear.
- Reminders follow your LMP: when the next period is due (4 weeks), again a week later (5 weeks), and then a nudge that you might be pregnant and to take a home pregnancy test (6 weeks). Each is sent once per LMP, and a new LMP starts over.
- The timing is learned from your own dates. If your periods keep coming every 5 weeks, the reminders move to 5, 6 and 7 weeks. One late month doesn't move them, and the test nudge never comes earlier than a week past your longest recent cycle.
- Pregnancy is now just a mode: say `pregnant` (or `yes` to the test nudge) and the reminders stop. Your LMP stays the same LMP. When you send an LMP again, pregnancy mode ends and tracking carries on.
- In pregnancy mode a bare `lmp` is not guessed at. It asks whether you want to see your last LMP (`1`) or record a new one (`2`). Recording ends pregnancy mode and tracking carries on, so a miscarriage, an abortion or the birth needs no special command.
- A plain `yes`, `not yet` or `no` is read as the answer to the last reminder; you don't have to reply to the message itself.

### Added
- Messages are marked with 🩸 instead of 🌸. Right after your first LMP it asks once if that's OK: reply `no` for 🌙, and no reply means yes. `moon` and `blood` switch any time. New installs get a group named "🌙 LMP Tracker"; existing groups keep their name.
- Ask for your LMP any way you like: `last lmp`, `when was my last lmp?`, `lmp?`.
- Sentences the commands don't cover ("my periods came on 9th nov") go to intent understanding.

### Removed
- Fertile window, ovulation and the fertile reminder.
- `period ended` (it says only the start is needed), `cycle length <days>` (the cycle is learned) and the day 27/28 check-ins.
- The pregnancy tracker's weekly updates, trimester and month, and the `due date <date>` and `week` commands. `last lmp` shows how far along you are. A fuller pregnancy helper will come in a later version.

### Data
- `periods`: same shape. Rows from 2.x may still carry `end`; it's ignored.
- `pregnancy`: now `{ since }`. It holds no LMP; the LMP is always the latest in `periods`. `onUpgrade` moves a 2.x pregnancy's `lmp` into `periods`.
- `sent` keys are now `due:<lmp>`, `again:<lmp>`, `upt:<lmp>`, plus `first-lmp`; older keys are left alone.
- New collection `pending` (keys `ask` and `symbol`, `{ day }`).
- New refs `lmp-due` and `lmp-upt` (`date` is the LMP) and `lmp-ask` and `lmp-symbol` (`date` is the day she wrote). 1.x and 2.x refs (`period-soon`, `period-check`, `period-late`) are still answered.
- New setting `symbol` (`blood` or `moon`, default `blood`).
- The `fertileReminders` setting is no longer read. `cycleLength` is the cycle assumed until yours is learned.

## [2.0.0] - 2026-11-16

### Changed
- Period reminders are now check-ins on the last two days of your usual cycle (days 27 and 28 of a 28-day cycle; they follow your average cycle): "Day 27 of your cycle. Has your period started?" so the start always gets logged.
- Reacting ✅ (or 👍) to a check-in logs today as the start; removing the reaction takes it back. Replying `started` still works.

### Removed
- The "your period may start in about 2 days" message.

### Data
- No stored data changes. Messages sent by 1.x (refs of kind `period-soon`) are still understood.

## [1.1.0] - 2026-11-16

### Added
- Pregnancy answers and weekly updates include the month (approximate, 1st to 9th, as commonly counted in India).
- A note when an LMP is under 2 weeks ago (early; test after a missed period) or 42 weeks or more (check in with your doctor).
- Public page listing (search title, description and heading) for whatodo.today.

### Data
- No change.

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
